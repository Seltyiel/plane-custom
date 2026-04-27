#!/usr/bin/env node
/*
 * Plane-custom diagnostic server.
 *
 * Riceve log dal browser (dlog -> fetch POST /log) e li appende a
 * diagnostic.log accanto a questo file, cosi' Claude puo' leggerli
 * direttamente senza dover chiedere copia-incolla dalla console.
 *
 * USO:
 *   node diagnostic-server.js
 * Stop con Ctrl+C.
 *
 * Endpoint:
 *   POST /log    -> appende JSON al log
 *   POST /clear  -> azzera il log
 *   GET  /health -> OK
 *
 * CORS aperto (Access-Control-Allow-Origin: *) perche' il browser in
 * http://localhost (Plane) deve poter fare fetch cross-origin a
 * http://localhost:9999.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 9999;
const LOG_PATH = path.join(__dirname, "diagnostic.log");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function writeLine(obj) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n");
  } catch (e) {
    console.error("[diagnostic-server] append failed:", e);
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { ...CORS, "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  if (req.method === "POST" && req.url === "/log") {
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body || "{}");
      parsed.serverTs = new Date().toISOString();
      writeLine(parsed);
    } catch (_e) {
      writeLine({
        serverTs: new Date().toISOString(),
        error: "parse-failed",
        raw: body,
      });
    }
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/clear") {
    fs.writeFileSync(
      LOG_PATH,
      "=== cleared " + new Date().toISOString() + " ===\n"
    );
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  res.writeHead(404, CORS);
  res.end();
});

// Reset log al boot
fs.writeFileSync(
  LOG_PATH,
  "=== diagnostic-server started " + new Date().toISOString() + " ===\n"
);

server.listen(PORT, () => {
  console.log(`[diagnostic-server] listening on http://localhost:${PORT}`);
  console.log(`[diagnostic-server] writing to ${LOG_PATH}`);
  console.log("[diagnostic-server] Ctrl+C to stop");
});
