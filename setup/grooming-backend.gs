/**
 * ABFM Grooming Control: private backend.
 *
 * All data lives in the Google Sheet this script is attached to. The public app (GitHub Pages)
 * only talks to this script, which checks the user's PIN, role and sites on every request.
 *
 * Setup (about 5 minutes), also in the README:
 *  1. Create a new Google Sheet (e.g. "ABFM Grooming data"). Extensions → Apps Script.
 *  2. Replace everything in Code.gs with this file. Change ADMIN_PIN below.
 *  3. Project Settings (⚙️) → Time zone: (GMT+04:00) Dubai.
 *  4. Deploy → New deployment → ⚙️ Select type: Web app → Execute as: Me → Who has access: Anyone → Deploy.
 *     Allow the permissions it asks for (Sheets, and Drive for photos).
 *  5. Copy the Web app URL into config.js in the GitHub repo.
 *  Optional: to try it with made-up data, choose loadDemoData in the function list and press ▶ Run.
 *  When you change this script later: Deploy → Manage deployments → ✏️ → Version: New version → Deploy
 *  (keeps the same URL).
 */
const ADMIN_PIN = "1234";            // PIN for the first "admin" login. Change it here, or in the app after logging in.
const PHOTO_FOLDER = "ABFM Grooming photos";
const TZ = "Asia/Dubai";
const SESSION_DAYS = 14;

/* ---------------- tables ---------------- */
const TABLES = {
  Sites: ["id", "name", "active"],
  Users: ["id", "username", "name", "role", "pin", "sites", "active"],
  Employees: ["id", "staff_no", "name", "trade", "site_id", "uniform_size", "shoe_size", "trained_on", "active"],
  Checks: ["id", "date", "type", "employee_id", "site_id", "status", "finding_no", "gaps", "note", "photo", "by", "time"],
  Supply: ["id", "employee_id", "site_id", "item", "requested_on", "issued_on", "check_id", "by"],
  Submissions: ["site_id", "date", "by", "time", "total", "passed", "gaps", "supply", "absent"],
  Audits: ["id", "site_id", "date", "auditor", "with_hse", "sample", "s_grooming", "s_ppe", "s_comm", "s_control", "notes", "report_on", "plan_on", "verified_on"],
  Actions: ["id", "audit_id", "finding", "employee_id", "action", "owner", "due_on", "closed_on"],
};

const ROLES = {
  supervisor: { field: true, manage: false, all: false },
  camp_boss: { field: true, manage: false, all: false },
  site_manager: { field: true, manage: false, all: false },
  fm_manager: { field: true, manage: true, all: false },
  director: { field: false, manage: true, all: true },
  oco: { field: false, manage: true, all: true },
  hse: { field: false, manage: true, all: true },
  hr: { field: false, manage: true, all: true },
  stores: { field: false, manage: true, all: true },
  admin: { field: true, manage: true, all: true },
};
const CAN = {
  audit: (u) => ["oco", "hse", "director", "admin"].indexOf(u.role) >= 0,
  closeActions: (u) => ["oco", "hse", "director", "admin", "fm_manager", "hr"].indexOf(u.role) >= 0,
  issueSupply: (u) => ["stores", "hr", "admin", "director", "fm_manager", "supervisor", "site_manager"].indexOf(u.role) >= 0,
  manageStaff: (u) => ["admin", "hr", "director"].indexOf(u.role) >= 0,
  manageUsers: (u) => ["admin", "director"].indexOf(u.role) >= 0,
  markTraining: (u) => u.role !== "stores",
  checkTypes: (u) => (u.role === "camp_boss" ? ["camp"] : u.role === "admin" ? ["site", "camp", "field"] : ["site", "field"]),
};

/* ---------------- sheet helpers ---------------- */
const cache_ = {};
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 2000, TABLES[name].length).setNumberFormat("@");   // keep everything as plain text
    sh.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function norm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  const s = v == null ? "" : String(v);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}
/** Read a whole table as objects (cached for this request). Each row remembers its sheet row number. */
function rows_(name) {
  if (cache_[name]) return cache_[name];
  const sh = sheet_(name);
  const last = sh.getLastRow();
  const head = TABLES[name];
  const out = [];
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, head.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      if (r.every((x) => x === "" || x == null)) continue;
      const o = { _row: i + 2 };
      head.forEach((h, j) => (o[h] = norm_(r[j])));
      out.push(o);
    }
  }
  return (cache_[name] = out);
}
function safe_(v) {
  let s = v == null ? "" : String(v).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ");
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function toRow_(name, o) { return TABLES[name].map((h) => safe_(o[h])); }
function insert_(name, o) {
  const sh = sheet_(name);
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows() - 5) sh.insertRowsAfter(sh.getMaxRows(), 2000);
  sh.getRange(row, 1, 1, TABLES[name].length).setNumberFormat("@").setValues([toRow_(name, o)]);
  o._row = row;
  if (cache_[name]) cache_[name].push(o);
  return o;
}
function update_(name, o) {
  sheet_(name).getRange(o._row, 1, 1, TABLES[name].length).setValues([toRow_(name, o)]);
}
function insertMany_(name, list) {
  if (!list.length) return;
  const sh = sheet_(name);
  const row = sh.getLastRow() + 1;
  if (row + list.length > sh.getMaxRows() - 5) sh.insertRowsAfter(sh.getMaxRows(), list.length + 2000);
  sh.getRange(row, 1, list.length, TABLES[name].length).setNumberFormat("@").setValues(list.map((o) => toRow_(name, o)));
  delete cache_[name];
}
function id_() { return Utilities.getUuid().replace(/-/g, "").slice(0, 10); }
function today_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"); }
function now_() { return Utilities.formatDate(new Date(), TZ, "HH:mm"); }
function addDays_(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function clip_(v, n) { return String(v == null ? "" : v).trim().slice(0, n); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(msg) { const e = new Error(msg); e.user = true; throw e; }

/* ---------------- PINs and sessions ---------------- */
function hex_(bytes) { return bytes.map((b) => ("0" + (b & 0xff).toString(16)).slice(-2)).join(""); }
function hashPin_(pin, salt) {
  salt = salt || id_();
  return salt + ":" + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ":" + pin, Utilities.Charset.UTF_8));
}
function pinOk_(pin, stored) {
  const salt = String(stored).split(":")[0];
  return !!salt && hashPin_(pin, salt) === stored;
}
function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty("SESSION_SECRET");
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty("SESSION_SECRET", s); }
  return s;
}
function sign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_())).replace(/=+$/, "");
}
function ensureAdmin_() {
  if (rows_("Users").length) return;
  insert_("Users", { id: id_(), username: "admin", name: "Administrator", role: "admin", pin: hashPin_(ADMIN_PIN), sites: "", active: "1" });
}
function userFromToken_(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) fail_("login");
  if (sign_(parts[0] + "." + parts[1]) !== parts[2]) fail_("login");
  if (Number(parts[1]) < Date.now() / 1000) fail_("login");
  const u = rows_("Users").filter((x) => x.id === parts[0] && x.active === "1")[0];
  if (!u) fail_("login");
  return publicUser_(u);
}
function publicUser_(u) {
  const r = ROLES[u.role] || ROLES.supervisor;
  const active = rows_("Sites").filter((s) => s.active === "1").map((s) => s.id);
  const own = String(u.sites || "").split(",").filter(Boolean);
  return {
    id: u.id, username: u.username, name: u.name, role: u.role, field: r.field, manage: r.manage,
    siteIds: r.all ? active : own.filter((s) => active.indexOf(s) >= 0),
    can: { audit: CAN.audit(u), closeActions: CAN.closeActions(u), issueSupply: CAN.issueSupply(u), manageStaff: CAN.manageStaff(u), manageUsers: CAN.manageUsers(u), markTraining: CAN.markTraining(u), checkTypes: CAN.checkTypes(u) },
  };
}
function siteOk_(u, siteId) { if (u.siteIds.indexOf(String(siteId)) < 0) fail_("site"); }

/* ---------------- entry points ---------------- */
function doGet() { return json_({ ok: true, app: "ABFM Grooming backend" }); }

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad" }); }
  const write = WRITES.hasOwnProperty(b.action);
  const lock = write ? LockService.getScriptLock() : null;
  try {
    if (lock) lock.waitLock(20000);
    ensureAdmin_();
    if (b.action === "login") return json_(login_(b));
    const u = userFromToken_(b.token);
    const fn = READS[b.action] || WRITES[b.action];
    if (!fn) return json_({ ok: false, error: "unknown" });
    const out = fn(u, b) || {};
    out.ok = true;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: err.user ? err.message : "error", detail: err.user ? undefined : String(err).slice(0, 300) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function login_(b) {
  const username = clip_(b.username, 60).toLowerCase();
  const c = CacheService.getScriptCache();
  const key = "fail:" + username;
  const fails = Number(c.get(key) || 0);
  if (fails >= 6) return { ok: false, error: "locked" };
  const u = rows_("Users").filter((x) => x.username.toLowerCase() === username && x.active === "1")[0];
  if (!u || !pinOk_(String(b.pin || ""), u.pin)) {
    c.put(key, String(fails + 1), 600);
    return { ok: false, error: "pin" };
  }
  c.remove(key);
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = u.id + "." + exp;
  return { ok: true, token: payload + "." + sign_(payload), user: publicUser_(u) };
}

/* ---------------- reads ---------------- */
const READS = {
  /** Everything the phone app needs for one site. */
  field: function (u, b) {
    if (!u.field) fail_("role");
    const sites = rows_("Sites").filter((s) => u.siteIds.indexOf(s.id) >= 0).map(site_);
    const siteId = u.siteIds.indexOf(String(b.site)) >= 0 ? String(b.site) : u.siteIds[0];
    const today = today_();
    const out = { user: u, sites: sites, today: today, site: siteId || null };
    if (!siteId) return out;
    const staff = rows_("Employees").filter((e) => e.site_id === siteId && e.active === "1");
    const ids = {};
    staff.forEach((e) => (ids[e.id] = true));
    const from = addDays_(today, -90);
    out.staff = staff.map(emp_);
    out.checks = rows_("Checks").filter((c) => c.site_id === siteId && c.date >= addDays_(today, -6)).map(check_);
    out.findings = findings_(ids, from, today);
    out.supply = rows_("Supply").filter((g) => g.site_id === siteId && !g.issued_on).map(supply_);
    out.submission = rows_("Submissions").filter((s) => s.site_id === siteId && s.date === today).map(sub_)[0] || null;
    return out;
  },

  /** Everything the dashboard needs, for the user's sites, from a start date. */
  admin: function (u, b) {
    if (!u.manage) fail_("role");
    const today = today_();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(b.from || "") ? b.from : addDays_(today, -100);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(b.to || "") ? b.to : today;
    const mine = {};
    u.siteIds.forEach((s) => (mine[s] = true));
    const staffAll = u.can.manageStaff;
    const audits = rows_("Audits").filter((a) => mine[a.site_id]);
    const auditIds = {};
    audits.forEach((a) => (auditIds[a.id] = true));
    const out = {
      user: u, today: today, from: from, to: to,
      sites: rows_("Sites").filter((s) => mine[s.id] || u.can.manageUsers).map(site_),
      employees: rows_("Employees").filter((e) => mine[e.site_id] || (staffAll && !e.site_id)).map(emp_),
      checks: rows_("Checks").filter((c) => mine[c.site_id] && c.date >= from && c.date <= to).map(check_),
      submissions: rows_("Submissions").filter((s) => mine[s.site_id] && s.date >= from && s.date <= to).map(sub_),
      supply: rows_("Supply").filter((g) => mine[g.site_id]).map(supply_),
      audits: audits.map(audit_),
      actions: rows_("Actions").filter((x) => auditIds[x.audit_id]).map(action_),
      managers: rows_("Users").filter((x) => x.role === "fm_manager" && x.active === "1").map((x) => ({ name: x.name, sites: String(x.sites).split(",").filter(Boolean) })),
    };
    if (u.can.manageUsers) {
      out.users = rows_("Users").map((x) => ({ id: x.id, username: x.username, name: x.name, role: x.role, sites: String(x.sites).split(",").filter(Boolean), active: x.active === "1" }));
    }
    return out;
  },

  photo: function (u, b) {
    const c = rows_("Checks").filter((x) => x.photo && x.photo === String(b.id))[0];
    if (!c) fail_("notfound");
    siteOk_(u, c.site_id);
    const blob = DriveApp.getFileById(c.photo).getBlob();
    return { data: "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes()) };
  },
};

function site_(s) { return { id: s.id, name: s.name, active: s.active === "1" }; }
function emp_(e) { return { id: e.id, staff_no: e.staff_no, name: e.name, trade: e.trade, site_id: e.site_id, uniform_size: e.uniform_size, shoe_size: e.shoe_size, trained_on: e.trained_on || null, active: e.active === "1" }; }
function check_(c) { return { id: c.id, date: c.date, type: c.type, employee_id: c.employee_id, site_id: c.site_id, status: c.status, finding_no: c.finding_no ? Number(c.finding_no) : null, gaps: parseGaps_(c.gaps), note: c.note, photo: c.photo || null, by: c.by, time: c.time }; }
function supply_(g) { return { id: g.id, employee_id: g.employee_id, site_id: g.site_id, item: g.item, requested_on: g.requested_on, issued_on: g.issued_on || null }; }
function sub_(s) { return { site_id: s.site_id, date: s.date, by: s.by, time: s.time, total: +s.total, passed: +s.passed, gaps: +s.gaps, supply: +s.supply, absent: +s.absent }; }
function audit_(a) { return { id: a.id, site_id: a.site_id, date: a.date, auditor: a.auditor, with_hse: a.with_hse, sample: +a.sample, s_grooming: +a.s_grooming, s_ppe: +a.s_ppe, s_comm: +a.s_comm, s_control: +a.s_control, total: +a.s_grooming + +a.s_ppe + +a.s_comm + +a.s_control, notes: a.notes, report_on: a.report_on || null, plan_on: a.plan_on || null, verified_on: a.verified_on || null }; }
function action_(x) { return { id: x.id, audit_id: x.audit_id, finding: x.finding, employee_id: x.employee_id || null, action: x.action, owner: x.owner, due_on: x.due_on, closed_on: x.closed_on || null }; }

/** gaps are stored as "code:supply:action" items separated by ";" e.g. "hair:0:verbal_warning;shoes:1:" */
function parseGaps_(s) {
  return String(s || "").split(";").filter(Boolean).map((g) => {
    const p = g.split(":");
    return { code: p[0], supply: p[1] === "1", action: p[2] || null };
  });
}

/** Finding dates per employee in a window: daily-check findings plus audit findings, one per day. */
function findings_(ids, from, to) {
  const out = {};
  const add = (emp, date) => {
    if (!ids[emp] || date < from || date > to) return;
    out[emp] = out[emp] || [];
    if (out[emp].indexOf(date) < 0) out[emp].push(date);
  };
  rows_("Checks").forEach((c) => { if (c.status === "gaps") add(c.employee_id, c.date); });
  const auditDate = {};
  rows_("Audits").forEach((a) => (auditDate[a.id] = a.date));
  rows_("Actions").forEach((x) => { if (x.employee_id) add(x.employee_id, auditDate[x.audit_id] || ""); });
  return out;
}

/* ---------------- writes ---------------- */
const WRITES = {
  saveCheck: function (u, b) {
    if (!u.field) fail_("role");
    const type = ["site", "camp", "field"].indexOf(b.type) >= 0 ? b.type : "site";
    if (u.can.checkTypes.indexOf(type) < 0) fail_("role");
    const emp = rows_("Employees").filter((e) => e.id === String(b.employee_id) && e.active === "1")[0];
    if (!emp) fail_("notfound");
    siteOk_(u, emp.site_id);
    const today = today_();
    const mode = ["absent", "leave"].indexOf(b.status) >= 0 ? b.status : "checked";
    const gaps = mode === "checked" && Array.isArray(b.gaps) ? b.gaps.slice(0, 40).map((g) => ({
      code: clip_(g.code, 30).replace(/[:;]/g, ""), supply: !!g.supply, action: g.supply ? "" : clip_(g.action, 30).replace(/[:;]/g, ""),
      label: clip_(g.label, 80), requested: /^\d{4}-\d{2}-\d{2}$/.test(g.requested || "") && g.requested <= today ? g.requested : today,
    })) : [];
    const status = mode !== "checked" ? mode : gaps.some((g) => !g.supply) ? "gaps" : gaps.length ? "supply" : "pass";
    const existing = rows_("Checks").filter((c) => c.employee_id === emp.id && c.date === today && c.type === type)[0];
    let findingNo = "";
    if (status === "gaps") {
      const ids = {};
      ids[emp.id] = true;
      const prior = findings_(ids, addDays_(today, -90), today)[emp.id] || [];
      findingNo = String(prior.filter((d) => d !== today).length + 1);   // one finding per day at most
    }
    let photo = existing ? existing.photo : "";
    if (b.photo && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length < 4000000) photo = savePhoto_(b.photo, emp);
    const rec = existing || { id: id_() };
    Object.assign(rec, {
      date: today, type: type, employee_id: emp.id, site_id: emp.site_id, status: status, finding_no: findingNo,
      gaps: gaps.map((g) => g.code + ":" + (g.supply ? 1 : 0) + ":" + g.action).join(";"),
      note: clip_(b.note, 1000), photo: photo, by: u.name, time: now_(),
    });
    if (existing) update_("Checks", rec); else insert_("Checks", rec);
    // Supply gaps: one open record per employee and item.
    gaps.filter((g) => g.supply).forEach((g) => {
      const label = g.label || g.code;
      const open = rows_("Supply").some((x) => x.employee_id === emp.id && x.item === label && !x.issued_on);
      if (!open) insert_("Supply", { id: id_(), employee_id: emp.id, site_id: emp.site_id, item: label, requested_on: g.requested, issued_on: "", check_id: rec.id, by: u.name });
    });
    return { check: check_(rec) };
  },

  submitDay: function (u, b) {
    if (!u.field) fail_("role");
    const siteId = String(b.site_id);
    siteOk_(u, siteId);
    const today = today_();
    const staff = rows_("Employees").filter((e) => e.site_id === siteId && e.active === "1");
    const checks = rows_("Checks").filter((c) => c.site_id === siteId && c.date === today && c.type === "site");
    const done = {};
    checks.forEach((c) => (done[c.employee_id] = c.status));
    const missing = staff.filter((e) => !done[e.id]).length;
    if (missing) fail_("missing");
    const count = (f) => staff.filter((e) => f(done[e.id])).length;
    const rec = rows_("Submissions").filter((s) => s.site_id === siteId && s.date === today)[0] || { site_id: siteId, date: today };
    Object.assign(rec, {
      by: u.name, time: now_(), total: staff.length,
      passed: count((s) => s === "pass"), gaps: count((s) => s === "gaps"), supply: count((s) => s === "supply"),
      absent: count((s) => s === "absent" || s === "leave"),
    });
    if (rec._row) update_("Submissions", rec); else insert_("Submissions", rec);
    return { submission: sub_(rec) };
  },

  addSupply: function (u, b) {
    const emp = rows_("Employees").filter((e) => e.id === String(b.employee_id))[0];
    if (!emp) fail_("notfound");
    siteOk_(u, emp.site_id);
    const item = clip_(b.item, 80);
    if (!item) fail_("item");
    const req = /^\d{4}-\d{2}-\d{2}$/.test(b.requested || "") ? b.requested : today_();
    insert_("Supply", { id: id_(), employee_id: emp.id, site_id: emp.site_id, item: item, requested_on: req, issued_on: "", check_id: "", by: u.name });
  },

  issueSupply: function (u, b) {
    if (!u.can.issueSupply) fail_("role");
    const g = rows_("Supply").filter((x) => x.id === String(b.id))[0];
    if (!g) fail_("notfound");
    siteOk_(u, g.site_id);
    g.issued_on = /^\d{4}-\d{2}-\d{2}$/.test(b.on || "") ? b.on : today_();
    update_("Supply", g);
  },

  trained: function (u, b) {
    if (!u.can.markTraining) fail_("role");
    const e = rows_("Employees").filter((x) => x.id === String(b.employee_id))[0];
    if (!e) fail_("notfound");
    siteOk_(u, e.site_id);
    e.trained_on = b.undo ? "" : today_();
    update_("Employees", e);
  },

  createAudit: function (u, b) {
    if (!u.can.audit) fail_("role");
    siteOk_(u, b.site_id);
    const clamp = (v, max) => String(Math.max(0, Math.min(max, Math.round(Number(v) || 0))));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : today_();
    const a = insert_("Audits", {
      id: id_(), site_id: String(b.site_id), date: date, auditor: u.name, with_hse: clip_(b.with_hse, 80), sample: String(Math.max(1, Number(b.sample) || 5)),
      s_grooming: clamp(b.s_grooming, 30), s_ppe: clamp(b.s_ppe, 25), s_comm: clamp(b.s_comm, 25), s_control: clamp(b.s_control, 20),
      notes: clip_(b.notes, 2000), report_on: "", plan_on: "", verified_on: "",
    });
    (Array.isArray(b.findings) ? b.findings.slice(0, 30) : []).forEach((f) => {
      const finding = clip_(f.finding, 300);
      if (!finding) return;
      insert_("Actions", { id: id_(), audit_id: a.id, finding: finding, employee_id: clip_(f.employee_id, 20), action: clip_(f.action, 300), owner: clip_(f.owner, 80), due_on: /^\d{4}-\d{2}-\d{2}$/.test(f.due_on || "") ? f.due_on : addDays_(date, 7), closed_on: "" });
    });
    return { id: a.id };
  },

  auditStep: function (u, b) {
    const a = rows_("Audits").filter((x) => x.id === String(b.id))[0];
    if (!a) fail_("notfound");
    siteOk_(u, a.site_id);
    const col = { report: "report_on", plan: "plan_on", verified: "verified_on" }[b.step];
    if (!col) fail_("bad");
    if (b.step === "plan" ? !u.can.closeActions : !u.can.audit) fail_("role");
    a[col] = b.undo ? "" : today_();
    update_("Audits", a);
  },

  addAction: function (u, b) {
    if (!u.can.closeActions) fail_("role");
    const a = rows_("Audits").filter((x) => x.id === String(b.audit_id))[0];
    if (!a) fail_("notfound");
    siteOk_(u, a.site_id);
    const finding = clip_(b.finding, 300);
    if (!finding) fail_("finding");
    insert_("Actions", { id: id_(), audit_id: a.id, finding: finding, employee_id: clip_(b.employee_id, 20), action: clip_(b.action, 300), owner: clip_(b.owner, 80), due_on: /^\d{4}-\d{2}-\d{2}$/.test(b.due_on || "") ? b.due_on : addDays_(a.date, 7), closed_on: "" });
  },

  toggleAction: function (u, b) {
    if (!u.can.closeActions) fail_("role");
    const x = rows_("Actions").filter((y) => y.id === String(b.id))[0];
    if (!x) fail_("notfound");
    const a = rows_("Audits").filter((y) => y.id === x.audit_id)[0];
    siteOk_(u, a.site_id);
    x.closed_on = b.reopen ? "" : today_();
    update_("Actions", x);
  },

  saveSite: function (u, b) {
    if (!u.can.manageUsers) fail_("role");
    const name = clip_(b.name, 80);
    if (b.id) {
      const s = rows_("Sites").filter((x) => x.id === String(b.id))[0];
      if (!s) fail_("notfound");
      if (name) s.name = name;
      if (b.active !== undefined) s.active = b.active ? "1" : "0";
      update_("Sites", s);
      return;
    }
    if (!name) fail_("name");
    if (rows_("Sites").some((x) => x.name.toLowerCase() === name.toLowerCase())) fail_("exists");
    insert_("Sites", { id: id_(), name: name, active: "1" });
  },

  saveUser: function (u, b) {
    if (!u.can.manageUsers) fail_("role");
    if (!ROLES[b.role]) fail_("role_name");
    const pin = String(b.pin || "");
    if (pin && !/^\d{4,8}$/.test(pin)) fail_("pin_format");
    const sites = (Array.isArray(b.sites) ? b.sites : []).map(String).filter((s) => rows_("Sites").some((x) => x.id === s)).join(",");
    if (b.id) {
      const x = rows_("Users").filter((y) => y.id === String(b.id))[0];
      if (!x) fail_("notfound");
      x.name = clip_(b.name, 80) || x.name;
      x.role = b.role;
      x.sites = sites;
      if (b.active !== undefined) {
        if (x.id === u.id && !b.active) fail_("self");
        x.active = b.active ? "1" : "0";
      }
      if (pin) x.pin = hashPin_(pin);
      update_("Users", x);
      return;
    }
    const username = clip_(b.username, 40).toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!username || !clip_(b.name, 80)) fail_("name");
    if (!pin) fail_("pin_format");
    if (rows_("Users").some((y) => y.username.toLowerCase() === username)) fail_("exists");
    insert_("Users", { id: id_(), username: username, name: clip_(b.name, 80), role: b.role, pin: hashPin_(pin), sites: sites, active: "1" });
  },

  /** Any user can change their own PIN. */
  changePin: function (u, b) {
    const x = rows_("Users").filter((y) => y.id === u.id)[0];
    if (!pinOk_(String(b.old || ""), x.pin)) fail_("pin");
    if (!/^\d{4,8}$/.test(String(b.pin || ""))) fail_("pin_format");
    x.pin = hashPin_(String(b.pin));
    update_("Users", x);
  },

  saveEmployee: function (u, b) {
    if (!u.can.manageStaff) fail_("role");
    const rec = {
      staff_no: clip_(b.staff_no, 30), name: clip_(b.name, 80), trade: clip_(b.trade, 60), site_id: clip_(b.site_id, 20),
      uniform_size: clip_(b.uniform_size, 10), shoe_size: clip_(b.shoe_size, 10),
    };
    if (!rec.staff_no || !rec.name) fail_("name");
    if (rows_("Employees").some((e) => e.staff_no.toLowerCase() === rec.staff_no.toLowerCase() && e.id !== String(b.id || ""))) fail_("exists");
    if (b.id) {
      const e = rows_("Employees").filter((x) => x.id === String(b.id))[0];
      if (!e) fail_("notfound");
      Object.assign(e, rec);
      if (b.active !== undefined) e.active = b.active ? "1" : "0";
      update_("Employees", e);
      return { id: e.id };
    }
    const e = insert_("Employees", Object.assign({ id: id_(), trained_on: "", active: "1" }, rec));
    return { id: e.id };
  },

  /** rows: [[staff_no, name, trade, site name, uniform size, shoe size], ...] */
  importEmployees: function (u, b) {
    if (!u.can.manageStaff) fail_("role");
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 3000) : [];
    let added = 0, updated = 0, skipped = 0;
    const fresh = [];
    rows.forEach((r) => {
      const c = (Array.isArray(r) ? r : []).map((x) => clip_(x, 80));
      if (/^staff/i.test(c[0] || "")) return;                       // header row
      if (!c[0] || !c[1]) { skipped++; return; }
      let site = c[3] ? rows_("Sites").filter((s) => s.name.toLowerCase() === c[3].toLowerCase())[0] : null;
      if (!site && c[3]) site = insert_("Sites", { id: id_(), name: c[3], active: "1" });
      const e = rows_("Employees").filter((x) => x.staff_no.toLowerCase() === c[0].toLowerCase())[0] || fresh.filter((x) => x.staff_no.toLowerCase() === c[0].toLowerCase())[0];
      const rec = { staff_no: c[0], name: c[1], trade: c[2] || "", uniform_size: c[4] || "", shoe_size: c[5] || "", active: "1" };
      if (site) rec.site_id = site.id;
      if (e && e._row) { Object.assign(e, rec); update_("Employees", e); updated++; }
      else if (e) { Object.assign(e, rec); updated++; }
      else { fresh.push(Object.assign({ id: id_(), site_id: "", trained_on: "" }, rec)); added++; }
    });
    insertMany_("Employees", fresh);
    return { added: added, updated: updated, skipped: skipped };
  },
};

function savePhoto_(dataUrl, emp) {
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER);
  const name = today_() + " " + emp.staff_no + " " + emp.name + "." + m[1].split("/")[1];
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name));
  return file.getId();
}

/* ---------------- demo data ---------------- */
/**
 * Fills the sheet with made-up demo data (6 sites, ~90 staff, users for every role, 30 days of checks
 * and audits). All demo PINs are 1234. Only runs on an empty sheet. Run it from the editor: choose
 * loadDemoData above and press ▶ Run. To start again, delete the tabs (except one) and run it again.
 */
function loadDemoData() {
  ensureAdmin_();
  if (rows_("Employees").length) throw new Error("The sheet already has staff. Delete the tabs first to load demo data.");
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const today = today_();
  const SITES = [["Al Reem Villas", 16, 0.97], ["Yas Community", 18, 0.86], ["Khalifa City Camp", 22, 0.93], ["Saadiyat Residences", 12, 0.985], ["Mussafah Workshop", 14, 0.89], ["Corniche Towers", 12, 0.95]];
  const siteId = {};
  const siteRows = SITES.map((s) => { const id = id_(); siteId[s[0]] = id; return { id: id, name: s[0], active: "1" }; });
  insertMany_("Sites", siteRows);
  const pin = hashPin_("1234");
  const USERS = [
    ["director", "Khalid Al Mansoori", "director", []], ["oco", "Layla Haddad", "oco", []], ["hse", "Arjun Nair", "hse", []],
    ["hr", "Mariam Saeed", "hr", []], ["stores", "Peter Fernandes", "stores", []],
    ["faisal", "Faisal Ahmed", "fm_manager", ["Al Reem Villas", "Saadiyat Residences"]], ["sanjay", "Sanjay Menon", "fm_manager", ["Yas Community", "Mussafah Workshop"]],
    ["tariq", "Tariq Hussain", "fm_manager", ["Khalifa City Camp", "Corniche Towers"]], ["omar", "Omar Siddiqui", "supervisor", ["Al Reem Villas"]],
    ["ravi", "Ravi Shankar", "supervisor", ["Yas Community"]], ["anil", "Anil Kumar", "supervisor", ["Khalifa City Camp"]],
    ["deepak", "Deepak Sharma", "supervisor", ["Saadiyat Residences"]], ["vinod", "Vinod Pillai", "supervisor", ["Mussafah Workshop"]],
    ["george", "George Mathew", "site_manager", ["Corniche Towers"]], ["campboss", "Hamid Rahimi", "camp_boss", ["Khalifa City Camp", "Al Reem Villas", "Yas Community"]],
  ];
  const userName = {};
  insertMany_("Users", USERS.map((x) => { userName[x[0]] = x[1]; return { id: id_(), username: x[0], name: x[1], role: x[2], pin: pin, sites: x[3].map((n) => siteId[n]).join(","), active: "1" }; }));
  const checker = { "Al Reem Villas": "omar", "Yas Community": "ravi", "Khalifa City Camp": "anil", "Saadiyat Residences": "deepak", "Mussafah Workshop": "vinod", "Corniche Towers": "george" };
  const FIRST = ["Mohammed", "Rajesh", "Bikash", "Joseph", "Abdul", "Suresh", "Imran", "Ramesh", "Nabin", "Vijay", "Ali", "Santosh", "Ganesh", "Prakash", "Sunil", "Arif", "Ramu", "Manoj", "Hari", "Kiran", "Shahid", "Dinesh", "Ajay", "Sameer", "Naveen", "Anwar", "Krishna", "Babu"];
  const LAST = ["Asif", "Kumar", "Thapa", "Thomas", "Rahman", "Babu", "Khan", "Pillai", "Shrestha", "Raj", "Hassan", "Gurung", "Yadav", "Nair", "Das", "Hussain", "Rai", "Singh", "Ali", "Varghese", "Tamang", "Sheikh", "Reddy", "Joshi"];
  const TRADES = ["Cleaner", "Cleaner", "Cleaner", "Technician", "Electrician", "Plumber", "AC Technician", "Helper", "Gardener", "Painter"];
  const ITEMS = {
    site: ["hygiene", "nails", "hair", "facial_hair", "uniform", "uniform_clean", "accessories", "id_card", "shoes", "gloves", "greeting", "phone"],
    camp: ["hygiene", "nails", "hair", "facial_hair", "uniform", "uniform_clean", "accessories", "id_card"],
    field: ["uniform", "id_card", "shoes", "gloves", "ppe_task", "greeting", "phone", "behaviour", "work_tidy"],
  };
  const SUPPLY = { uniform: "Full uniform, correct size", id_card: "ID card carried and displayed", shoes: "Safety shoes", gloves: "Correct gloves for the task", ppe_task: "Task PPE" };
  const used = {};
  const emps = [];
  let no = 1001;
  SITES.forEach((s) => {
    for (let i = 0; i < s[1]; i++) {
      let name;
      do name = pick(FIRST) + " " + pick(LAST); while (used[name]);
      used[name] = true;
      const careless = rnd() < 0.12;
      emps.push({ id: id_(), staff_no: "ABFM-" + no++, name: name, trade: pick(TRADES), site_id: siteId[s[0]], uniform_size: pick(["S", "M", "M", "L", "L", "XL", "XXL"]), shoe_size: String(39 + Math.floor(rnd() * 6)), trained_on: rnd() < (s[2] > 0.95 ? 0.95 : 0.7) ? addDays_(today, -1 - Math.floor(rnd() * 25)) : "", active: "1", _site: s[0], _care: careless ? s[2] - 0.12 : s[2] + (1 - s[2]) * 0.5 });
    }
  });
  const checks = [], supply = [], subs = [], findDates = {}, openGap = {};
  function doCheck(e, date, type, by, hour) {
    const id = id_();
    if (type !== "field" && rnd() < 0.03) { checks.push({ id: id, date: date, type: type, employee_id: e.id, site_id: e.site_id, status: rnd() < 0.5 ? "absent" : "leave", finding_no: "", gaps: "", note: "", photo: "", by: by, time: hour + ":10" }); return; }
    const gaps = [];
    ITEMS[type].forEach((code) => {
      if (rnd() <= Math.min(0.9995, e._care + (1 - e._care) * 0.985)) return;
      const supplyGap = !!SUPPLY[code] && rnd() < 0.35;
      gaps.push({ code: code, supply: supplyGap, action: supplyGap ? "" : pick(SUPPLY[code] ? ["item_issued", "sent_to_change", "verbal_warning"] : ["corrected", "verbal_warning", "sent_to_change"]) });
      if (supplyGap && !openGap[e.id + code]) {
        openGap[e.id + code] = true;
        const req = addDays_(date, -Math.floor(rnd() * 4));
        const lead = 2 + Math.floor(rnd() * 9);
        const issued = addDays_(req, lead) < today ? addDays_(req, lead) : "";
        supply.push({ id: id_(), employee_id: e.id, site_id: e.site_id, item: SUPPLY[code], requested_on: req, issued_on: issued, check_id: id, by: by });
        if (issued) openGap[e.id + code] = false;
      }
    });
    const isGap = gaps.some((g) => !g.supply);
    let fno = "";
    if (isGap) {
      const w = (findDates[e.id] || []).filter((d) => d >= addDays_(date, -90) && d !== date);
      fno = String(w.length + 1);
      if ((findDates[e.id] || []).indexOf(date) < 0) findDates[e.id] = w.concat([date]);
    }
    checks.push({ id: id, date: date, type: type, employee_id: e.id, site_id: e.site_id, status: isGap ? "gaps" : gaps.length ? "supply" : "pass", finding_no: fno, gaps: gaps.map((g) => g.code + ":" + (g.supply ? 1 : 0) + ":" + g.action).join(";"), note: isGap && rnd() < 0.3 ? pick(["Told to fix before going to the customer", "Second reminder this month", "Spoke with supervisor"]) : "", photo: "", by: by, time: hour + ":" + ("0" + Math.floor(rnd() * 60)).slice(-2) });
  }
  for (let back = 30; back >= 0; back--) {
    const date = addDays_(today, -back);
    SITES.forEach((s) => {
      const staff = emps.filter((e) => e._site === s[0]);
      const by = userName[checker[s[0]]];
      const isToday = back === 0;
      if (["Khalifa City Camp", "Al Reem Villas", "Yas Community"].indexOf(s[0]) >= 0 && !(isToday && s[0] === "Yas Community")) staff.forEach((e) => doCheck(e, date, "camp", userName.campboss, "06"));
      if (!isToday && rnd() > (s[0] === "Khalifa City Camp" || s[0] === "Mussafah Workshop" ? 0.82 : 0.97)) return;
      const SHARE = { "Al Reem Villas": 0.7, "Mussafah Workshop": 0.3, "Khalifa City Camp": 0 };
      const share = isToday && SHARE.hasOwnProperty(s[0]) ? SHARE[s[0]] : 1;
      const n = Math.round(staff.length * share);
      staff.slice(0, n).forEach((e) => doCheck(e, date, "site", by, "08"));
      if (n === staff.length) {
        const list = checks.filter((c) => c.site_id === siteId[s[0]] && c.date === date && c.type === "site");
        subs.push({ site_id: siteId[s[0]], date: date, by: by, time: (16 + Math.floor(rnd() * 2)) + ":" + ("0" + Math.floor(rnd() * 60)).slice(-2), total: staff.length, passed: list.filter((c) => c.status === "pass").length, gaps: list.filter((c) => c.status === "gaps").length, supply: list.filter((c) => c.status === "supply").length, absent: list.filter((c) => c.status === "absent" || c.status === "leave").length });
      }
      if (rnd() < (s[2] > 0.94 ? 0.5 : 0.25)) {
        const techs = staff.filter((e) => e.trade !== "Cleaner");
        if (techs.length) doCheck(pick(techs), date, "field", by, "11");
      }
    });
  }
  insertMany_("Employees", emps.map((e) => { const o = Object.assign({}, e); delete o._site; delete o._care; return o; }));
  insertMany_("Checks", checks);
  insertMany_("Supply", supply);
  insertMany_("Submissions", subs);
  const FINDINGS = [["Uniform not pressed", "Verbal warning recorded"], ["No ear plugs at grinder", "Ear plugs issued, toolbox talk"], ["ID card not displayed", "Replacement card"], ["Hair below collar (repeat)", "Written warning and refresher"], ["Field checks below target", "3 field checks per week scheduled"], ["Gloves not worn for chemical cleaning", "Rubber gloves issued"], ["Phone call in customer's home", "Verbal warning recorded"]];
  const FM = { "Al Reem Villas": "Faisal A.", "Saadiyat Residences": "Faisal A.", "Yas Community": "Sanjay M.", "Mussafah Workshop": "Sanjay M.", "Khalifa City Camp": "Tariq H.", "Corniche Towers": "Tariq H." };
  const PLAN = [["Al Reem Villas", 6, [28, 23, 25, 15]], ["Yas Community", 20, [26, 21, 22, 15]], ["Yas Community", 5, [24, 20, 21, 14]], ["Khalifa City Camp", 12, [27, 23, 23, 13]], ["Saadiyat Residences", 9, [29, 24, 24, 18]], ["Mussafah Workshop", 36, [27, 22, 23, 16]], ["Mussafah Workshop", 5, [24, 21, 23, 15]], ["Corniche Towers", 15, [27, 22, 24, 16]]];
  const audits = [], actions = [];
  PLAN.forEach((p, k) => {
    const d = addDays_(today, -p[1]);
    const sc = p[2];
    const total = sc[0] + sc[1] + sc[2] + sc[3];
    const id = id_();
    audits.push({ id: id, site_id: siteId[p[0]], date: d, auditor: userName.oco, with_hse: rnd() < 0.6 ? userName.hse : "", sample: String(5 + Math.floor(rnd() * 3)), s_grooming: sc[0], s_ppe: sc[1], s_comm: sc[2], s_control: sc[3], notes: total < 85 ? "Several grooming gaps seen at the morning muster." : "Good overall standard.", report_on: p[1] >= 2 ? addDays_(d, 1) : "", plan_on: p[1] >= 3 ? addDays_(d, 3) : "", verified_on: p[1] > 7 && total >= 85 ? addDays_(d, 9) : "" });
    const staff = emps.filter((e) => e._site === p[0]);
    const n = total >= 90 ? 1 : total >= 85 ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const f = FINDINGS[(k * 3 + i) % FINDINGS.length];
      const emp = f[0].indexOf("Field") === 0 ? null : pick(staff);
      const old = p[1] > 7;
      let closed = old ? (rnd() < 0.8 ? addDays_(d, 2 + Math.floor(rnd() * 6)) : "") : rnd() < 0.4 ? addDays_(d, 1 + Math.floor(rnd() * Math.max(1, p[1] - 1))) : "";
      if (closed > today) closed = "";
      actions.push({ id: id_(), audit_id: id, finding: f[0], employee_id: emp ? emp.id : "", action: f[1], owner: emp ? FM[p[0]] : FM[p[0]] + " + HR", due_on: addDays_(d, 7), closed_on: closed });
    }
  });
  insertMany_("Audits", audits);
  insertMany_("Actions", actions);
  return "Demo data loaded: " + emps.length + " staff, " + checks.length + " checks, " + audits.length + " audits. Demo PINs are 1234.";
}
