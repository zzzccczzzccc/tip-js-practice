import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const HOST = "127.0.0.1";
const DEFAULT_PORT = 5506;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = resolve(join(ROOT, relative));
  const rootWithSep = ROOT.endsWith(sep) ? ROOT : `${ROOT}${sep}`;

  if (full !== ROOT && !full.startsWith(rootWithSep)) {
    return null;
  }

  return normalize(full);
}

export function createStaticServer() {
  return createServer(async (request, response) => {
    const filePath = safePath(request.url ?? "/");

    if (filePath === null) {
      response.writeHead(403).end("Forbidden");

      return;
    }

    try {
      const body = await readFile(filePath);

      response.writeHead(200, {
        "Content-Type": TYPES[extname(filePath)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

export function startStaticServer(port = DEFAULT_PORT) {
  const server = createStaticServer();

  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      resolveListen({ server, port, origin: `http://${HOST}:${port}` });
    });
  });
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  startStaticServer(Number(process.argv[2] ?? DEFAULT_PORT)).then(({ origin }) => {
    console.log(origin);
  });
}
