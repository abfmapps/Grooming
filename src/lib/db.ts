// SQLite database. Everything that touches storage goes through this file and
// src/lib/queries.ts, so moving to Postgres/Supabase later is contained.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type DB = Database.Database;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_sites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, site_id)
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY,
  staff_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  trade TEXT NOT NULL DEFAULT '',
  site_id INTEGER REFERENCES sites(id),
  uniform_size TEXT NOT NULL DEFAULT '',
  shoe_size TEXT NOT NULL DEFAULT '',
  trained_on TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  check_date TEXT NOT NULL,
  check_type TEXT NOT NULL,          -- site | camp | field
  status TEXT NOT NULL,              -- pass | gaps | supply | absent | leave
  is_finding INTEGER NOT NULL DEFAULT 0,
  finding_no INTEGER,                -- this finding's number in the warning window
  note TEXT NOT NULL DEFAULT '',
  photo TEXT,
  checked_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, check_date, check_type)
);
CREATE INDEX IF NOT EXISTS checks_site_date ON checks(site_id, check_date);
CREATE INDEX IF NOT EXISTS checks_emp ON checks(employee_id, check_date);

CREATE TABLE IF NOT EXISTS check_items (
  check_id INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  ok INTEGER NOT NULL,
  supply_gap INTEGER NOT NULL DEFAULT 0,
  action TEXT,
  PRIMARY KEY (check_id, item_code)
);

CREATE TABLE IF NOT EXISTS supply_gaps (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  item TEXT NOT NULL,
  requested_on TEXT NOT NULL,
  issued_on TEXT,
  check_id INTEGER REFERENCES checks(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  site_id INTEGER NOT NULL REFERENCES sites(id),
  sub_date TEXT NOT NULL,
  submitted_by INTEGER REFERENCES users(id),
  submitted_at TEXT NOT NULL,
  staff_total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  gaps INTEGER NOT NULL,
  supply INTEGER NOT NULL,
  absent INTEGER NOT NULL,
  PRIMARY KEY (site_id, sub_date)
);

CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  audit_date TEXT NOT NULL,
  auditor_id INTEGER REFERENCES users(id),
  with_hse TEXT NOT NULL DEFAULT '',
  sample_size INTEGER NOT NULL DEFAULT 5,
  score_grooming INTEGER NOT NULL,
  score_ppe INTEGER NOT NULL,
  score_communication INTEGER NOT NULL,
  score_control INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  report_sent_on TEXT,
  plan_received_on TEXT,
  verified_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_actions (
  id INTEGER PRIMARY KEY,
  audit_id INTEGER NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  finding TEXT NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  action TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  due_on TEXT NOT NULL,
  closed_on TEXT
);
`;

let instance: DB | null = null;

export function dataDir(): string {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function openDb(file?: string): DB {
  const db = new Database(file ?? path.join(dataDir(), "grooming.db"));
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  ensureAdmin(db);
  return db;
}

export function db(): DB {
  if (!instance) {
    // Reuse across hot reloads in development.
    const g = globalThis as unknown as { __groomingDb?: DB };
    instance = g.__groomingDb ?? openDb();
    g.__groomingDb = instance;
  }
  return instance;
}

/** First run: create an admin account so someone can log in and set things up. */
function ensureAdmin(db: DB) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n.n === 0) {
    const pin = process.env.ADMIN_PIN || "1234";
    db.prepare("INSERT INTO users (username, name, role, pin_hash) VALUES (?, ?, 'admin', ?)").run("admin", "Administrator", hashPin(pin));
  }
}

export function setting(db: DB, key: string, make: () => string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (row) return row.value;
  const value = make();
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
  return value;
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

// ---------- dates (UAE time) ----------
export const TZ = process.env.TZ_NAME || "Asia/Dubai";

export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function nowTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}

/** UAE working week: Monday–Friday. */
export function workingDaysBetween(a: string, b: string): number {
  let n = 0;
  for (let d = a; d < b; d = addDays(d, 1)) {
    const wd = new Date(d + "T12:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
