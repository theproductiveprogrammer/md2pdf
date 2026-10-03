import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGED_POLYFILL = path.join(APP_DIR, "node_modules/pagedjs/dist/paged.polyfill.js");

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

// The problem is the browser app needs to read/save the markdown and load images sitting next to it on disk.
// The way we solve this is a tiny API (/api/session, /api/doc, /files/*) answered before Vite sees the request.
// flow: Write tab — user opens app -> loadSession() -> GET /api/session -> handleApi() <-- HERE
// flow: Write tab — user presses ⌘S -> saveDoc() -> PUT /api/doc -> handleApi() <-- HERE
// flow: Preview tab — iframe loads ./img.png -> GET /files/* -> handleApi() <-- HERE
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
