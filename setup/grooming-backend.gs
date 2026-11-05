/**
 * ABFM Grooming Control: private backend.
 *
 * Runs in the Supabase Edge Function "api" (supabase/functions/api), which supplies the Google-style
 * services this file was first written for (tables, storage) on top of Postgres. The local test server
 * in dev/ runs it the same way.
 *
 * Who signs in, and how (the same model as ABFM Training):
 *  - Dashboard admins (OCO, Director, HR, Stores, FM Managers) sign in with email and password (Supabase Auth).
 *    The Edge Function checks their sign-in and passes the confirmed email in as b._email.
 *    SUPER_ADMIN (the OCO) is the only one who can add or remove dashboard admins.
 *  - Checklist app users (Camp Boss, HSE, Supervisors, Site Managers) sign in with their HR number only.
 *    Admins add them in the dashboard.
 */
const SUPER_ADMIN = "zarrade.omar@gmail.com";   // the OCO: the only one who can add or remove dashboard admins
const PHOTO_FOLDER = "ABFM Grooming photos";
const TZ = "Asia/Dubai";
const SESSION_DAYS = 14;

/* ---------------- tables ---------------- */
const TABLES = {
  Sites: ["id", "name", "active"],
  Users: ["id", "username", "name", "role", "pin", "sites", "active", "email"],
  Employees: ["id", "staff_no", "name", "trade", "site_id", "uniform_size", "shoe_size", "trained_on", "active", "baseline_on", "ppe_held", "missing", "accommodation"],
  Checks: ["id", "date", "type", "employee_id", "site_id", "status", "finding_no", "gaps", "note", "photo", "by", "time"],
  Supply: ["id", "employee_id", "site_id", "item", "requested_on", "issued_on", "check_id", "by"],
  Submissions: ["site_id", "date", "by", "time", "total", "passed", "gaps", "supply", "absent"],
  Audits: ["id", "site_id", "date", "auditor", "with_hse", "sample", "s_grooming", "s_ppe", "s_comm", "s_control", "notes", "report_on", "plan_on", "verified_on"],
  Actions: ["id", "audit_id", "finding", "employee_id", "action", "owner", "due_on", "closed_on"],
  Incidents: ["id", "date", "time", "site_id", "employee_id", "type", "location", "details", "action", "reported_by", "status", "ack_by", "ack_on", "closed_on", "outcome"],
  Discipline: ["id", "employee_id", "site_id", "date", "level", "action", "amount", "notes", "by"],
  Activity: ["time", "user", "role", "action", "details"],
  Settings: ["key", "value"],
};

/** Rules the dashboard can change (Sites & users → Rules). Values are kept in the Settings tab. */
const SETTING_DEFAULTS = {
  auditPass: 85, findingCloseDays: 7, reportDays: 2, planDays: 3, reauditDays: 14, fieldChecksPerWeek: 3,
  supplyWorkingDays: 5, warningWindowDays: 90, trainingDeadline: "2026-11-25", checklistDue: "18:00", siteChecklist: "1",
  deductRepeat: "", deductFurther: "", digestOn: "0", digestHour: 19, dashboardUrl: "",
};
const INCIDENT_TYPES = ["difficult_customer", "complaint", "serious_conduct", "damage", "other"];
const DISCIPLINE_LEVELS = ["verbal", "written", "refresher", "hr_action", "deduction", "removal", "investigation"];
const BASELINE_ITEMS = ["uniform", "id_card", "shoes", "gloves_fabric", "gloves_rubber", "mask", "goggles", "ear_plugs", "helmet", "shoe_covers"];

const ROLES = {
  supervisor: { field: true, manage: false, all: false },
  camp_boss: { field: true, manage: false, all: true },     // works by camp (accommodation), across all sites
  site_manager: { field: true, manage: false, all: false },
  fm_manager: { field: true, manage: true, all: false },
  director: { field: false, manage: true, all: true },
  oco: { field: true, manage: true, all: true },            // dashboard, plus site and field checks from the phone
  hse: { field: true, manage: false, all: true },            // HSE officers check staff and PPE on any site, from the phone
  hr: { field: false, manage: true, all: true },
  stores: { field: false, manage: true, all: true },
};
/** Dashboard roles sign in with email; the others sign in to the checklist app with their HR number. */
const isAdminRole_ = (role) => !!(ROLES[role] && ROLES[role].manage);
const normHr_ = (v) => String(v == null ? "" : v).replace(/\s+/g, "").toUpperCase().slice(0, 30);
const normEmail_ = (v) => String(v == null ? "" : v).trim().toLowerCase().slice(0, 120);
const CAN = {
  audit: (u) => ["oco", "hse", "director", "admin"].indexOf(u.role) >= 0,
  closeActions: (u) => ["oco", "hse", "director", "admin", "fm_manager", "hr"].indexOf(u.role) >= 0,
  issueSupply: (u) => ["stores", "hr", "admin", "director", "fm_manager", "supervisor", "site_manager"].indexOf(u.role) >= 0,
  manageStaff: (u) => ["admin", "hr", "director", "oco"].indexOf(u.role) >= 0,
  manageUsers: (u) => ["admin", "director", "oco"].indexOf(u.role) >= 0,
  markTraining: (u) => u.role !== "stores",
  discipline: (u) => ["hr", "director", "admin", "fm_manager"].indexOf(u.role) >= 0,
  incidents: (u) => ["fm_manager", "oco", "hse", "hr", "director", "admin"].indexOf(u.role) >= 0,
  activity: (u) => ["admin", "director", "oco", "hr"].indexOf(u.role) >= 0,
  settings: (u) => ["admin", "director", "oco"].indexOf(u.role) >= 0,
  checkTypes: (u) => (u.role === "camp_boss" ? ["camp"] : u.role === "admin" ? ["site", "camp", "field"] : ["site", "field"]),
};

/* ---------------- sheet helpers ---------------- */
const cache_ = {};
const checked_ = {};
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 2000, TABLES[name].length).setNumberFormat("@");   // keep everything as plain text
    sh.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]);
    sh.setFrozenRows(1);
  } else if (!checked_[name]) {
    // Older sheets: add any new columns to the header row.
    const n = TABLES[name].length;
    const head = sh.getRange(1, 1, 1, n).getValues()[0].map(norm_);
    if (head.join("|") !== TABLES[name].join("|")) {
      sh.getRange(1, 1, Math.max(2, sh.getMaxRows()), n).setNumberFormat("@");
      sh.getRange(1, 1, 1, n).setValues([TABLES[name]]);
    }
  }
  checked_[name] = true;
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

function settings_() {
  if (cache_._settings) return cache_._settings;
  const out = Object.assign({}, SETTING_DEFAULTS);
  rows_("Settings").forEach((r) => {
    if (!SETTING_DEFAULTS.hasOwnProperty(r.key)) return;
    out[r.key] = typeof SETTING_DEFAULTS[r.key] === "number" ? Number(r.value) || SETTING_DEFAULTS[r.key] : r.value;
  });
  return (cache_._settings = out);
}
const isDate_ = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

/* ---------------- PINs and sessions ---------------- */
function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty("SESSION_SECRET");
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty("SESSION_SECRET", s); }
  return s;
}
function sign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_())).replace(/=+$/, "");
}
/** A signed-in admin (email confirmed by Supabase Auth). The super admin always has an account. */
function userFromEmail_(email) {
  email = normEmail_(email);
  let u = rows_("Users").filter((x) => normEmail_(x.email) === email && isAdminRole_(x.role))[0];
  if (!u && email === SUPER_ADMIN) u = insert_("Users", { id: id_(), username: email, name: "Operations Control Officer", role: "oco", pin: "", sites: "", active: "1", email: email });
  if (!u || u.active !== "1") fail_("not_admin");
  return publicUser_(u);
}
function userFromToken_(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) fail_("login");
  if (sign_(parts[0] + "." + parts[1]) !== parts[2]) fail_("login");
  if (Number(parts[1]) < Date.now() / 1000) fail_("login");
  const u = rows_("Users").filter((x) => x.id === parts[0] && x.active === "1")[0];
  if (!u || isAdminRole_(u.role)) fail_("login");        // admins use their email sign-in, not HR tokens
  return publicUser_(u);
}
function publicUser_(u) {
  const r = ROLES[u.role] || ROLES.supervisor;
  const active = rows_("Sites").filter((s) => s.active === "1").map((s) => s.id);
  const own = String(u.sites || "").split(",").filter(Boolean);
  return {
    id: u.id, username: u.username, name: u.name, role: u.role, field: r.field, manage: r.manage,
    super: normEmail_(u.email) === SUPER_ADMIN && u.role === "oco",
    siteIds: r.all ? active : own.filter((s) => active.indexOf(s) >= 0),
    email: u.email || "",
    can: { audit: CAN.audit(u), closeActions: CAN.closeActions(u), issueSupply: CAN.issueSupply(u), manageStaff: CAN.manageStaff(u), manageUsers: CAN.manageUsers(u), markTraining: CAN.markTraining(u), checkTypes: CAN.checkTypes(u),
      discipline: CAN.discipline(u), incidents: CAN.incidents(u), activity: CAN.activity(u), settings: CAN.settings(u),
      manageAdmins: normEmail_(u.email) === SUPER_ADMIN && u.role === "oco" },
  };
}
function siteOk_(u, siteId) { if (u.siteIds.indexOf(String(siteId)) < 0) fail_("site"); }

/* ---------------- entry points ---------------- */
function doGet() { return json_({ ok: true, app: "ABFM Grooming backend" }); }

function doPost(e) {
  let b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad" }); }
  const fnName = String(b.fn || b.action || "");      // "fn" names the function; older pages sent "action"
  const write = WRITES.hasOwnProperty(fnName);
  const lock = write ? LockService.getScriptLock() : null;
  try {
    if (lock) lock.waitLock(20000);
    if (fnName === "login") return json_(login_(b));
    const u = b._email ? userFromEmail_(b._email) : userFromToken_(b.token);
    const fn = READS.hasOwnProperty(fnName) ? READS[fnName] : WRITES.hasOwnProperty(fnName) ? WRITES[fnName] : null;
    if (!fn) return json_({ ok: false, error: "unknown" });
    const out = fn(u, b) || {};
    if (write) log_(u, fnName, b, out);
    out.ok = true;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: err.user ? err.message : "error", detail: err.user ? undefined : String(err).slice(0, 300) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

/** Checklist app sign-in with an HR number. Too many unknown numbers from one place locks it for 10 minutes. */
function login_(b) {
  const hr = normHr_(b.hr);
  const c = CacheService.getScriptCache();
  const key = "hr:" + clip_(b._ip || "", 60);
  const fails = Number(c.get(key) || 0);
  if (fails >= 10) return { ok: false, error: "locked" };
  const u = hr ? rows_("Users").filter((x) => normHr_(x.username) === hr && !isAdminRole_(x.role))[0] : null;
  if (!u) { c.put(key, String(fails + 1), 600); return { ok: false, error: "hr" }; }
  if (u.active !== "1") return { ok: false, error: "inactive" };
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = u.id + "." + exp;
  return { ok: true, token: payload + "." + sign_(payload), user: publicUser_(u) };
}

/* ---------------- reads ---------------- */
/** Camp Boss view: staff are grouped by where they live (accommodation), not by site. */
function campView_(u, b, out, today) {
  const mine = {};
  u.siteIds.forEach((s) => (mine[s] = true));
  const live = rows_("Employees").filter((e) => e.active === "1" && mine[e.site_id]);
  const counts = {};
  live.forEach((e) => { const c = e.accommodation || ""; if (c && !/^out/i.test(c)) counts[c] = (counts[c] || 0) + 1; });
  const camps = Object.keys(counts).sort((a, x) => counts[x] - counts[a]);
  const camp = camps.indexOf(String(b.camp || "")) >= 0 ? String(b.camp) : camps[0] || "";
  const staff = live.filter((e) => e.accommodation === camp);
  const ids = {};
  staff.forEach((e) => (ids[e.id] = true));
  out.camps = camps.map((c) => ({ name: c, staff: counts[c] }));
  out.camp = camp;
  out.staff = staff.map(emp_);
  out.checks = rows_("Checks").filter((c) => ids[c.employee_id] && c.date >= addDays_(today, -6)).map(check_);
  out.findings = findings_(ids, addDays_(today, -settings_().warningWindowDays), today);
  out.supply = rows_("Supply").filter((g) => ids[g.employee_id] && !g.issued_on).map(supply_);
  out.submission = null;
  out.incidents = rows_("Incidents").filter((x) => x.reported_by === u.name && (!x.closed_on || x.date >= addDays_(today, -6))).map(incident_);
  return out;
}

const READS = {
  /** Everything the phone app needs for one site. */
  field: function (u, b) {
    if (!u.field) fail_("role");
    const sites = rows_("Sites").filter((s) => u.siteIds.indexOf(s.id) >= 0).map(site_);
    const siteId = u.siteIds.indexOf(String(b.site)) >= 0 ? String(b.site) : u.siteIds[0];
    const today = today_();
    const out = { user: u, sites: sites, today: today, site: siteId || null, settings: settings_() };
    if (!siteId) return out;
    if (u.role === "camp_boss") return campView_(u, b, out, today);
    const staff = rows_("Employees").filter((e) => e.site_id === siteId && e.active === "1");
    const ids = {};
    staff.forEach((e) => (ids[e.id] = true));
    const from = addDays_(today, -settings_().warningWindowDays);
    out.staff = staff.map(emp_);
    out.checks = rows_("Checks").filter((c) => c.site_id === siteId && c.date >= addDays_(today, -6)).map(check_);
    out.findings = findings_(ids, from, today);
    out.supply = rows_("Supply").filter((g) => g.site_id === siteId && !g.issued_on).map(supply_);
    out.submission = rows_("Submissions").filter((s) => s.site_id === siteId && s.date === today).map(sub_)[0] || null;
    out.incidents = rows_("Incidents").filter((x) => x.site_id === siteId && (!x.closed_on || x.date >= addDays_(today, -6))).map(incident_);
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
      incidents: rows_("Incidents").filter((x) => mine[x.site_id]).map(incident_),
      discipline: rows_("Discipline").filter((x) => mine[x.site_id]).map(discipline_),
      settings: settings_(),
    };
    if (u.can.manageUsers) {
      out.users = rows_("Users").map((x) => ({ id: x.id, username: x.username, name: x.name, role: x.role, email: x.email || "", admin: isAdminRole_(x.role), super: normEmail_(x.email) === SUPER_ADMIN && x.role === "oco", sites: String(x.sites).split(",").filter(Boolean), active: x.active === "1" }));
    }
    return out;
  },

  /** Latest entries of the activity log (who did what). */
  activity: function (u, b) {
    if (!u.can.activity) fail_("role");
    const sh = sheet_("Activity");
    const last = sh.getLastRow();
    const n = Math.min(Math.max(50, Number(b.limit) || 500), 3000);
    if (last < 2) return { activity: [] };
    const start = Math.max(2, last - n + 1);
    const vals = sh.getRange(start, 1, last - start + 1, TABLES.Activity.length).getValues();
    return { activity: vals.reverse().map((r) => ({ time: norm_(r[0]), user: norm_(r[1]), role: norm_(r[2]), action: norm_(r[3]), details: norm_(r[4]) })) };
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
function emp_(e) { return { id: e.id, staff_no: e.staff_no, name: e.name, trade: e.trade, site_id: e.site_id, uniform_size: e.uniform_size, shoe_size: e.shoe_size, trained_on: e.trained_on || null, active: e.active === "1", baseline_on: e.baseline_on || null, ppe_held: String(e.ppe_held || "").split(",").filter(Boolean), missing: e.missing || "", accommodation: e.accommodation || "" }; }
function incident_(x) { return { id: x.id, date: x.date, time: x.time, site_id: x.site_id, employee_id: x.employee_id || null, type: x.type, location: x.location, details: x.details, action: x.action, reported_by: x.reported_by, status: x.closed_on ? "closed" : x.ack_on ? "acknowledged" : "open", ack_by: x.ack_by, ack_on: x.ack_on || null, closed_on: x.closed_on || null, outcome: x.outcome }; }
function discipline_(x) { return { id: x.id, employee_id: x.employee_id, site_id: x.site_id, date: x.date, level: x.level, action: x.action, amount: x.amount ? Number(x.amount) : null, notes: x.notes, by: x.by }; }
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
      const prior = findings_(ids, addDays_(today, -settings_().warningWindowDays), today)[emp.id] || [];
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
      insert_("Actions", { id: id_(), audit_id: a.id, finding: finding, employee_id: clip_(f.employee_id, 20), action: clip_(f.action, 300), owner: clip_(f.owner, 80), due_on: /^\d{4}-\d{2}-\d{2}$/.test(f.due_on || "") ? f.due_on : addDays_(date, settings_().findingCloseDays), closed_on: "" });
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
    insert_("Actions", { id: id_(), audit_id: a.id, finding: finding, employee_id: clip_(b.employee_id, 20), action: clip_(b.action, 300), owner: clip_(b.owner, 80), due_on: /^\d{4}-\d{2}-\d{2}$/.test(b.due_on || "") ? b.due_on : addDays_(a.date, settings_().findingCloseDays), closed_on: "" });
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

  /**
   * Checklist app users (HR number) can be managed by the OCO and the Director.
   * Dashboard admins (email) only by the super admin. Nobody else can be OCO.
   */
  saveUser: function (u, b) {
    if (!u.can.manageUsers) fail_("role");
    const x = b.id ? rows_("Users").filter((y) => y.id === String(b.id))[0] : null;
    if (b.id && !x) fail_("notfound");
    const role = b.role !== undefined ? String(b.role) : x.role;
    if (!ROLES[role]) fail_("role_name");
    const admin = isAdminRole_(role);
    if ((admin || (x && isAdminRole_(x.role))) && !u.can.manageAdmins) fail_("super_only");
    if (role === "oco" && !(x && x.role === "oco")) fail_("one_oco");
    if (x && x.role === "oco" && (role !== "oco" || b.active === false)) fail_("self");
    if (x && x.id === u.id && b.active === false) fail_("self");
    const sites = b.sites !== undefined ? (Array.isArray(b.sites) ? b.sites : []).map(String).filter((s) => rows_("Sites").some((y) => y.id === s)).join(",") : (x ? x.sites : "");
    let username = x ? x.username : "";
    let email = x ? x.email : "";
    if (admin) {
      if (b.email !== undefined || !x || !isAdminRole_(x.role)) {
        email = normEmail_(b.email);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail_("email");
        if (rows_("Users").some((y) => y !== x && isAdminRole_(y.role) && normEmail_(y.email) === email)) fail_("exists");
      }
      username = email;
    } else {
      if (b.hr !== undefined || !x || isAdminRole_(x.role)) {
        username = normHr_(b.hr);
        if (!username) fail_("hr_format");
        if (rows_("Users").some((y) => y !== x && !isAdminRole_(y.role) && normHr_(y.username) === username)) fail_("exists");
      }
      if (b.email !== undefined) {
        email = normEmail_(b.email);
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail_("email");
      }
    }
    const name = b.name !== undefined ? clip_(b.name, 80) : x.name;
    if (!name) fail_("name");
    if (x) {
      x.name = name; x.role = role; x.sites = sites; x.username = username; x.email = email; x.pin = "";
      if (b.active !== undefined) x.active = b.active ? "1" : "0";
      update_("Users", x);
      return;
    }
    insert_("Users", { id: id_(), username: username, name: name, role: role, pin: "", sites: sites, active: "1", email: email });
  },

  saveEmployee: function (u, b) {
    if (!u.can.manageStaff) fail_("role");
    const rec = {
      staff_no: clip_(b.staff_no, 30), name: clip_(b.name, 80), trade: clip_(b.trade, 60), site_id: clip_(b.site_id, 20),
      uniform_size: clip_(b.uniform_size, 10), shoe_size: clip_(b.shoe_size, 10), accommodation: clip_(b.accommodation, 80),
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
      if (c[6]) rec.accommodation = c[6];
      if (site) rec.site_id = site.id;
      if (e && e._row) { Object.assign(e, rec); update_("Employees", e); updated++; }
      else if (e) { Object.assign(e, rec); updated++; }
      else { fresh.push(Object.assign({ id: id_(), site_id: "", trained_on: "" }, rec)); added++; }
    });
    insertMany_("Employees", fresh);
    return { added: added, updated: updated, skipped: skipped };
  },

  saveSettings: function (u, b) {
    if (!u.can.settings) fail_("role");
    const vals = b.settings || {};
    const cur = rows_("Settings");
    Object.keys(SETTING_DEFAULTS).forEach((k) => {
      if (!vals.hasOwnProperty(k)) return;
      let v = vals[k];
      if (typeof SETTING_DEFAULTS[k] === "number") {
        v = Math.round(Number(v));
        if (!(v >= 0 && v <= 365)) fail_("setting");
      } else if (k === "trainingDeadline") { if (v && !isDate_(v)) fail_("setting"); }
      else if (k === "checklistDue") { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) fail_("setting"); }
      else if (k === "deductRepeat" || k === "deductFurther") { v = String(v).trim(); if (v && !(Number(v) >= 0)) fail_("setting"); }
      else if (k === "digestOn" || k === "siteChecklist") v = v === true || v === "1" ? "1" : "0";
      else v = clip_(v, 300);
      const row = cur.filter((r) => r.key === k)[0];
      if (row) { row.value = String(v); update_("Settings", row); } else insert_("Settings", { key: k, value: String(v) });
    });
    delete cache_._settings;
    if (vals.hasOwnProperty("digestOn") || vals.hasOwnProperty("digestHour")) {
      try { scheduleDigest_(); } catch (e) { return { settings: settings_(), warning: "email" }; }
    }
    return { settings: settings_() };
  },

  addIncident: function (u, b) {
    siteOk_(u, b.site_id);
    if (INCIDENT_TYPES.indexOf(b.type) < 0) fail_("bad");
    const details = clip_(b.details, 2000);
    if (!details) fail_("details");
    let emp = "";
    if (b.employee_id) {
      const e = rows_("Employees").filter((x) => x.id === String(b.employee_id))[0];
      if (!e || e.site_id !== String(b.site_id)) fail_("notfound");
      emp = e.id;
    }
    const x = insert_("Incidents", {
      id: id_(), date: today_(), time: now_(), site_id: String(b.site_id), employee_id: emp, type: b.type,
      location: clip_(b.location, 200), details: details, action: clip_(b.action, 1000), reported_by: u.name,
      status: "open", ack_by: "", ack_on: "", closed_on: "", outcome: "",
    });
    return { incident: incident_(x) };
  },

  updateIncident: function (u, b) {
    if (!u.can.incidents) fail_("role");
    const x = rows_("Incidents").filter((y) => y.id === String(b.id))[0];
    if (!x) fail_("notfound");
    siteOk_(u, x.site_id);
    if (b.op === "ack") { x.ack_by = u.name; x.ack_on = today_(); }
    else if (b.op === "close") { if (!x.ack_on) { x.ack_by = u.name; x.ack_on = today_(); } x.closed_on = today_(); x.outcome = clip_(b.outcome, 1000); }
    else if (b.op === "reopen") { x.closed_on = ""; }
    else fail_("bad");
    update_("Incidents", x);
  },

  addDiscipline: function (u, b) {
    if (!u.can.discipline) fail_("role");
    if (DISCIPLINE_LEVELS.indexOf(b.level) < 0) fail_("bad");
    if (u.role === "fm_manager" && ["verbal", "written", "refresher"].indexOf(b.level) < 0) fail_("role");
    const e = rows_("Employees").filter((x) => x.id === String(b.employee_id))[0];
    if (!e) fail_("notfound");
    siteOk_(u, e.site_id);
    const amount = String(b.amount || "").trim();
    if (amount && !(Number(amount) >= 0)) fail_("amount");
    insert_("Discipline", {
      id: id_(), employee_id: e.id, site_id: e.site_id, date: isDate_(b.date) && b.date <= today_() ? b.date : today_(),
      level: b.level, action: clip_(b.action, 300), amount: amount, notes: clip_(b.notes, 1000), by: u.name,
    });
  },

  deleteDiscipline: function (u, b) {
    if (!u.can.discipline) fail_("role");
    const x = rows_("Discipline").filter((y) => y.id === String(b.id))[0];
    if (!x) fail_("notfound");
    siteOk_(u, x.site_id);
    sheet_("Discipline").deleteRow(x._row);
    delete cache_.Discipline;
  },

  /** Baseline check: sizes, PPE held and missing items. Missing PPE can go straight to the supply list. */
  saveBaseline: function (u, b) {
    if (!u.field && !u.can.manageStaff) fail_("role");
    const e = rows_("Employees").filter((x) => x.id === String(b.employee_id))[0];
    if (!e) fail_("notfound");
    siteOk_(u, e.site_id);
    const held = (Array.isArray(b.held) ? b.held : []).filter((c) => BASELINE_ITEMS.indexOf(c) >= 0);
    e.uniform_size = clip_(b.uniform_size, 10);
    e.shoe_size = clip_(b.shoe_size, 10);
    e.ppe_held = held.join(",");
    e.missing = clip_(b.missing, 500);
    e.baseline_on = today_();
    update_("Employees", e);
    let requested = 0;
    if (b.request) {
      (Array.isArray(b.requestLabels) ? b.requestLabels : []).slice(0, 20).forEach((label) => {
        label = clip_(label, 80);
        if (!label) return;
        if (rows_("Supply").some((g) => g.employee_id === e.id && g.item === label && !g.issued_on)) return;
        insert_("Supply", { id: id_(), employee_id: e.id, site_id: e.site_id, item: label, requested_on: today_(), issued_on: "", check_id: "", by: u.name });
        requested++;
      });
    }
    return { employee: emp_(e), requested: requested };
  },

  /** Send the daily summary to me now (to test the email). */
  testDigest: function (u) {
    const me = rows_("Users").filter((x) => x.id === u.id)[0];
    if (!me.email) fail_("no_email");
    sendDigestTo_(me, true);
  },
};

/* ---------------- activity log ---------------- */
function log_(u, fn, b, out) {
  const name = (id, table) => { const r = id ? rows_(table).filter((x) => x.id === String(id))[0] : null; return r ? r.name : ""; };
  let d = "";
  try {
    switch (fn) {
      case "saveCheck": d = name(b.employee_id, "Employees") + " · " + b.type + " check · " + (out.check ? out.check.status : ""); break;
      case "submitDay": d = name(b.site_id, "Sites"); break;
      case "addSupply": d = name(b.employee_id, "Employees") + " · " + clip_(b.item, 60); break;
      case "issueSupply": { const g = rows_("Supply").filter((x) => x.id === String(b.id))[0]; d = g ? name(g.employee_id, "Employees") + " · " + g.item : "id " + b.id; break; }
      case "toggleAction": { const x = rows_("Actions").filter((y) => y.id === String(b.id))[0]; d = (x ? x.finding : "id " + b.id) + (b.reopen ? " · reopened" : " · closed"); break; }
      case "auditStep": { const a = rows_("Audits").filter((y) => y.id === String(b.id))[0]; d = (a ? name(a.site_id, "Sites") + " audit " + a.date : "id " + b.id) + " · " + b.step + (b.undo ? " undone" : ""); break; }
      case "updateIncident": { const x = rows_("Incidents").filter((y) => y.id === String(b.id))[0]; d = (x ? name(x.site_id, "Sites") + " · " + x.type + (x.employee_id ? " · " + name(x.employee_id, "Employees") : "") : "id " + b.id) + " · " + b.op; break; }
      case "deleteDiscipline": d = "entry " + b.id; break;
      case "trained": d = name(b.employee_id, "Employees") + (b.undo ? " · undone" : ""); break;
      case "createAudit": d = name(b.site_id, "Sites") + " · " + ((+b.s_grooming || 0) + (+b.s_ppe || 0) + (+b.s_comm || 0) + (+b.s_control || 0)); break;
      case "addAction": d = clip_(b.finding, 80); break;
      case "saveSite": d = clip_(b.name, 60) || ("id " + b.id); break;
      case "saveUser": d = clip_(b.name || b.hr || b.email || ("id " + b.id), 60) + (b.role ? " · " + b.role : "") + (b.active !== undefined ? (b.active ? " · activated" : " · deactivated") : ""); break;
      case "saveEmployee": d = clip_(b.staff_no, 30) + " " + clip_(b.name, 60); break;
      case "importEmployees": d = (out.added || 0) + " added, " + (out.updated || 0) + " updated"; break;
      case "saveSettings": d = Object.keys(b.settings || {}).join(", "); break;
      case "addIncident": d = name(b.site_id, "Sites") + " · " + b.type; break;
      case "addDiscipline": d = name(b.employee_id, "Employees") + " · " + b.level + (b.amount ? " · AED " + b.amount : ""); break;
      case "saveBaseline": d = name(b.employee_id, "Employees"); break;
      default: d = "";
    }
  } catch (e) { d = ""; }
  insert_("Activity", { time: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm"), user: u.name, role: u.role, action: fn, details: clip_(d, 300) });
}

/* ---------------- daily email summary ---------------- */
/** Run once from the editor to allow email and start the daily summary. */
function setupDailyEmail() {
  const cur = rows_("Settings").filter((r) => r.key === "digestOn")[0];
  if (cur) { cur.value = "1"; update_("Settings", cur); } else insert_("Settings", { key: "digestOn", value: "1" });
  delete cache_._settings;
  scheduleDigest_();
  return "Daily email summary turned on at " + settings_().digestHour + ":00 Dubai time. Managers with an email address will receive it.";
}
function scheduleDigest_() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === "sendDailyDigest") ScriptApp.deleteTrigger(t); });
  const st = settings_();
  if (st.digestOn === "1") ScriptApp.newTrigger("sendDailyDigest").timeBased().everyDays(1).atHour(Math.min(23, Math.max(0, st.digestHour))).inTimezone(TZ).create();
}
function sendDailyDigest() {
  if (settings_().digestOn !== "1") return;
  rows_("Users").filter((x) => x.active === "1" && x.email && (ROLES[x.role] || {}).manage).forEach((x) => {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    try { sendDigestTo_(x, false); } catch (e) { console.error(e); }
  });
}
/** Builds and sends one person's summary for their sites. Quiet days send nothing unless forced. */
function sendDigestTo_(user, force) {
  const u = publicUser_(user);
  const st = settings_();
  const today = today_();
  const mine = {};
  u.siteIds.forEach((s) => (mine[s] = true));
  const sites = rows_("Sites").filter((s) => mine[s.id]);
  const siteName = (id) => (sites.filter((s) => s.id === id)[0] || {}).name || "";
  const staffBySite = {};
  rows_("Employees").forEach((e) => { if (e.active === "1" && mine[e.site_id]) staffBySite[e.site_id] = (staffBySite[e.site_id] || 0) + 1; });
  const subs = rows_("Submissions").filter((x) => x.date === today && mine[x.site_id]);
  const notSent = st.siteChecklist === "0" ? [] : sites.filter((s) => staffBySite[s.id] && !subs.some((x) => x.site_id === s.id)).map((s) => s.name);
  const late = subs.filter((x) => x.time > st.checklistDue).map((x) => siteName(x.site_id) + " (" + x.time + ")");
  const audits = rows_("Audits").filter((a) => mine[a.site_id]);
  const auditById = {};
  audits.forEach((a) => (auditById[a.id] = a));
  const overdue = rows_("Actions").filter((x) => !x.closed_on && auditById[x.audit_id] && x.due_on < today)
    .map((x) => siteName(auditById[x.audit_id].site_id) + ": " + x.finding + " (due " + x.due_on + ", " + x.owner + ")");
  const incidents = rows_("Incidents").filter((x) => mine[x.site_id] && !x.closed_on);
  const serious = incidents.filter((x) => x.type === "serious_conduct").map((x) => siteName(x.site_id) + ": " + x.details.slice(0, 80));
  const findingsToday = rows_("Checks").filter((c) => c.date === today && mine[c.site_id] && c.status === "gaps").length;
  const supplyOld = rows_("Supply").filter((g) => mine[g.site_id] && !g.issued_on && workingDays_(g.requested_on, today) > st.supplyWorkingDays).length;
  const failing = sites.map((s) => audits.filter((a) => a.site_id === s.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0]).filter((a) => a && (+a.s_grooming + +a.s_ppe + +a.s_comm + +a.s_control) < st.auditPass)
    .map((a) => siteName(a.site_id) + " (" + (+a.s_grooming + +a.s_ppe + +a.s_comm + +a.s_control) + ", re-audit by " + addDays_(a.date, st.reauditDays) + ")");
  const items = notSent.length + late.length + overdue.length + incidents.length + supplyOld + failing.length;
  if (!items && !force) return;
  const li = (list) => "<ul>" + list.slice(0, 15).map((t) => "<li>" + esc_(t) + "</li>").join("") + (list.length > 15 ? "<li>… and " + (list.length - 15) + " more</li>" : "") + "</ul>";
  const sec = (title, list) => (list.length ? "<h3 style=\"font:600 15px Arial;color:#333447;margin:18px 0 4px\">" + esc_(title) + " (" + list.length + ")</h3>" + li(list) : "");
  const html = "<div style=\"font:14px Arial;color:#2b2c3a;max-width:640px\">" +
    "<p style=\"color:#e8622a;font:600 11px Arial;letter-spacing:.12em;text-transform:uppercase\">Al Bonian FM · Grooming Control</p>" +
    "<h2 style=\"color:#333447;margin:4px 0 12px\">Daily summary, " + today + "</h2>" +
    "<p>" + findingsToday + " daily-check finding(s) recorded today across your " + sites.length + " site(s).</p>" +
    sec("Checklists not sent today", notSent) + sec("Checklists sent after " + st.checklistDue, late) +
    sec("Serious conduct incidents open", serious) + sec("Audit actions past their due date", overdue) +
    sec("Sites below the audit pass mark", failing) +
    (incidents.length ? "<p>Open incidents: <b>" + incidents.length + "</b></p>" : "") +
    (supplyOld ? "<p>Supply gaps waiting more than " + st.supplyWorkingDays + " working days: <b>" + supplyOld + "</b></p>" : "") +
    (!items ? "<p>Nothing needs attention today.</p>" : "") +
    (st.dashboardUrl ? "<p><a href=\"" + esc_(st.dashboardUrl) + "\" style=\"background:#333447;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none\">Open the dashboard</a></p>" : "") +
    "<p style=\"color:#6b6c7a;font-size:12px\">You receive this because you have a manager login with this email address. An administrator can turn it off under Sites & users → Rules.</p></div>";
  MailApp.sendEmail({ to: user.email, subject: "Grooming Control: daily summary " + today + (items ? " (" + items + " to review)" : ""), htmlBody: html, name: "ABFM Grooming Control" });
}
function esc_(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function workingDays_(a, b) {
  let n = 0;
  for (let d = a; d < b; d = addDays_(d, 1)) { const w = new Date(d + "T12:00:00Z").getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

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
  if (rows_("Employees").length) throw new Error("The sheet already has staff. Delete the tabs first to load demo data.");
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const today = today_();
  const SITES = [["Al Reem Villas", 16, 0.97], ["Yas Community", 18, 0.86], ["Khalifa City Camp", 22, 0.93], ["Saadiyat Residences", 12, 0.985], ["Mussafah Workshop", 14, 0.89], ["Corniche Towers", 12, 0.95]];
  const siteId = {};
  const siteRows = SITES.map((s) => { const id = id_(); siteId[s[0]] = id; return { id: id, name: s[0], active: "1" }; });
  insertMany_("Sites", siteRows);
  // Dashboard demo admins sign in with <username>@demo.local (the OCO with SUPER_ADMIN); checklist users with HR number D1001, D1002, ...
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
  let hrNo = 1000;
  insertMany_("Users", USERS.map((x) => {
    userName[x[0]] = x[1];
    const email = isAdminRole_(x[2]) ? (x[2] === "oco" ? SUPER_ADMIN : x[0] + "@demo.local") : "";
    return { id: id_(), username: email || "D" + (++hrNo), name: x[1], role: x[2], pin: "", sites: x[3].map((n) => siteId[n]).join(","), active: "1", email: email };
  }));
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
      emps.push({ id: id_(), staff_no: "ABFM-" + no++, name: name, trade: pick(TRADES), site_id: siteId[s[0]], uniform_size: pick(["S", "M", "M", "L", "L", "XL", "XXL"]), shoe_size: String(39 + Math.floor(rnd() * 6)), trained_on: rnd() < (s[2] > 0.95 ? 0.95 : 0.7) ? addDays_(today, -1 - Math.floor(rnd() * 25)) : "", active: "1",
        baseline_on: rnd() < 0.85 ? addDays_(today, -20 - Math.floor(rnd() * 8)) : "", ppe_held: "", missing: "",
        accommodation: pick(["Al Quoz Camp", "Al Quoz Camp", "Al Quoz Camp", "Jafza Camp", "Outleaving"]), _site: s[0], _care: careless ? s[2] - 0.12 : s[2] + (1 - s[2]) * 0.5 });
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
        subs.push({ site_id: siteId[s[0]], date: date, by: by, time: (rnd() < (s[2] > 0.94 ? 0.04 : 0.2) ? 18 : 16 + Math.floor(rnd() * 2)) + ":" + ("0" + Math.floor(rnd() * 60)).slice(-2), total: staff.length, passed: list.filter((c) => c.status === "pass").length, gaps: list.filter((c) => c.status === "gaps").length, supply: list.filter((c) => c.status === "supply").length, absent: list.filter((c) => c.status === "absent" || c.status === "leave").length });
      }
      if (rnd() < (s[2] > 0.94 ? 0.5 : 0.25)) {
        const techs = staff.filter((e) => e.trade !== "Cleaner");
        if (techs.length) doCheck(pick(techs), date, "field", by, "11");
      }
    });
  }
  emps.forEach((e) => {
    if (!e.baseline_on) return;
    const held = ["uniform", "id_card", "shoes", "gloves_fabric", "gloves_rubber", "mask", "goggles", "ear_plugs", "helmet", "shoe_covers"].filter(() => rnd() < 0.9);
    e.ppe_held = held.join(",");
    e.missing = held.length < 10 && rnd() < 0.3 ? "Second uniform set" : "";
  });
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
  // Incidents reported from the field.
  const INC = [["difficult_customer", "Villa 21", "Customer upset about the visit time and raised his voice.", "Stayed calm, called the supervisor, who rebooked the visit."],
    ["complaint", "Tower B, flat 1204", "Resident complained the technician's uniform was dirty.", "Technician sent to change; apologised to the resident."],
    ["serious_conduct", "Villa 7", "Technician used the customer's bathroom without permission and argued when asked.", "Removed from site; FM Manager informed."],
    ["damage", "Villa 33", "Paint drip on the customer's floor tiles.", "Cleaned immediately; customer satisfied."],
    ["difficult_customer", "Building 4 lobby", "Customer refused entry without the ID card shown.", "ID shown; work done."],
    ["complaint", "Villa 112", "Customer said the cleaner was using a phone in the house.", "Verbal warning recorded."]];
  const incidents = INC.map((x, i) => {
    const site = SITES[i % SITES.length][0];
    const staff = emps.filter((e) => e._site === site);
    const d = addDays_(today, -[1, 3, 4, 9, 12, 20][i]);
    const closed = i >= 3 ? addDays_(d, 1) : "";
    return { id: id_(), date: d, time: "1" + (i % 8) + ":2" + i, site_id: siteId[site], employee_id: i === 4 ? "" : pick(staff).id, type: x[0], location: x[1], details: x[2], action: x[3], reported_by: userName[checker[site]], status: "open", ack_by: i >= 1 && i !== 2 ? userName.faisal : "", ack_on: i >= 1 && i !== 2 ? addDays_(d, i >= 3 ? 1 : 0) : "", closed_on: closed, outcome: closed ? "Discussed with the team at the morning briefing." : "" };
  });
  insertMany_("Incidents", incidents);
  // HR register: some repeat findings already handled, some still pending.
  const disc = [];
  Object.keys(findDates).forEach((empId, i) => {
    const dates = findDates[empId].filter((d) => d >= addDays_(today, -90)).sort();
    if (dates.length < 2 || i % 3 === 0) return;
    const e = emps.filter((x) => x.id === empId)[0];
    disc.push({ id: id_(), employee_id: empId, site_id: e.site_id, date: addDays_(dates[1], 1), level: "written", action: "Written warning issued", amount: "", notes: "", by: userName.hr });
    if (i % 2) disc.push({ id: id_(), employee_id: empId, site_id: e.site_id, date: addDays_(dates[1], 3), level: "refresher", action: "Grooming refresher session attended", amount: "", notes: "", by: userName.hr });
  });
  insertMany_("Discipline", disc);
  return "Demo data loaded: " + emps.length + " staff, " + checks.length + " checks, " + audits.length + " audits. Demo PINs are 1234.";
}
