#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGED_POLYFILL = path.join(APP_DIR, "node_modules/pagedjs/dist/paged.polyfill.js");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif",
  ".css": "text/css", ".js": "text/javascript", ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
};

// The problem is the user launches md2pdf on a folder or a single .md file and expects relative images to just work.
// The way we solve this is to treat the folder as a root that every /files and /api/doc path is resolved against.
// flow: terminal — user runs `npm run dev -- ~/docs/report.md` -> parseTarget() <-- HERE
async function parseTarget(arg: string | undefined): Promise<{ root: string; doc: string | null }> {
  const target = path.resolve(arg ?? process.cwd());
  const stat = await fs.stat(target);
  if (stat.isDirectory()) return { root: target, doc: null };
  return { root: path.dirname(target), doc: path.basename(target) };
}

// The problem is a crafted path like /files/../../.ssh/id_rsa would escape the folder the user chose.
// The way we solve this is to resolve inside the root and refuse anything that lands outside it.
function safeResolve(root: string, rel: string): string | null {
  const abs = path.resolve(root, rel);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

function send(res: http.ServerResponse, status: number, body: string | Buffer, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function readBytes(req: http.IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

// The problem is two dropped screenshots both called "image.png" must not overwrite each other.
// The way we solve this is to append -1, -2… until the name is free; the exclusive "wx" flag makes the check and write atomic.
async function writeUnique(dir: string, name: string, data: Buffer): Promise<string> {
  const ext = path.extname(name);
  const stem = path.basename(name, ext).replace(/[^\w.-]+/g, "-") || "image";
  for (let i = 0; ; i++) {
    const candidate = i ? `${stem}-${i}${ext}` : `${stem}${ext}`;
    try {
      await fs.writeFile(path.join(dir, candidate), data, { flag: "wx" });
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
}

// The problem is the browser app needs to read/save the markdown and load images sitting next to it on disk.
// The way we solve this is a tiny API (/api/session, /api/doc, /api/upload, /files/*) answered before Vite sees the request.
// flow: Write tab — user opens app -> loadSession() -> GET /api/session -> handleApi() <-- HERE
// flow: Write tab — user presses ⌘S -> saveDoc() -> PUT /api/doc -> handleApi() <-- HERE
// flow: Preview tab — iframe loads ./img.png -> GET /files/* -> handleApi() <-- HERE
// flow: Write tab — user drops/pastes an image -> uploadImage() -> POST /api/upload -> handleApi() <-- HERE
async function handleApi(root: string, doc: string | null, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/api/session") {
    send(res, 200, JSON.stringify({ root, doc }), "application/json");
    return true;
  }

  if (url.pathname === "/vendor/paged.polyfill.js") {
    send(res, 200, await fs.readFile(PAGED_POLYFILL), MIME[".js"]);
    return true;
  }

  if (url.pathname === "/api/doc") {
    const abs = safeResolve(root, url.searchParams.get("path") ?? "");
    if (!abs) return send(res, 403, "outside root"), true;
    if (req.method === "PUT") {
      await fs.writeFile(abs, await readBody(req), "utf8");
      send(res, 204, "");
    } else {
      try {
        send(res, 200, await fs.readFile(abs, "utf8"), MIME[".md"]);
      } catch {
        send(res, 404, "not found");
      }
    }
    return true;
  }

  if (url.pathname === "/api/upload" && req.method === "POST") {
    const docDir = url.searchParams.get("dir") ?? "";
    const name = path.basename(url.searchParams.get("name") ?? "image.png");
    if (!IMAGE_EXT.has(path.extname(name).toLowerCase())) return send(res, 415, "not an image"), true;
    const assetsDir = safeResolve(root, path.join(docDir, "assets"));
    if (!assetsDir) return send(res, 403, "outside root"), true;
    const body = await readBytes(req, MAX_UPLOAD_BYTES);
    if (!body) return send(res, 413, "image too large"), true;
    await fs.mkdir(assetsDir, { recursive: true });
    const fileName = await writeUnique(assetsDir, name, body);
    send(res, 201, JSON.stringify({ path: `./assets/${fileName}` }), "application/json");
    return true;
  }

  if (url.pathname.startsWith("/files/")) {
    const abs = safeResolve(root, decodeURIComponent(url.pathname.slice("/files/".length)));
    if (!abs) return send(res, 403, "outside root"), true;
    try {
      const type = MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
      send(res, 200, await fs.readFile(abs), type);
    } catch {
      send(res, 404, "not found");
    }
    return true;
  }

  return false;
}

// Understand: if the port is taken we walk up to the next one rather than failing, so two docs can be open at once.
function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") resolve(listen(server, port + 1));
      else reject(err);
    });
    server.listen(port, "127.0.0.1", () => resolve(port));
  });
}

// flow: terminal — user runs `npm run dev -- <folder|file>` -> main() <-- HERE
async function main() {
  const args = process.argv.slice(2);
  const noOpen = args.includes("--no-open");
  const { root, doc } = await parseTarget(args.find((a) => !a.startsWith("--")));

  const server = http.createServer();
  const vite = await createVite({
    root: APP_DIR,
    appType: "spa",
    server: { middlewareMode: true, hmr: { server } },
  });

  server.on("request", async (req, res) => {
    try {
      if (await handleApi(root, doc, req, res)) return;
    } catch (err) {
      return send(res, 500, String(err));
    }
    vite.middlewares(req, res);
  });

  const port = await listen(server, 4848);
  const url = `http://localhost:${port}/`;
  console.log(`md2pdf  root: ${root}${doc ? `  doc: ${doc}` : ""}\n        ${url}`);
  if (!noOpen) spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
