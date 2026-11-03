import { db, addDays, todayISO, workingDaysBetween, daysBetween } from "./db";
import { TARGETS, itemsFor, type CheckType } from "./standards";

const ids = (a: number[]) => JSON.stringify(a);
const IN = "(SELECT value FROM json_each(?))";

export interface Site { id: number; name: string; active: number }
export interface Employee {
  id: number; staff_no: string; name: string; trade: string; site_id: number | null;
  uniform_size: string; shoe_size: string; trained_on: string | null; active: number;
}
export interface Check {
  id: number; employee_id: number; site_id: number; check_date: string; check_type: CheckType;
  status: "pass" | "gaps" | "supply" | "absent" | "leave"; is_finding: number; finding_no: number | null;
  note: string; photo: string | null; checked_by: number | null; created_at: string;
}
export interface CheckItem { check_id: number; item_code: string; ok: number; supply_gap: number; action: string | null }

export function sites(siteIds: number[]): Site[] {
  return db().prepare(`SELECT * FROM sites WHERE id IN ${IN} ORDER BY name`).all(ids(siteIds)) as Site[];
}

export function allSites(): Site[] {
  return db().prepare("SELECT * FROM sites ORDER BY active DESC, name").all() as Site[];
}

export function site(id: number): Site | undefined {
  return db().prepare("SELECT * FROM sites WHERE id = ?").get(id) as Site | undefined;
}

export function siteStaff(siteId: number): Employee[] {
  return db().prepare("SELECT * FROM employees WHERE site_id = ? AND active = 1 ORDER BY name").all(siteId) as Employee[];
}

export function employee(id: number): (Employee & { site_name: string | null }) | undefined {
  return db().prepare("SELECT e.*, s.name AS site_name FROM employees e LEFT JOIN sites s ON s.id = e.site_id WHERE e.id = ?").get(id) as
    | (Employee & { site_name: string | null })
    | undefined;
}

export function checksOn(siteId: number, date: string, type: CheckType): Map<number, Check> {
  const rows = db().prepare("SELECT * FROM checks WHERE site_id = ? AND check_date = ? AND check_type = ?").all(siteId, date, type) as Check[];
  return new Map(rows.map((r) => [r.employee_id, r]));
}

export function checkWithItems(employeeId: number, date: string, type: CheckType) {
  const c = db().prepare("SELECT * FROM checks WHERE employee_id = ? AND check_date = ? AND check_type = ?").get(employeeId, date, type) as Check | undefined;
  if (!c) return null;
  const items = db().prepare("SELECT * FROM check_items WHERE check_id = ?").all(c.id) as CheckItem[];
  return { ...c, items };
}

/** Findings for an employee within the warning window ending on `date` (excluding a given check). */
export function findingsInWindow(employeeId: number, date: string, excludeCheckId?: number): { date: string; source: string; detail: string }[] {
  const from = addDays(date, -TARGETS.warningWindowDays);
  const fromChecks = db().prepare(
    `SELECT c.check_date AS date, c.check_type AS source,
            (SELECT group_concat(item_code, ',') FROM check_items i WHERE i.check_id = c.id AND i.ok = 0 AND i.supply_gap = 0) AS detail
       FROM checks c WHERE c.employee_id = ? AND c.is_finding = 1 AND c.check_date BETWEEN ? AND ? AND c.id != ?`,
  ).all(employeeId, from, date, excludeCheckId ?? -1) as { date: string; source: string; detail: string }[];
  const fromAudits = db().prepare(
    `SELECT a.audit_date AS date, 'audit' AS source, aa.finding AS detail
       FROM audit_actions aa JOIN audits a ON a.id = aa.audit_id
      WHERE aa.employee_id = ? AND a.audit_date BETWEEN ? AND ?`,
  ).all(employeeId, from, date) as { date: string; source: string; detail: string }[];
  // One finding per day at most.
  const byDay = new Map<string, { date: string; source: string; detail: string }>();
  for (const f of [...fromChecks, ...fromAudits]) if (!byDay.has(f.date)) byDay.set(f.date, f);
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function submission(siteId: number, date: string) {
  return db().prepare("SELECT s.*, u.name AS by_name FROM submissions s LEFT JOIN users u ON u.id = s.submitted_by WHERE site_id = ? AND sub_date = ?").get(siteId, date) as
    | { site_id: number; sub_date: string; submitted_at: string; staff_total: number; passed: number; gaps: number; supply: number; absent: number; by_name: string | null }
    | undefined;
}

export function fieldChecksLast7(siteId: number, date: string): number {
  const r = db().prepare("SELECT COUNT(*) AS n FROM checks WHERE site_id = ? AND check_type = 'field' AND check_date BETWEEN ? AND ?").get(siteId, addDays(date, -6), date) as { n: number };
  return r.n;
}

export function campCheckCount(siteId: number, date: string): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM checks WHERE site_id = ? AND check_type = 'camp' AND check_date = ?").get(siteId, date) as { n: number }).n;
}

export interface SupplyGap {
  id: number; employee_id: number; site_id: number; item: string; requested_on: string; issued_on: string | null;
  employee_name: string; staff_no: string; site_name: string; uniform_size: string; shoe_size: string;
}

export function supplyGaps(siteIds: number[], open = true): SupplyGap[] {
  return db().prepare(
    `SELECT g.*, e.name AS employee_name, e.staff_no, e.uniform_size, e.shoe_size, s.name AS site_name
       FROM supply_gaps g JOIN employees e ON e.id = g.employee_id JOIN sites s ON s.id = g.site_id
      WHERE g.site_id IN ${IN} AND ${open ? "g.issued_on IS NULL" : "g.issued_on IS NOT NULL"}
      ORDER BY ${open ? "g.requested_on" : "g.issued_on DESC"} LIMIT 500`,
  ).all(ids(siteIds)) as SupplyGap[];
}

export function supplyAgeWorkingDays(g: { requested_on: string; issued_on: string | null }): number {
  return workingDaysBetween(g.requested_on, g.issued_on ?? todayISO());
}

// ---------------- audits ----------------
export interface Audit {
  id: number; site_id: number; audit_date: string; auditor_id: number | null; with_hse: string; sample_size: number;
  score_grooming: number; score_ppe: number; score_communication: number; score_control: number; notes: string;
  report_sent_on: string | null; plan_received_on: string | null; verified_on: string | null;
  site_name: string; auditor_name: string | null; total: number;
}
export interface AuditAction {
  id: number; audit_id: number; finding: string; employee_id: number | null; action: string; owner: string;
  due_on: string; closed_on: string | null; employee_name?: string | null; site_name?: string; audit_date?: string; site_id?: number;
}

const AUDIT_SELECT = `SELECT a.*, s.name AS site_name, u.name AS auditor_name,
  (a.score_grooming + a.score_ppe + a.score_communication + a.score_control) AS total
  FROM audits a JOIN sites s ON s.id = a.site_id LEFT JOIN users u ON u.id = a.auditor_id`;

export function audits(siteIds: number[]): Audit[] {
  return db().prepare(`${AUDIT_SELECT} WHERE a.site_id IN ${IN} ORDER BY a.audit_date DESC, a.id DESC LIMIT 300`).all(ids(siteIds)) as Audit[];
}

export function audit(id: number): Audit | undefined {
  return db().prepare(`${AUDIT_SELECT} WHERE a.id = ?`).get(id) as Audit | undefined;
}

export function siteAudits(siteId: number): Audit[] {
  return db().prepare(`${AUDIT_SELECT} WHERE a.site_id = ? ORDER BY a.audit_date DESC, a.id DESC`).all(siteId) as Audit[];
}

export function auditActions(auditId: number): AuditAction[] {
  return db().prepare(
    "SELECT aa.*, e.name AS employee_name FROM audit_actions aa LEFT JOIN employees e ON e.id = aa.employee_id WHERE audit_id = ? ORDER BY aa.id",
  ).all(auditId) as AuditAction[];
}

export function openActions(siteIds: number[]): AuditAction[] {
  return db().prepare(
    `SELECT aa.*, e.name AS employee_name, s.name AS site_name, a.audit_date, a.site_id
       FROM audit_actions aa JOIN audits a ON a.id = aa.audit_id JOIN sites s ON s.id = a.site_id
       LEFT JOIN employees e ON e.id = aa.employee_id
      WHERE aa.closed_on IS NULL AND a.site_id IN ${IN} ORDER BY aa.due_on`,
  ).all(ids(siteIds)) as AuditAction[];
}

/** Evidence for the "daily control" audit area (20 pts), over the 30 days before the audit. */
export function controlEvidence(siteId: number, date: string) {
  const from = addDays(date, -29);
  const submitted = (db().prepare("SELECT COUNT(*) AS n FROM submissions WHERE site_id = ? AND sub_date BETWEEN ? AND ?").get(siteId, from, date) as { n: number }).n;
  const field = (db().prepare("SELECT COUNT(*) AS n FROM checks WHERE site_id = ? AND check_type = 'field' AND check_date BETWEEN ? AND ?").get(siteId, from, date) as { n: number }).n;
  const days = 30;
  const fieldTarget = Math.round((days / 7) * TARGETS.fieldChecksPerWeek);
  // Suggested score: 12 pts for checklists, 8 pts for field checks.
  const suggested = Math.round(12 * Math.min(1, submitted / days) + 8 * Math.min(1, field / fieldTarget));
  return { submitted, days, field, fieldTarget, suggested };
}

// ---------------- overview ----------------
export interface SiteRow {
  site: Site; staff: number; manager: string; todaySubmittedAt: string | null;
  strip: { date: string; pct: number | null; sent: boolean }[];
  lastAudit: Audit | null; open: number; overdue: number;
}

export function dayCompliance(siteIds: number[], from: string, to: string) {
  return db().prepare(
    `SELECT site_id, check_date,
            SUM(CASE WHEN status IN ('pass','supply') THEN 1 ELSE 0 END) AS ok,
            SUM(CASE WHEN status IN ('pass','supply','gaps') THEN 1 ELSE 0 END) AS total
       FROM checks WHERE check_type = 'site' AND site_id IN ${IN} AND check_date BETWEEN ? AND ?
      GROUP BY site_id, check_date`,
  ).all(ids(siteIds), from, to) as { site_id: number; check_date: string; ok: number; total: number }[];
}

export function overview(siteIds: number[], today = todayISO()) {
  const list = sites(siteIds);
  const from = addDays(today, -13);
  const comp = dayCompliance(siteIds, from, today);
  const subs = db().prepare(`SELECT site_id, sub_date, submitted_at FROM submissions WHERE site_id IN ${IN} AND sub_date BETWEEN ? AND ?`).all(ids(siteIds), from, today) as {
    site_id: number; sub_date: string; submitted_at: string;
  }[];
  const actions = openActions(siteIds);
  const managers = db().prepare(
    `SELECT us.site_id, group_concat(u.name, ', ') AS names FROM user_sites us JOIN users u ON u.id = us.user_id
      WHERE u.role = 'fm_manager' AND u.active = 1 GROUP BY us.site_id`,
  ).all() as { site_id: number; names: string }[];
  const staffCounts = db().prepare(`SELECT site_id, COUNT(*) AS n FROM employees WHERE active = 1 AND site_id IN ${IN} GROUP BY site_id`).all(ids(siteIds)) as { site_id: number; n: number }[];

  const rows: SiteRow[] = list.map((s) => {
    const strip = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(from, i);
      const c = comp.find((x) => x.site_id === s.id && x.check_date === d);
      const sent = subs.some((x) => x.site_id === s.id && x.sub_date === d);
      strip.push({ date: d, pct: c && c.total ? Math.round((100 * c.ok) / c.total) : null, sent });
    }
    const sa = siteAudits(s.id);
    const acts = actions.filter((a) => a.site_id === s.id);
    return {
      site: s,
      staff: staffCounts.find((x) => x.site_id === s.id)?.n ?? 0,
      manager: managers.find((m) => m.site_id === s.id)?.names ?? "",
      todaySubmittedAt: subs.find((x) => x.site_id === s.id && x.sub_date === today)?.submitted_at ?? null,
      strip,
      lastAudit: sa[0] ?? null,
      open: acts.length,
      overdue: acts.filter((a) => a.due_on < today).length,
    };
  });

  // KPIs
  const okSum = comp.reduce((a, c) => a + c.ok, 0);
  const totSum = comp.reduce((a, c) => a + c.total, 0);
  const prevComp = dayCompliance(siteIds, addDays(today, -27), addDays(today, -14));
  const prevOk = prevComp.reduce((a, c) => a + c.ok, 0);
  const prevTot = prevComp.reduce((a, c) => a + c.total, 0);
  const audited = rows.filter((r) => r.lastAudit);
  const training = db().prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN trained_on IS NOT NULL THEN 1 ELSE 0 END) AS t FROM employees WHERE active = 1 AND site_id IN ${IN}`).get(ids(siteIds)) as { n: number; t: number | null };

  const kpi = {
    sitesTotal: rows.length,
    submittedToday: rows.filter((r) => r.todaySubmittedAt).length,
    compliance: totSum ? (100 * okSum) / totSum : null,
    compliancePrev: prevTot ? (100 * prevOk) / prevTot : null,
    openFindings: actions.length,
    overdueFindings: actions.filter((a) => a.due_on < today).length,
    avgAudit: audited.length ? audited.reduce((a, r) => a + (r.lastAudit?.total ?? 0), 0) / audited.length : null,
    sitesBelow: audited.filter((r) => (r.lastAudit?.total ?? 100) < TARGETS.auditPass).length,
    trainedPct: training.n ? (100 * (training.t ?? 0)) / training.n : null,
    staff: training.n,
  };

  return { rows, kpi, alerts: alerts(siteIds, rows, actions, today) };
}

export interface Alert { level: "red" | "amber" | "blue" | "grey"; title: string; detail: string; href?: string }

function alerts(siteIds: number[], rows: SiteRow[], actions: AuditAction[], today: string): Alert[] {
  const out: Alert[] = [];
  for (const r of rows) {
    const sa = siteAudits(r.site.id);
    if (sa.length >= 2 && sa[0].total < TARGETS.auditPass && sa[1].total < TARGETS.auditPass) {
      out.push({ level: "red", title: `${r.site.name} failed 2 audits in a row`, detail: "Escalate to the Director of Operations", href: `/admin/audits/${sa[0].id}` });
    }
    if (r.overdue) {
      out.push({ level: "red", title: `${r.overdue} finding${r.overdue > 1 ? "s" : ""} past the ${TARGETS.findingCloseDays}-day limit`, detail: r.site.name, href: "/admin/findings" });
    }
    const last = sa[0];
    if (last) {
      if (last.total < TARGETS.auditPass && !sa.some((a) => a.audit_date > last.audit_date)) {
        const due = addDays(last.audit_date, TARGETS.reauditDays);
        out.push({ level: due < today ? "red" : "grey", title: `${r.site.name} re-audit due by ${fmtDate(due)}`, detail: `Scored ${last.total}, below ${TARGETS.auditPass}`, href: `/admin/audits/${last.id}` });
      }
      if (!last.report_sent_on && daysBetween(last.audit_date, today) > TARGETS.reportDays) {
        out.push({ level: "amber", title: `Audit report not sent: ${r.site.name}`, detail: `Due ${TARGETS.reportDays} days after the audit`, href: `/admin/audits/${last.id}` });
      }
    }
    if (!last || daysBetween(last.audit_date, today) > 31) {
      out.push({ level: "grey", title: `${r.site.name} not audited in the last month`, detail: "Every site is audited at least monthly", href: "/admin/audits/new?site=" + r.site.id });
    }
    if (!r.todaySubmittedAt && r.staff > 0) {
      const missed = r.strip.filter((d) => !d.sent && d.date < today).length;
      out.push({ level: "amber", title: `${r.site.name}: today's checklist not sent`, detail: missed ? `${missed} missed day${missed > 1 ? "s" : ""} in the last 13` : "Due by end of day", href: "/admin/checklists" });
    }
    const field = fieldChecksLast7(r.site.id, today);
    if (r.staff > 0 && field < TARGETS.fieldChecksPerWeek) {
      out.push({ level: "grey", title: `${r.site.name}: ${field} of ${TARGETS.fieldChecksPerWeek} field checks this week`, detail: "Random checks during work, last 7 days" });
    }
  }
  const repeat = repeatOffenders(siteIds, today).filter((e) => e.count >= 3);
  if (repeat.length) out.push({ level: "amber", title: `${repeat.length} employee${repeat.length > 1 ? "s" : ""} on a 3rd finding or more`, detail: "Refer to HR for disciplinary action", href: "/admin/employees?filter=repeat" });
  const oldGaps = supplyGaps(siteIds).filter((g) => supplyAgeWorkingDays(g) > TARGETS.supplyWorkingDays);
  if (oldGaps.length) out.push({ level: "blue", title: `${oldGaps.length} supply gap${oldGaps.length > 1 ? "s" : ""} older than ${TARGETS.supplyWorkingDays} working days`, detail: "Stores target is 5 working days", href: "/admin/supply" });
  const order = { red: 0, amber: 1, blue: 2, grey: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Employees with findings in the warning window. */
export function repeatOffenders(siteIds: number[], today = todayISO()) {
  const emps = db().prepare(
    `SELECT DISTINCT e.id FROM employees e
       LEFT JOIN checks c ON c.employee_id = e.id AND c.is_finding = 1 AND c.check_date >= ?
       LEFT JOIN audit_actions aa ON aa.employee_id = e.id
      WHERE e.site_id IN ${IN} AND e.active = 1 AND (c.id IS NOT NULL OR aa.id IS NOT NULL)`,
  ).all(addDays(today, -TARGETS.warningWindowDays), ids(siteIds)) as { id: number }[];
  return emps.map((e) => ({ id: e.id, count: findingsInWindow(e.id, today).length })).filter((e) => e.count > 0);
}

export function fmtDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export function fmtDay(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export { itemsFor };

// ---------------- monthly report ----------------
export interface ReportRow {
  site: string; staff: number; days: number; sent: number; siteChecks: number; passRate: number | null;
  findings: number; repeatFindings: number; fieldChecks: number; fieldTarget: number;
  audits: string; latestAudit: number | null; actionsRaised: number; actionsClosedOnTime: number; actionsOpen: number;
  supplyOpened: number; supplyOpen: number; supplyAvgDays: number | null; trainedPct: number | null;
}

export function monthlyReport(siteIds: number[], month: string, today = todayISO()): ReportRow[] {
  const from = `${month}-01`;
  const lastDay = addDays(addDays(from, 32).slice(0, 8) + "01", -1);
  const to = lastDay < today ? lastDay : today;
  const days = Math.max(0, daysBetween(from, to) + 1);
  const one = <T,>(sql: string, ...args: unknown[]) => db().prepare(sql).get(...args) as T;
  return sites(siteIds).map((s) => {
    const c = one<{ total: number; ok: number }>(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('pass','supply') THEN 1 ELSE 0 END) AS ok FROM checks WHERE site_id = ? AND check_type = 'site' AND status IN ('pass','supply','gaps') AND check_date BETWEEN ? AND ?", s.id, from, to);
    const f = one<{ n: number; r: number }>("SELECT COUNT(*) AS n, SUM(CASE WHEN finding_no >= 2 THEN 1 ELSE 0 END) AS r FROM checks WHERE site_id = ? AND is_finding = 1 AND check_date BETWEEN ? AND ?", s.id, from, to);
    const auditsIn = db().prepare(`${AUDIT_SELECT} WHERE a.site_id = ? AND a.audit_date BETWEEN ? AND ? ORDER BY a.audit_date`).all(s.id, from, to) as Audit[];
    const act = one<{ n: number; ontime: number; open: number }>(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN closed_on IS NOT NULL AND closed_on <= due_on THEN 1 ELSE 0 END) AS ontime, SUM(CASE WHEN closed_on IS NULL THEN 1 ELSE 0 END) AS open
         FROM audit_actions aa JOIN audits a ON a.id = aa.audit_id WHERE a.site_id = ? AND a.audit_date BETWEEN ? AND ?`, s.id, from, to);
    const sup = db().prepare("SELECT requested_on, issued_on FROM supply_gaps WHERE site_id = ? AND requested_on BETWEEN ? AND ?").all(s.id, from, to) as { requested_on: string; issued_on: string | null }[];
    const issued = sup.filter((g) => g.issued_on);
    const tr = one<{ n: number; t: number }>("SELECT COUNT(*) AS n, SUM(CASE WHEN trained_on IS NOT NULL THEN 1 ELSE 0 END) AS t FROM employees WHERE site_id = ? AND active = 1", s.id);
    return {
      site: s.name,
      staff: tr.n,
      days,
      sent: one<{ n: number }>("SELECT COUNT(*) AS n FROM submissions WHERE site_id = ? AND sub_date BETWEEN ? AND ?", s.id, from, to).n,
      siteChecks: c.total,
      passRate: c.total ? (100 * (c.ok ?? 0)) / c.total : null,
      findings: f.n,
      repeatFindings: f.r ?? 0,
      fieldChecks: one<{ n: number }>("SELECT COUNT(*) AS n FROM checks WHERE site_id = ? AND check_type = 'field' AND check_date BETWEEN ? AND ?", s.id, from, to).n,
      fieldTarget: Math.round((days / 7) * TARGETS.fieldChecksPerWeek),
      audits: auditsIn.map((a) => `${fmtDate(a.audit_date)}: ${a.total}`).join(", "),
      latestAudit: auditsIn.length ? auditsIn[auditsIn.length - 1].total : null,
      actionsRaised: act.n,
      actionsClosedOnTime: act.ontime ?? 0,
      actionsOpen: act.open ?? 0,
      supplyOpened: sup.length,
      supplyOpen: sup.length - issued.length,
      supplyAvgDays: issued.length ? issued.reduce((a, g) => a + workingDaysBetween(g.requested_on, g.issued_on!), 0) / issued.length : null,
      trainedPct: tr.n ? (100 * (tr.t ?? 0)) / tr.n : null,
    };
  });
}
