// Готовый локальный сервер статических файлов практической работы.
// Он только отдаёт файлы этой папки браузеру: API задач здесь нет и изменения не сохраняются.
// Сервер привязан к 127.0.0.1 и предназначен только для локальной работы.

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 5504;
const HOST = "127.0.0.1";
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function parsePort(value) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return DEFAULT_PORT;
  }

  return port;
}

/** Преобразует путь запроса в безопасный путь внутри папки практической работы. */
function resolveRequestPath(requestUrl) {
  const { pathname } = new URL(requestUrl, `http://${HOST}`);
  const decoded = decodeURIComponent(pathname);
  const relative = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const candidate = resolve(join(ROOT, relative));

  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    return null;
  }

  return candidate;
}

async function resolveFile(path) {
  try {
    const info = await stat(path);

    if (info.isDirectory()) {
      const indexPath = join(path, "index.html");
      const indexInfo = await stat(indexPath);

      return indexInfo.isFile() ? indexPath : null;
    }

    return info.isFile() ? path : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");

    return;
  }

  const candidate = resolveRequestPath(request.url);
  const filePath = candidate === null ? null : await resolveFile(candidate);

  if (filePath === null) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");

    return;
  }

  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });

  if (request.method === "HEAD") {
    response.end();

    return;
  }

  createReadStream(filePath).pipe(response);
});

const port = parsePort(process.argv[2] ?? DEFAULT_PORT);

server.listen(port, HOST, () => {
  console.log(`http://${HOST}:${port}/`);
  console.log("Остановить сервер: Ctrl+C");
});
