import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManage, can } from "@/lib/auth";
import { db, todayISO, addDays } from "@/lib/db";
import { employee, findingsInWindow, sites, fmtDate } from "@/lib/queries";
import { AREAS, ITEMS, itemLabel, actionLabel, CHECK_TYPES, type CheckType } from "@/lib/standards";
import { initials } from "@/lib/field";
import { saveEmployee } from "../../actions";

export default async function EmployeeProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const u = await requireManage();
  const { id } = await params;
  const sp = await searchParams;
  const e = employee(Number(id));
  if (!e || (e.site_id && !u.siteIds.includes(e.site_id)) || (!e.site_id && !can.manageStaff(u))) notFound();
  const today = todayISO();
  const findings = findingsInWindow(e.id, today);
  const n = findings.length;
  const fm = db().prepare("SELECT u.name FROM user_sites us JOIN users u ON u.id = us.user_id WHERE us.site_id = ? AND u.role = 'fm_manager' LIMIT 1").get(e.site_id ?? -1) as { name: string } | undefined;

  const checks = db().prepare(
    `SELECT c.*, u.name AS by_name,
       (SELECT group_concat(i.item_code || ':' || i.supply_gap || ':' || IFNULL(i.action,''), '|') FROM check_items i WHERE i.check_id = c.id AND i.ok = 0) AS gaps
       FROM checks c LEFT JOIN users u ON u.id = c.checked_by WHERE c.employee_id = ? ORDER BY c.check_date DESC, c.id DESC LIMIT 200`,
  ).all(e.id) as { id: number; check_date: string; check_type: CheckType; status: string; is_finding: number; finding_no: number | null; note: string; by_name: string | null; gaps: string | null }[];
  const supply = db().prepare("SELECT * FROM supply_gaps WHERE employee_id = ? ORDER BY requested_on DESC").all(e.id) as { id: number; item: string; requested_on: string; issued_on: string | null }[];
  const auditFindings = db().prepare(
    "SELECT aa.*, a.audit_date FROM audit_actions aa JOIN audits a ON a.id = aa.audit_id WHERE aa.employee_id = ? ORDER BY a.audit_date DESC",
  ).all(e.id) as { id: number; audit_id: number; finding: string; action: string; audit_date: string; closed_on: string | null }[];

  type Ev = { date: string; cls: string; title: string; detail: string; href?: string };
  const events: Ev[] = [];
  for (const c of checks) {
    const gaps = (c.gaps ?? "").split("|").filter(Boolean).map((g) => g.split(":"));
    if (c.status === "pass" && c.check_type !== "field") continue; // routine passes shown in the calendar
    const label = CHECK_TYPES[c.check_type].label;
    if (c.status === "gaps") events.push({ date: c.check_date, cls: "red", title: `${label}: finding${c.finding_no ? ` (no. ${c.finding_no})` : ""}`, detail: `${gaps.filter((g) => g[1] === "0").map((g) => itemLabel(g[0])).join(", ")}. ${[...new Set(gaps.map((g) => actionLabel(g[2])).filter(Boolean))].join(", ")}${c.note ? `. ${c.note}` : ""}${c.by_name ? ` · ${c.by_name}` : ""}` });
    else if (c.status === "pass") events.push({ date: c.check_date, cls: "green", title: `${label} passed`, detail: c.by_name ? `Checked by ${c.by_name}` : "" });
    else if (c.status === "supply") events.push({ date: c.check_date, cls: "blue", title: `${label}: supply gap only`, detail: gaps.map((g) => itemLabel(g[0])).join(", ") });
    else events.push({ date: c.check_date, cls: "", title: c.status === "absent" ? "Absent" : "On leave", detail: c.note });
  }
  for (const g of supply) events.push({ date: g.requested_on, cls: "blue", title: `Supply gap: ${g.item}`, detail: g.issued_on ? `Requested ${fmtDate(g.requested_on)} · issued ${fmtDate(g.issued_on)}` : "Still waiting from Stores" });
  for (const f of auditFindings) events.push({ date: f.audit_date, cls: "red", title: "Audit finding", detail: `${f.finding}${f.action ? `. ${f.action}` : ""}${f.closed_on ? ` · closed ${fmtDate(f.closed_on)}` : " · open"}`, href: `/admin/audits/${f.audit_id}` });
  if (e.trained_on) events.push({ date: e.trained_on, cls: "amber", title: "Toolbox talk training", detail: "Grooming, Etiquette & Work Standards" });
  events.sort((a, b) => b.date.localeCompare(a.date));

  // 30-day calendar of site/camp checks
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const cal = days.map((d) => {
    const cs = checks.filter((c) => c.check_date === d && c.check_type !== "field");
    if (!cs.length) return { d, cls: "", label: "No check" };
    if (cs.some((c) => c.status === "gaps")) return { d, cls: "c-r", label: "Finding" };
    if (cs.some((c) => c.status === "absent" || c.status === "leave")) return { d, cls: "c-x", label: "Absent / leave" };
    if (cs.some((c) => c.status === "supply")) return { d, cls: "c-g2", label: "Supply gap" };
    return { d, cls: "c-g", label: "Pass" };
  });
  const recent = checks.filter((c) => c.check_date >= days[0]);
  const byStandard = AREAS.map((a) => ({
    ...a,
    items: ITEMS.filter((i) => i.area === a.code).map((i) => ({
      label: i.label,
      n: checks.filter((c) => c.check_date >= addDays(today, -89) && (c.gaps ?? "").split("|").some((g) => g.startsWith(i.code + ":0:"))).length,
    })).filter((x) => x.n > 0),
  }));

  const rung = (k: number) => (n >= k ? "past" : n + 1 === k ? "next" : "");

  return (
    <>
      <div className="head">
        <div className="row" style={{ gap: 16 }}>
          <div className="avatar" style={{ width: 60, height: 60, fontSize: 20 }}>{initials(e.name)}</div>
          <div>
            <div className="eyebrow"><Link href="/admin/employees">Employees</Link> › {e.staff_no}</div>
            <h1>{e.name}{!e.active && <span className="pill grey" style={{ marginLeft: 8, verticalAlign: 4 }}>Inactive</span>}</h1>
            <div className="muted small" style={{ marginTop: 2 }}>
              {[e.trade, e.site_name, fm && `FM Manager ${fm.name}`, e.uniform_size && `Uniform ${e.uniform_size}`, e.shoe_size && `Shoes ${e.shoe_size}`, e.trained_on ? `Training ✓ ${fmtDate(e.trained_on)}` : "Not trained yet"].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      </div>
      {sp.saved && <div className="flash ok">Saved.</div>}
      <div className="card pad panel mb">
        <h3><span>Warning level</span><span className="muted small">{n} finding{n === 1 ? "" : "s"} in the last 90 days · supply gaps are never counted</span></h3>
        <div className="ladder">
          <div className={`rung ${rung(1)}`}><div className="e">1st finding{n >= 1 ? " ✓" : ""}</div><b>Verbal warning</b>{findings[n - 1] ? fmtDate(findings[n - 1].date) : "Correct on the spot · FM Manager or supervisor"}</div>
          <div className={`rung ${rung(2)}`}><div className="e">{n + 1 === 2 ? "Next finding" : `Repeat${n >= 2 ? " ✓" : ""}`}</div><b>Written warning + refresher</b>{n >= 2 && findings[n - 2] ? fmtDate(findings[n - 2].date) : "FM Manager with HR"}</div>
          <div className={`rung ${n >= 2 ? (n >= 3 ? "past" : "next") : ""}`}><div className="e">{n === 2 ? "Next finding" : `Further repeat${n >= 3 ? " ✓" : ""}`}</div><b>HR disciplinary action</b>Salary deduction possible (amount set by HR)</div>
          <div className="rung"><div className="e">Serious conduct</div><b>Removal from site</b>HR investigation · OCO informed</div>
        </div>
        {n >= 3 && <div className="flash err mt" style={{ marginBottom: 0 }}>{n} findings in 90 days: refer to HR for disciplinary action.</div>}
      </div>
      <div className="grid-half">
        <div className="card pad panel">
          <h3>History</h3>
          {events.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
            <div className="tl">
              {events.slice(0, 40).map((ev, i) => (
                <div key={i} className={`ev ${ev.cls}`}>
                  <b>{fmtDate(ev.date)} · {ev.href ? <Link href={ev.href} className="blue">{ev.title}</Link> : ev.title}</b>
                  {ev.detail && <small>{ev.detail}</small>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="card pad panel mb">
            <h3><span>Daily checks · last 30 days</span>
              <span className="pill green">{recent.filter((c) => c.status === "pass" || c.status === "supply").length} pass · {recent.filter((c) => c.status === "gaps").length} finding{recent.filter((c) => c.status === "gaps").length === 1 ? "" : "s"} · {recent.filter((c) => c.status === "absent" || c.status === "leave").length} absent</span></h3>
            <div className="cal">{cal.map((c) => <i key={c.d} className={c.cls} style={c.cls ? undefined : { background: "#f2f2ef" }} title={`${fmtDate(c.d)}: ${c.label}`} />)}</div>
            <div className="legend mt-s"><span><i className="c-g" />Pass</span><span><i className="c-g2" />Supply gap</span><span><i className="c-r" />Finding</span><span><i className="c-x" />Absent / leave</span><span><i style={{ background: "#f2f2ef" }} />No check</span></div>
            <h3 className="mt">Gaps by standard (90 days)</h3>
            {byStandard.every((a) => a.items.length === 0) ? <p className="muted small">No gaps.</p> : (
              <table className="t"><tbody>
                {byStandard.flatMap((a) => a.items.map((i) => <tr key={i.label}><td>{i.label}<span className="muted small"> · {a.label}</span></td><td><b>{i.n}</b></td></tr>))}
              </tbody></table>
            )}
          </div>
          {can.manageStaff(u) && (
            <details className="card pad panel">
              <summary className="linkbtn" style={{ cursor: "pointer" }}>Edit employee details</summary>
              <form action={saveEmployee} className="grid-form mt">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="back" value={`/admin/employees/${e.id}`} />
                <label className="field">Staff number<input type="text" name="staff_no" defaultValue={e.staff_no} required /></label>
                <label className="field">Full name<input type="text" name="name" defaultValue={e.name} required /></label>
                <label className="field">Trade<input type="text" name="trade" defaultValue={e.trade} /></label>
                <label className="field">Site<select name="site" defaultValue={e.site_id ?? ""}><option value="">–</option>{sites(u.siteIds).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className="field">Uniform size<input type="text" name="uniform_size" defaultValue={e.uniform_size} /></label>
                <label className="field">Shoe size<input type="text" name="shoe_size" defaultValue={e.shoe_size} /></label>
                <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="active" defaultChecked={!!e.active} /> Active</label>
                <div><button className="btn small" type="submit">Save</button></div>
              </form>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
