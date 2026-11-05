// Local test copy of the whole system, no internet needed for the data:
//   - Postgres (PGlite) with the real schema from supabase/migrations
//   - the real Edge Function (supabase/functions/api) running under Deno
//   - small stand-ins for Supabase Auth (admin email sign-in) and Storage (photos)
//   - the app itself on http://localhost:8080
//
//   npm install          (once)
//   npm run demo         fresh demo data: admins <name>@demo.local / any password, the OCO is the super admin email,
//                        checklist users HR D1001 … D1010
//   npm run dev          empty database (the super admin's account is created when they first sign in)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import net from "node:net";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = (n) => path.join(root, "node_modules", ".bin", n);
const PG_PORT = 54329, FN_PORT = 8000 /* Deno.serve default */, PORT = Number(process.env.PORT || 8080);
const DB = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`;
const demo = process.argv.includes("--demo");
const kids = [];
const stop = () => { kids.forEach((k) => k.kill()); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Postgres
kids.push(spawn(bin("pglite-server"), ["-p", String(PG_PORT)], { stdio: "ignore" }));
for (let i = 0; i < 60; i++) {
  const ok = await new Promise((r) => { const c = net.connect(PG_PORT, "127.0.0.1"); c.on("connect", () => { c.end(); r(true); }); c.on("error", () => r(false)); });
  if (ok) break;
  await wait(500);
}
{
  const sql = postgres(DB, { max: 1 });
  let schema = "";
  for (const f of fs.readdirSync(path.join(root, "supabase/migrations")).sort()) schema += fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8") + "\n";
  schema = "create schema if not exists storage; create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);\n"
    + schema.replace(/^(revoke|alter default|grant).*$/gm, "");
  await sql.unsafe(schema);
  await sql`insert into grooming.props (key, value) values ('IMPORT_KEY', 'local') on conflict (key) do nothing`;
  await sql.end();
}

// 2. The Edge Function
kids.push(spawn(bin("deno"), ["run", "-A", "--node-modules-dir=none", path.join(root, "supabase/functions/api/index.ts")], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, SUPABASE_DB_URL: DB, SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_SERVICE_ROLE_KEY: "local", DB_POOL: "1" },
}));
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${FN_PORT}`); break; } catch { await wait(1000); } }
if (demo) {
  const r = await fetch(`http://127.0.0.1:${FN_PORT}`, { method: "POST", body: JSON.stringify({ fn: "loadDemo", key: "local" }) }).then((x) => x.json());
  console.log("demo data:", JSON.stringify(r.counts || r));
}

// 3. Stand-ins for Supabase Auth + Storage, and the site
const objects = new Map();
const accounts = new Map();          // email -> password (local: accounts are confirmed straight away)
const tokens = new Map();            // access/refresh token -> email
const userOf = (email) => ({ id: crypto.createHash("md5").update(email).digest("hex"), aud: "authenticated", role: "authenticated", email, email_confirmed_at: "2026-01-01T00:00:00Z", confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
const session = (email) => {
  const access = "eyJ" + crypto.randomBytes(12).toString("hex") + ".eyJ" + crypto.randomBytes(12).toString("hex") + ".local";
  const refresh = crypto.randomBytes(16).toString("hex");
  tokens.set(access, email); tokens.set(refresh, email);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refresh, user: userOf(email) };
};
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const body = await new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });
  const json = (o, status = 200) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(o)); };
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); res.end(); return; }
  if (u.pathname.startsWith("/storage/v1/object/")) {
    const k = u.pathname.slice(19);
    if (req.method === "POST") { objects.set(k, { type: req.headers["content-type"], body }); return json({}); }
    const o = objects.get(k);
    if (!o) return json({ error: "not found" }, 404);
    res.writeHead(200, { "content-type": o.type }); res.end(o.body); return;
  }
  if (u.pathname.startsWith("/auth/v1/")) {
    const p = u.pathname.slice(9), b = body.length ? JSON.parse(body.toString()) : {};
    const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
    if (p === "token" && u.searchParams.get("grant_type") === "password") {
      const email = String(b.email || "").toLowerCase();
      const ok = accounts.get(email) === b.password || (/@demo\.local$/.test(email) || demo) && b.password === "demo1234";
      return ok ? json(session(email)) : json({ error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" }, 400);
    }
    if (p === "token" && u.searchParams.get("grant_type") === "refresh_token") return tokens.has(b.refresh_token) ? json(session(tokens.get(b.refresh_token))) : json({ msg: "Invalid Refresh Token" }, 400);
    if (p === "signup") { const email = String(b.email).toLowerCase(); accounts.set(email, b.password); return json(userOf(email)); }
    if (p === "recover") return json({});
    if (p === "logout") { tokens.delete(bearer); res.writeHead(204); res.end(); return; }
    if (p === "user") {
      const email = tokens.get(bearer);
      if (!email) return json({ msg: "invalid JWT" }, 401);
      if (req.method === "PUT" && b.password) accounts.set(email, b.password);
      return json(userOf(email));
    }
    return json({ msg: "not here" }, 404);
  }
  if (u.pathname === "/api") {
    const r = await fetch(`http://127.0.0.1:${FN_PORT}`, { method: "POST", body, headers: { "content-type": "text/plain" } });
    res.writeHead(r.status, { "content-type": "application/json" }); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (f.endsWith("/")) f += "index.html";
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
}).listen(PORT, () => console.log(`Grooming running on http://localhost:${PORT}`));
