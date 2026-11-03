// Local test server: serves the app and runs the Google Apps Script backend in Node.
//   node dev/server.mjs            (empty data, login admin / 1234)
//   node dev/server.mjs --demo     (fresh demo data, all PINs 1234)
// Then open http://localhost:8080  (config.js is pointed at /api automatically on localhost).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBackend } from "./gas.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(root, "dev", "data.json");
const photoDir = path.join(root, "dev", "photos");
if (process.argv.includes("--demo") && fs.existsSync(dataFile)) fs.rmSync(dataFile);
const backend = loadBackend({ dataFile, photoDir });
if (process.argv.includes("--demo")) console.log(backend.run("loadDemoData"));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT || 8080);
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api") {
    if (req.method !== "POST") { res.end(JSON.stringify({ ok: true })); return; }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let out;
      try { out = backend.post(body); } catch (e) { out = JSON.stringify({ ok: false, error: "error", detail: String(e) }); console.error(e); }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(out);
    });
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || file.includes(`${path.sep}dev${path.sep}`) || file.includes(`${path.sep}setup${path.sep}`)) { res.writeHead(404); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`ABFM Grooming running at http://localhost:${port}`));
