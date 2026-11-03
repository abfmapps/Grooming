// Runs setup/grooming-backend.gs in Node with small stand-ins for the Google services it uses
// (Sheets, Drive, Cache, Lock, Properties, Utilities). For local testing only.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

export function loadBackend({ dataFile, photoDir }) {
  const store = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, "utf8")) : { sheets: {}, props: {} };
  const save = () => fs.writeFileSync(dataFile, JSON.stringify(store));
  fs.mkdirSync(photoDir, { recursive: true });

  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sh.data[this.r - 1 + i] || [];
        out.push(Array.from({ length: this.nc }, (_, j) => row[this.c - 1 + j] ?? ""));
      }
      return out;
    }
    setValues(vals) {
      vals.forEach((row, i) => {
        const tgt = (this.sh.data[this.r - 1 + i] ||= []);
        row.forEach((v, j) => { let s = String(v); if (s.startsWith("'")) s = s.slice(1); tgt[this.c - 1 + j] = s; });
      });
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = (store.sheets[name] ||= []); }
    getLastRow() { let n = this.data.length; while (n > 0 && !(this.data[n - 1] || []).some((x) => x !== "" && x != null)) n--; return n; }
    getMaxRows() { return Math.max(1000, this.data.length + 1000); }
    insertRowsAfter() {}
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getDataRange() { return new Range(this, 1, 1, this.getLastRow(), Math.max(0, ...this.data.map((x) => x.length))); }
    setFrozenRows() {}
    deleteRow(r) { this.data.splice(r - 1, 1); }
  }
  const ss = {
    getSheetByName: (n) => (store.sheets[n] ? new Sheet(n) : null),
    insertSheet: (n) => { store.sheets[n] = []; return new Sheet(n); },
  };
  const cacheMap = new Map();
  const tz = (d, z, f) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
    return f.replace("yyyy", p.year).replace("MM", p.month).replace("dd", p.day).replace("HH", p.hour).replace("mm", p.minute);
  };
  const bytes = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cacheMap.get(k) ?? null, put: (k, v) => cacheMap.set(k, v), remove: (k) => cacheMap.delete(k) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => store.props[k] ?? null, setProperty: (k, v) => { store.props[k] = v; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: tz,
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (alg, s) => bytes(crypto.createHash(alg).update(s, "utf8").digest()),
      computeHmacSha256Signature: (s, k) => bytes(crypto.createHmac("sha256", k).update(s).digest()),
      base64EncodeWebSafe: (b) => Buffer.from(b.map((x) => x & 255)).toString("base64url"),
      base64Encode: (b) => Buffer.from(b.map((x) => x & 255)).toString("base64"),
      base64Decode: (s) => bytes(Buffer.from(s, "base64")),
      newBlob: (data, type, name) => ({ data, type, name }),
    },
    DriveApp: {
      getFoldersByName: () => ({ hasNext: () => true, next: () => ({ createFile: (blob) => { const id = crypto.randomBytes(8).toString("hex"); fs.writeFileSync(path.join(photoDir, id), JSON.stringify({ type: blob.type, data: Buffer.from(blob.data.map((x) => x & 255)).toString("base64") })); return { getId: () => id }; } }) }),
      createFolder: () => null,
      getFileById: (id) => { const f = JSON.parse(fs.readFileSync(path.join(photoDir, id), "utf8")); return { getBlob: () => ({ getContentType: () => f.type, getBytes: () => bytes(Buffer.from(f.data, "base64")) }) }; },
    },
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(new URL("../setup/grooming-backend.gs", import.meta.url), "utf8");
  // Each request gets a fresh per-request cache, like Apps Script.
  vm.runInContext(code + "\nthis.__reset = () => { for (const k in cache_) delete cache_[k]; };", ctx);
  return {
    post(body) { ctx.__reset(); const out = ctx.doPost({ postData: { contents: body } }); save(); return out.text; },
    run(fn) { ctx.__reset(); const r = ctx[fn](); save(); return r; },
  };
}
