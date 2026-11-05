// ABFM Grooming backend on Supabase.
// Runs the backend logic from setup/grooming-backend.gs (built into backend.js) with the Google services it
// was written for replaced by Postgres (tables in the private "grooming" schema) and Supabase Storage (photos).
// Each request: load the tables into memory, run the request, write back what changed, all in one
// transaction. Writes take a lock so two phones can't save the same check twice.
//
// The function checks PINs and session tokens itself, so it is deployed with verify_jwt off.
import postgres from "npm:postgres@3.4.5";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { create } from "./backend.js";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: Number(Deno.env.get("DB_POOL") || 4), prepare: false, idle_timeout: 20 });
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "grooming-photos";
const TZ = "Asia/Dubai";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};
const reply = (o: unknown, status = 200) =>
  new Response(typeof o === "string" ? o : JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Table names and columns, taken from the backend itself.
const SCHEMA: Record<string, string[]> = create({} as any).TABLES;
const tbl = (name: string) => `grooming.${name.toLowerCase()}`;
const q = (c: string) => `"${c.replace(/"/g, '""')}"`;

type Row = string[] & { pk?: number; dirty?: boolean };
type Store = {
  sheets: Record<string, Row[]>; deleted: Record<string, number[]>;
  props: Record<string, string>; propsDirty: Set<string>;
  fails: Record<string, { n: number; until: number } | null>; failsDirty: Set<string>;
  uploads: { id: string; type: string; bytes: Uint8Array }[]; photos: Record<string, { type: string; bytes: Uint8Array }>;
};

function dubaiToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** Load what this request can need. Checks and Submissions only from a date window; Activity only when it's read. */
async function preload(tx: any, fn: string, b: any): Promise<Store> {
  const store: Store = { sheets: {}, deleted: {}, props: {}, propsDirty: new Set(), fails: {}, failsDirty: new Set(), uploads: [], photos: {} };
  const settings = await tx.unsafe(`select "key", "value" from grooming.settings`);
  const win = Number((settings.find((s: any) => s.key === "warningWindowDays") || {}).value) || 90;
  let from = addDays(dubaiToday(), -(Math.max(win, 100) + 14));
  if (/^\d{4}-\d{2}-\d{2}$/.test(b.from || "") && b.from < from) from = b.from;
  await Promise.all(Object.entries(SCHEMA).map(async ([name, cols]) => {
    const sel = `select _pk, ${cols.map(q).join(", ")} from ${tbl(name)}`;
    let rows: any[];
    if (name === "Checks" && fn === "photo") rows = await tx.unsafe(`${sel} where photo = $1 order by _pk`, [String(b.id || "")]);
    else if (name === "Checks" || name === "Submissions") rows = await tx.unsafe(`${sel} where "date" >= $1 order by _pk`, [from]);
    else if (name === "Activity") rows = fn === "activity" ? (await tx.unsafe(`${sel} order by _pk desc limit 3000`)).reverse() : [];
    else rows = await tx.unsafe(`${sel} order by _pk`);
    const data: Row[] = [cols.slice() as Row];
    for (const r of rows) { const row = cols.map((c) => r[c] ?? "") as Row; row.pk = Number(r._pk); data.push(row); }
    store.sheets[name] = data;
    store.deleted[name] = [];
  }));
  for (const p of await tx.unsafe(`select key, value from grooming.props`)) store.props[p.key] = p.value;
  for (const f of await tx.unsafe(`select key, n, extract(epoch from until) * 1000 as until from grooming.login_fails where until > now()`)) store.fails[f.key] = { n: f.n, until: Number(f.until) };
  if (fn === "photo" && b.id) {
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(String(b.id))}`, { headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY } });
    if (r.ok) store.photos[String(b.id)] = { type: r.headers.get("content-type") || "image/jpeg", bytes: new Uint8Array(await r.arrayBuffer()) };
  }
  return store;
}

/** Write back everything the request changed. */
async function flush(tx: any, store: Store) {
  for (const up of store.uploads) {
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${up.id}`, {
      method: "POST", headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": up.type, "x-upsert": "true" }, body: up.bytes,
    });
    if (!r.ok) throw new Error("photo upload failed: " + r.status + " " + (await r.text()).slice(0, 200));
  }
  for (const [name, cols] of Object.entries(SCHEMA)) {
    const del = store.deleted[name];
    if (del.length) await tx.unsafe(`delete from ${tbl(name)} where _pk = any($1::bigint[])`, [del]);
    const rows = store.sheets[name].slice(1);
    const blank = (r: Row) => !r.some((x) => x !== "" && x != null);
    for (const r of rows.filter((r) => r.pk && r.dirty)) {
      await tx.unsafe(`update ${tbl(name)} set ${cols.map((c, i) => `${q(c)} = $${i + 1}`).join(", ")} where _pk = $${cols.length + 1}`,
        [...cols.map((_, i) => String(r[i] ?? "")), r.pk]);
    }
    const fresh = rows.filter((r) => !r.pk && !blank(r));
    for (let i = 0; i < fresh.length; i += 400) {
      const chunk = fresh.slice(i, i + 400);
      const params: string[] = [];
      const values = chunk.map((r) => `(${cols.map((_, j) => { params.push(String(r[j] ?? "")); return `$${params.length}`; }).join(", ")})`);
      await tx.unsafe(`insert into ${tbl(name)} (${cols.map(q).join(", ")}) values ${values.join(", ")}`, params);
    }
  }
  for (const k of store.propsDirty) await tx.unsafe(`insert into grooming.props (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [k, store.props[k]]);
  for (const k of store.failsDirty) {
    const f = store.fails[k];
    if (f) await tx.unsafe(`insert into grooming.login_fails (key, n, until) values ($1, $2, to_timestamp($3 / 1000.0)) on conflict (key) do update set n = excluded.n, until = excluded.until`, [k, f.n, f.until]);
    else await tx.unsafe(`delete from grooming.login_fails where key = $1`, [k]);
  }
}

/** The Google services the backend was written for, backed by the in-memory store. */
function services(store: Store) {
  const bytes = (buf: Uint8Array) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
  const unbytes = (arr: number[]) => Uint8Array.from(arr.map((x) => x & 255));
  class Range {
    constructor(public sh: Sheet, public r: number, public c: number, public nr: number, public nc: number) {}
    getValues() {
      const out: string[][] = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sh.data[this.r - 1 + i] || [];
        out.push(Array.from({ length: this.nc }, (_, j) => row[this.c - 1 + j] ?? ""));
      }
      return out;
    }
    setValues(vals: unknown[][]) {
      vals.forEach((row, i) => {
        const at = this.r - 1 + i;
        if (at === 0) return;                                  // header row: fixed by the schema
        const tgt = (this.sh.data[at] ||= [] as unknown as Row);
        row.forEach((v, j) => { let s = String(v ?? ""); if (s.startsWith("'")) s = s.slice(1); tgt[this.c - 1 + j] = s; });
        tgt.dirty = true;
      });
      return this;
    }
    setValue(v: unknown) { return this.setValues([[v]]); }
    setNumberFormat() { return this; }
  }
  class Sheet {
    data: Row[];
    constructor(public name: string) { this.data = store.sheets[name]; }
    getLastRow() { let n = this.data.length; while (n > 1 && !(this.data[n - 1] || []).some((x) => x !== "" && x != null)) n--; return n; }
    getMaxRows() { return this.data.length + 1000; }
    insertRowsAfter() {}
    getRange(r: number, c: number, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getDataRange() { return new Range(this, 1, 1, this.getLastRow(), SCHEMA[this.name].length); }
    setFrozenRows() {}
    deleteRow(r: number) { const [row] = this.data.splice(r - 1, 1); if (row && row.pk) store.deleted[this.name].push(row.pk); }
  }
  const ss = {
    getSheetByName: (n: string) => (store.sheets[n] ? new Sheet(n) : null),
    insertSheet: (n: string) => { store.sheets[n] ||= [(SCHEMA[n] || []).slice() as Row]; store.deleted[n] ||= []; return new Sheet(n); },
    deleteSheet: () => {},
  };
  const formatDate = (d: Date, z: string, f: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
    return f.replace("yyyy", p.year).replace("MM", p.month).replace("dd", p.day).replace("HH", p.hour).replace("mm", p.minute);
  };
  const userError = (code: string) => { const e: any = new Error(code); e.user = true; return e; };
  return {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t: string) => ({ text: t, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },      // the transaction lock does this
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => { const f = store.fails[k]; return f && f.until > Date.now() ? String(f.n) : null; },
        put: (k: string, v: string, sec = 600) => { store.fails[k] = { n: Number(v) || 0, until: Date.now() + sec * 1000 }; store.failsDirty.add(k); },
        remove: (k: string) => { store.fails[k] = null; store.failsDirty.add(k); },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => store.props[k] ?? null,
        setProperty: (k: string, v: string) => { store.props[k] = String(v); store.propsDirty.add(k); },
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate,
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (alg: string, s: string) => bytes(crypto.createHash(alg).update(s, "utf8").digest()),
      computeHmacSha256Signature: (s: string, k: string) => bytes(crypto.createHmac("sha256", k).update(s).digest()),
      base64EncodeWebSafe: (b: number[]) => Buffer.from(unbytes(b)).toString("base64url"),
      base64Encode: (b: number[]) => Buffer.from(unbytes(b)).toString("base64"),
      base64Decode: (s: string) => bytes(Buffer.from(s, "base64")),
      newBlob: (data: number[], type: string, name: string) => ({ data, type, name }),
    },
    // Email isn't connected on Supabase yet: the daily summary is off and "send a test" says so.
    MailApp: { getRemainingDailyQuota: () => 0, sendEmail: () => { throw userError("no_mail"); } },
    ScriptApp: {
      getProjectTriggers: () => [], deleteTrigger: () => {},
      newTrigger: () => { const b: any = { timeBased: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b, create: () => null }; return b; },
    },
    DriveApp: {
      getFoldersByName: () => ({
        hasNext: () => true,
        next: () => ({
          createFile: (blob: { data: number[]; type: string }) => {
            const id = crypto.randomBytes(12).toString("hex");
            store.uploads.push({ id, type: blob.type, bytes: unbytes(blob.data) });
            return { getId: () => id };
          },
        }),
      }),
      createFolder: () => null,
      getFileById: (id: string) => {
        const f = store.photos[id];
        if (!f) throw userError("notfound");
        return { getBlob: () => ({ getContentType: () => f.type, getBytes: () => bytes(f.bytes) }) };
      },
    },
  };
}

/** One-time move from the Google Sheet (and test data loading). Needs the IMPORT_KEY kept in grooming.props. */
async function admin(b: any) {
  const [k] = await sql`select value from grooming.props where key = 'IMPORT_KEY'`;
  if (!k || !b.key || String(b.key) !== k.value) return { ok: false, error: "login" };
  if (b.fn === "wipePhotos") {
    // Delete every check photo (used when clearing all data). Storage files can't be deleted from SQL.
    let n = 0;
    for (;;) {
      const list = await fetch(`${SB_URL}/storage/v1/object/list/${BUCKET}`, {
        method: "POST", headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "", limit: 100 }),
      }).then((r) => r.json());
      const names = (Array.isArray(list) ? list : []).map((o: any) => o.name).filter(Boolean);
      if (!names.length) break;
      const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: names }),
      });
      if (!r.ok) return { ok: false, error: "error", detail: (await r.text()).slice(0, 200) };
      n += names.length;
    }
    return { ok: true, deleted: n };
  }
  if (b.fn === "importPhoto") {
    const m = String(b.data || "").match(/^data:(image\/\w+);base64,(.*)$/);
    if (!m || !/^[\w-]{6,80}$/.test(String(b.id || ""))) return { ok: false, error: "bad" };
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${b.id}`, {
      method: "POST", headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": m[1], "x-upsert": "true" }, body: Buffer.from(m[2], "base64"),
    });
    return r.ok ? { ok: true } : { ok: false, error: "error", detail: (await r.text()).slice(0, 200) };
  }
  // import: replace every table with the rows sent (objects keyed by column name). loadDemo: empty tables, then demo data.
  const counts: Record<string, number> = {};
  await sql.begin(async (tx: any) => {
    await tx`select pg_advisory_xact_lock(4711)`;
    for (const name of Object.keys(SCHEMA)) await tx.unsafe(`truncate ${tbl(name)} restart identity`);
    await tx.unsafe(`delete from grooming.login_fails`);
    await tx.unsafe(`delete from grooming.props where key <> 'IMPORT_KEY'`);
    const store: Store = { sheets: {}, deleted: {}, props: {}, propsDirty: new Set(), fails: {}, failsDirty: new Set(), uploads: [], photos: {} };
    for (const [name, cols] of Object.entries(SCHEMA)) {
      store.sheets[name] = [cols.slice() as Row];
      store.deleted[name] = [];
      if (b.fn === "import") for (const o of (b.tables && b.tables[name]) || []) {
        const row = cols.map((c) => (o[c] == null ? "" : String(o[c]))) as Row;
        if (row.some((x) => x !== "")) store.sheets[name].push(row);
      }
    }
    if (b.fn === "import" && b.secret) { store.props.SESSION_SECRET = String(b.secret); store.propsDirty.add("SESSION_SECRET"); }
    if (b.fn === "loadDemo") create(services(store)).loadDemoData();
    await flush(tx, store);
    for (const name of Object.keys(SCHEMA)) counts[name] = store.sheets[name].length - 1;
  });
  return { ok: true, counts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return reply({ ok: true, app: "ABFM Grooming backend (Supabase)" });
  let b: any;
  try { b = JSON.parse(await req.text()); } catch { return reply({ ok: false, error: "bad" }); }
  const fn = String(b.fn || b.action || "");
  // Never trust these from the page: they are set here.
  delete b._email; delete b._ip;
  b._ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  try {
    if (fn === "import" || fn === "importPhoto" || fn === "loadDemo" || fn === "wipePhotos") return reply(await admin(b));
    // Dashboard admins send their Supabase sign-in (a JWT). Check it with Supabase Auth and pass on the confirmed email.
    if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(String(b.token || ""))) {
      const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${b.token}`, apikey: SB_KEY } });
      const au = r.ok ? await r.json() : null;
      if (!au || !au.email || !(au.email_confirmed_at || au.confirmed_at)) return reply({ ok: false, error: "login" });
      b._email = String(au.email).toLowerCase();
      b.token = "";
    }
    const text = JSON.stringify(b);
    const out = await sql.begin(async (tx: any) => {
      if (fn !== "photo" && fn !== "field" && fn !== "admin" && fn !== "activity") await tx`select pg_advisory_xact_lock(4711)`;
      const store = await preload(tx, fn, b);
      const res = create(services(store)).doPost({ postData: { contents: text } }).text;
      await flush(tx, store);
      return res;
    });
    return reply(out);
  } catch (e) {
    console.error(e);
    return reply({ ok: false, error: "error", detail: String(e).slice(0, 300) });
  }
});
