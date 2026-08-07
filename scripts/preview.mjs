import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 43128;
const HEALTH_PATH = "/__open_daily_health__";
const HEALTH_MARKER = "open-daily-preview-v1";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(rootDir, "index.html");

function writeText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function isExistingPreview() {
  try {
    const response = await fetch(`http://${HOST}:${PORT}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok && (await response.text()) === HEALTH_MARKER;
  } catch {
    return false;
  }
}

if (await isExistingPreview()) {
  console.log(`open-daily preview already running: http://${HOST}:${PORT}/`);
  process.exit(0);
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    writeText(response, 405, "Method Not Allowed\n");
    return;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  if (requestUrl.pathname === HEALTH_PATH) {
    writeText(response, 200, request.method === "HEAD" ? "" : HEALTH_MARKER);
    return;
  }
  if (requestUrl.pathname !== "/" && requestUrl.pathname !== "/index.html") {
    writeText(response, 404, "Not Found\n");
    return;
  }

  try {
    const html = await readFile(indexPath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": html.byteLength,
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : html);
  } catch {
    writeText(response, 500, "index.html could not be read\n");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`port ${PORT} is already in use; leaving it untouched`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`open-daily preview: http://${HOST}:${PORT}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
