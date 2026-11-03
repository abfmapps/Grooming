// Fills the database with made-up demo data: 6 sites, users for every role, staff,
// and 30 days of checks, audits and supply gaps.
//
//   npm run seed:demo          (refuses to run if the database already has staff)
//   npm run seed:demo -- --reset   (deletes the database first)
//
// All demo users have PIN 1234.
import fs from "node:fs";
import path from "node:path";
import { openDb, dataDir, hashPin, todayISO, addDays } from "../src/lib/db.ts";
import { itemsFor, ITEMS, type CheckType } from "../src/lib/standards.ts";

const file = path.join(dataDir(), "grooming.db");
if (process.argv.includes("--reset")) {
  for (const f of [file, file + "-wal", file + "-shm"]) if (fs.existsSync(f)) fs.rmSync(f);
}
const db = openDb(file);
if ((db.prepare("SELECT COUNT(*) AS n FROM employees").get() as { n: number }).n > 0) {
  console.error("The database already has staff. Run with --reset to wipe it and load demo data.");
  process.exit(1);
}

// Deterministic random numbers so the demo looks the same every time.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

const today = todayISO();
const PIN = hashPin("1234");

const SITES: { name: string; staff: number; quality: number }[] = [
  { name: "Al Reem Villas", staff: 16, quality: 0.97 },
  { name: "Yas Community", staff: 18, quality: 0.86 },
  { name: "Khalifa City Camp", staff: 22, quality: 0.93 },
  { name: "Saadiyat Residences", staff: 12, quality: 0.985 },
  { name: "Mussafah Workshop", staff: 14, quality: 0.89 },
  { name: "Corniche Towers", staff: 12, quality: 0.95 },
];
const siteId: Record<string, number> = {};
for (const s of SITES) siteId[s.name] = Number(db.prepare("INSERT INTO sites (name) VALUES (?)").run(s.name).lastInsertRowid);

const users: [string, string, string, string[]][] = [
  ["director", "Khalid Al Mansoori", "director", []],
  ["oco", "Layla Haddad", "oco", []],
  ["hse", "Arjun Nair", "hse", []],
  ["hr", "Mariam Saeed", "hr", []],
  ["stores", "Peter Fernandes", "stores", []],
  ["faisal", "Faisal Ahmed", "fm_manager", ["Al Reem Villas", "Saadiyat Residences"]],
  ["sanjay", "Sanjay Menon", "fm_manager", ["Yas Community", "Mussafah Workshop"]],
  ["tariq", "Tariq Hussain", "fm_manager", ["Khalifa City Camp", "Corniche Towers"]],
  ["omar", "Omar Siddiqui", "supervisor", ["Al Reem Villas"]],
  ["ravi", "Ravi Shankar", "supervisor", ["Yas Community"]],
  ["anil", "Anil Kumar", "supervisor", ["Khalifa City Camp"]],
  ["deepak", "Deepak Sharma", "supervisor", ["Saadiyat Residences"]],
  ["vinod", "Vinod Pillai", "supervisor", ["Mussafah Workshop"]],
  ["george", "George Mathew", "site_manager", ["Corniche Towers"]],
  ["campboss", "Hamid Rahimi", "camp_boss", ["Khalifa City Camp", "Al Reem Villas", "Yas Community"]],
];
const userId: Record<string, number> = {};
for (const [username, name, role, sites] of users) {
  const id = Number(db.prepare("INSERT INTO users (username, name, role, pin_hash) VALUES (?,?,?,?)").run(username, name, role, PIN).lastInsertRowid);
  userId[username] = id;
  for (const s of sites) db.prepare("INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)").run(id, siteId[s]);
}
const checkerFor: Record<string, string> = {
  "Al Reem Villas": "omar", "Yas Community": "ravi", "Khalifa City Camp": "anil",
  "Saadiyat Residences": "deepak", "Mussafah Workshop": "vinod", "Corniche Towers": "george",
};

const FIRST = ["Mohammed", "Rajesh", "Bikash", "Joseph", "Abdul", "Suresh", "Imran", "Ramesh", "Nabin", "Vijay", "Ali", "Santosh", "Ganesh", "Prakash", "Sunil", "Arif", "Ramu", "Manoj", "Hari", "Kiran", "Faisal", "Shahid", "Dinesh", "Ajay", "Rohan", "Sameer", "Naveen", "Anwar", "Krishna", "Babu"];
const LAST = ["Asif", "Kumar", "Thapa", "Thomas", "Rahman", "Babu", "Khan", "Pillai", "Shrestha", "Raj", "Hassan", "Gurung", "Yadav", "Nair", "Das", "Hussain", "Rai", "Singh", "Ali", "Varghese", "Tamang", "Sheikh", "Reddy", "Joshi"];
const TRADES = ["Cleaner", "Cleaner", "Cleaner", "Technician", "Electrician", "Plumber", "AC Technician", "Helper", "Gardener", "Painter"];
const SIZES = ["S", "M", "M", "L", "L", "XL", "XXL"];

let staffNo = 1001;
const used = new Set<string>();
const employees: { id: number; site: string; name: string; trade: string; care: number }[] = [];
for (const s of SITES) {
  for (let i = 0; i < s.staff; i++) {
    let name: string;
    do name = `${pick(FIRST)} ${pick(LAST)}`; while (used.has(name));
    used.add(name);
    const trade = pick(TRADES);
    const trained = rnd() < (s.quality > 0.95 ? 0.95 : 0.7) ? addDays(today, -Math.floor(rnd() * 25) - 1) : null;
    const id = Number(
      db.prepare("INSERT INTO employees (staff_no, name, trade, site_id, uniform_size, shoe_size, trained_on) VALUES (?,?,?,?,?,?,?)").run(
        `ABFM-${staffNo++}`, name, trade, siteId[s.name], pick(SIZES), String(39 + Math.floor(rnd() * 6)), trained,
      ).lastInsertRowid,
    );
    // A few people are much more careless than the rest.
    employees.push({ id, site: s.name, name, trade, care: rnd() < 0.12 ? s.quality - 0.12 : s.quality + (1 - s.quality) * 0.5 });
  }
}

const findingDates = new Map<number, string[]>();
const insCheck = db.prepare("INSERT INTO checks (employee_id, site_id, check_date, check_type, status, is_finding, finding_no, note, checked_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
const insItem = db.prepare("INSERT INTO check_items (check_id, item_code, ok, supply_gap, action) VALUES (?,?,?,?,?)");
const insGap = db.prepare("INSERT INTO supply_gaps (employee_id, site_id, item, requested_on, issued_on, check_id, created_by) VALUES (?,?,?,?,?,?,?)");
const openGap = new Map<string, boolean>();

function doCheck(e: (typeof employees)[number], date: string, type: CheckType, by: number, hour: number) {
  const items = itemsFor(type);
  if (type !== "field" && rnd() < 0.03) {
    insCheck.run(e.id, siteId[e.site], date, type, rnd() < 0.5 ? "absent" : "leave", 0, null, "", by, `${date} ${String(hour - 4).padStart(2, "0")}:10:00`);
    return;
  }
  const results = items.map((it) => {
    const fail = rnd() > Math.min(0.9995, e.care + (1 - e.care) * 0.985);
    const supply = fail && !!it.supplyItem && rnd() < 0.35;
    const action = fail && !supply ? pick(it.supplyItem ? ["item_issued", "sent_to_change", "verbal_warning"] : ["corrected", "verbal_warning", "sent_to_change"]) : null;
    return { code: it.code, ok: !fail, supply, action };
  });
  const gaps = results.some((r) => !r.ok && !r.supply);
  const supplyOnly = !gaps && results.some((r) => r.supply);
  const window = (findingDates.get(e.id) ?? []).filter((d) => d >= addDays(date, -90));
  const fno = gaps ? window.length + 1 : null;
  if (gaps) findingDates.set(e.id, [...window, date]);
  const id = Number(
    insCheck.run(e.id, siteId[e.site], date, type, gaps ? "gaps" : supplyOnly ? "supply" : "pass", gaps ? 1 : 0, fno,
      gaps && rnd() < 0.3 ? pick(["Told to fix before going to the customer", "Second reminder this month", "Spoke with supervisor"]) : "",
      by, `${date} ${String(hour - 4).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00`).lastInsertRowid,
  );
  for (const r of results) {
    insItem.run(id, r.code, r.ok ? 1 : 0, r.supply ? 1 : 0, r.action);
    if (r.supply) {
      const label = ITEMS.find((i) => i.code === r.code)!.label;
      const key = `${e.id}:${label}`;
      if (!openGap.get(key)) {
        openGap.set(key, true);
        const requested = addDays(date, -Math.floor(rnd() * 4));
        const lead = 2 + Math.floor(rnd() * 9);
        const issued = addDays(requested, lead) < today ? addDays(requested, lead) : null;
        insGap.run(e.id, siteId[e.site], label, requested, issued, id, by);
        if (issued) openGap.set(key, false);
      }
    }
  }
}

const tx = db.transaction(() => {
  for (let back = 30; back >= 0; back--) {
    const date = addDays(today, -back);
    for (const s of SITES) {
      const staff = employees.filter((e) => e.site === s.name);
      const checker = userId[checkerFor[s.name]];
      const isToday = back === 0;
      // Today: some sites are part-way through.
      const todayShare = s.name === "Al Reem Villas" ? 0.7 : s.name === "Mussafah Workshop" ? 0.3 : s.name === "Khalifa City Camp" ? 0 : 1;
      // Camp check (camp boss's sites)
      if (["Khalifa City Camp", "Al Reem Villas", "Yas Community"].includes(s.name) && (!isToday || s.name !== "Yas Community")) {
        for (const e of staff) doCheck(e, date, "camp", userId.campboss, 6);
      }
      // Site check
      const missedDay = !isToday && rnd() > (s.name === "Khalifa City Camp" || s.name === "Mussafah Workshop" ? 0.82 : 0.97);
      if (missedDay) continue;
      const share = isToday ? todayShare : 1;
      staff.slice(0, Math.round(staff.length * share)).forEach((e) => doCheck(e, date, "site", checker, 8));
      if (!isToday || share === 1) {
        const rows = db.prepare("SELECT status FROM checks WHERE site_id = ? AND check_date = ? AND check_type = 'site'").all(siteId[s.name], date) as { status: string }[];
        if (rows.length === staff.length) {
          db.prepare("INSERT INTO submissions (site_id, sub_date, submitted_by, submitted_at, staff_total, passed, gaps, supply, absent) VALUES (?,?,?,?,?,?,?,?,?)").run(
            siteId[s.name], date, checker, `${16 + Math.floor(rnd() * 2)}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`, staff.length,
            rows.filter((r) => r.status === "pass").length, rows.filter((r) => r.status === "gaps").length,
            rows.filter((r) => r.status === "supply").length, rows.filter((r) => r.status === "absent" || r.status === "leave").length,
          );
        }
      }
      // Field checks: some sites keep up, some don't.
      const fieldRate = s.quality > 0.94 ? 0.5 : 0.25;
      if (rnd() < fieldRate) {
        const techs = staff.filter((e) => e.trade !== "Cleaner");
        if (techs.length) doCheck(pick(techs), date, "field", checker, 11);
      }
    }
  }

  // Audits: one per site in the last month; low sites also had one the month before.
  const insAudit = db.prepare(
    `INSERT INTO audits (site_id, audit_date, auditor_id, with_hse, sample_size, score_grooming, score_ppe, score_communication, score_control, notes, report_sent_on, plan_received_on, verified_on)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insAction = db.prepare("INSERT INTO audit_actions (audit_id, finding, employee_id, action, owner, due_on, closed_on) VALUES (?,?,?,?,?,?,?)");
  const FINDINGS = [
    ["Uniform not pressed", "Verbal warning recorded"], ["No ear plugs at grinder", "Ear plugs issued, toolbox talk"],
    ["ID card not displayed", "Replacement card"], ["Hair below collar (repeat)", "Written warning and refresher"],
    ["Field checks below target", "3 field checks per week scheduled"], ["Gloves not worn for chemical cleaning", "Rubber gloves issued"],
    ["Leaning on customer's wall while waiting", "Coached on site"], ["Phone call in customer's home", "Verbal warning recorded"],
  ];
  const plan: [string, number, number[], boolean][] = [
    ["Al Reem Villas", 6, [28, 23, 25, 15], false],
    ["Yas Community", 20, [26, 21, 22, 15], true],
    ["Yas Community", 5, [24, 20, 21, 14], false],
    ["Khalifa City Camp", 12, [27, 23, 23, 13], false],
    ["Saadiyat Residences", 9, [29, 24, 24, 18], false],
    ["Mussafah Workshop", 36, [27, 22, 23, 16], false],
    ["Mussafah Workshop", 5, [24, 21, 23, 15], false],
    ["Corniche Towers", 15, [27, 22, 24, 16], false],
  ];
  for (const [site, ago, [g, p, c, k], hse] of plan) {
    const d = addDays(today, -ago);
    const total = g + p + c + k;
    const fm = { "Al Reem Villas": "Faisal A.", "Saadiyat Residences": "Faisal A.", "Yas Community": "Sanjay M.", "Mussafah Workshop": "Sanjay M.", "Khalifa City Camp": "Tariq H.", "Corniche Towers": "Tariq H." }[site]!;
    const old = ago > 7;
    const id = Number(insAudit.run(siteId[site], d, userId.oco, hse || rnd() < 0.5 ? "Arjun Nair" : "", 5 + Math.floor(rnd() * 3), g, p, c, k,
      total < 85 ? "Several grooming gaps seen at the morning muster." : "Good overall standard.",
      ago >= 2 ? addDays(d, 1) : null, ago >= 3 ? addDays(d, 3) : null, old && total >= 85 ? addDays(d, 9) : null).lastInsertRowid);
    const staff = employees.filter((e) => e.site === site);
    const nFind = total >= 90 ? 1 : total >= 85 ? 2 : 4;
    for (let i = 0; i < nFind; i++) {
      const [finding, action] = FINDINGS[(id * 3 + i) % FINDINGS.length];
      const emp = finding.startsWith("Field") ? null : pick(staff);
      const due = addDays(d, 7);
      const closed = old ? (rnd() < 0.8 ? addDays(d, 2 + Math.floor(rnd() * 6)) : null) : rnd() < 0.4 ? addDays(d, 1 + Math.floor(rnd() * Math.max(1, ago - 1))) : null;
      insAction.run(id, finding, emp?.id ?? null, action, emp ? fm : `${fm} + HR`, due, closed && closed <= today ? closed : null);
    }
  }
});
tx();

const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
console.log(`Demo data loaded into ${file}`);
console.log(`  ${n("SELECT COUNT(*) AS n FROM sites")} sites, ${n("SELECT COUNT(*) AS n FROM employees")} staff, ${n("SELECT COUNT(*) AS n FROM users")} users`);
console.log(`  ${n("SELECT COUNT(*) AS n FROM checks")} checks, ${n("SELECT COUNT(*) AS n FROM audits")} audits, ${n("SELECT COUNT(*) AS n FROM supply_gaps")} supply gaps`);
console.log("  Log in with any demo username (admin, director, oco, hr, stores, faisal, omar, campboss, …) and PIN 1234.");
