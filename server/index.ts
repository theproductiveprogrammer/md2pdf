#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build as viteBuild, createServer as createVite } from "vite";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(APP_DIR, "dist");
// Everything the built app is made from; if any of it is newer than the build, rebuild.
const BUILD_INPUTS = ["src", "index.html", "examples/welcome.md", "package-lock.json"];
const PAGED_POLYFILL = path.join(APP_DIR, "node_modules/pagedjs/dist/paged.polyfill.js");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif",
  ".css": "text/css", ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".json": "application/json", ".map": "application/json", ".md": "text/markdown; charset=utf-8",
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

async function newestMtime(target: string): Promise<number> {
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.mtimeMs;
  const entries = await fs.readdir(target);
  const times = await Promise.all(entries.map((e) => newestMtime(path.join(target, e))));
  return Math.max(stat.mtimeMs, ...times);
}

// The problem is serving the app through Vite's dev server makes pages go blank with "504 Outdated Optimize Dep" whenever
// Vite re-bundles its dependencies (after a restart or code change) while a tab still holds the old bundle versions.
// The way we solve this is to serve a pre-built copy of the app, rebuilding it at startup only when the source is newer.
// flow: terminal — user runs `md2pdf [file]` -> main() -> ensureBuilt() <-- HERE
async function ensureBuilt() {
  const built = await fs.stat(path.join(DIST_DIR, "index.html")).catch(() => null);
  const newest = Math.max(...(await Promise.all(BUILD_INPUTS.map((p) => newestMtime(path.join(APP_DIR, p))))));
  if (built && built.mtimeMs >= newest) return;
  process.stdout.write("md2pdf  building the app (only after code changes)… ");
  await viteBuild({ root: APP_DIR, logLevel: "warn", build: { outDir: DIST_DIR, emptyOutDir: true, chunkSizeWarningLimit: 4000 } });
  console.log("done");
}

// Understand: hashed /assets/* files never change, so browsers may cache them forever; index.html must always be fresh so a
// rebuild is picked up on the next reload.
async function serveBuilt(req: http.IncomingMessage, res: http.ServerResponse) {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const abs = safeResolve(DIST_DIR, pathname === "/" ? "index.html" : pathname.slice(1));
  const file = abs && (await fs.readFile(abs).catch(() => null));
  if (!abs || !file) return send(res, 404, "not found");
  const immutable = pathname.startsWith("/assets/");
  res.writeHead(200, {
    "content-type": MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-store",
  });
  res.end(file);
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

// Understand: `--dev` runs the app through Vite's dev server with live reload, for working on md2pdf itself; everyone else
// gets the pre-built app (see ensureBuilt).
// flow: terminal — user runs `md2pdf [folder|file] [--dev] [--no-open]` -> main() <-- HERE
async function main() {
  const args = process.argv.slice(2);
  const noOpen = args.includes("--no-open");
  const dev = args.includes("--dev");
  const { root, doc } = await parseTarget(args.find((a) => !a.startsWith("--")));

  const server = http.createServer();
  let appHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>;
  if (dev) {
    const vite = await createVite({ root: APP_DIR, appType: "spa", server: { middlewareMode: true, hmr: { server } } });
    appHandler = (req, res) => vite.middlewares(req, res);
  } else {
    await ensureBuilt();
    appHandler = serveBuilt;
  }

  server.on("request", async (req, res) => {
    try {
      if (await handleApi(root, doc, req, res)) return;
      await appHandler(req, res);
    } catch (err) {
      send(res, 500, String(err));
    }
  });

  const port = await listen(server, 4848);
  const url = `http://localhost:${port}/`;
  console.log(`md2pdf  root: ${root}${doc ? `  doc: ${doc}` : ""}${dev ? "  (dev mode)" : ""}\n        ${url}`);
  if (!noOpen) spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
