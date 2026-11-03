import Link from "next/link";
import { requireManage, can } from "@/lib/auth";
import { todayISO, db, addDays } from "@/lib/db";
import { openActions, fmtDate } from "@/lib/queries";
import { itemLabel, actionLabel, warningFor, CHECK_TYPES, type CheckType } from "@/lib/standards";
import { toggleAction } from "../actions";
import { Empty } from "@/components/ui";

export default async function Findings({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const u = await requireManage();
  const sp = await searchParams;
  const today = todayISO();
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const actions = openActions(u.siteIds);
  const daily = db().prepare(
    `SELECT c.id, c.check_date, c.check_type, c.finding_no, c.employee_id, e.name, e.staff_no, s.name AS site_name,
            (SELECT group_concat(i.item_code || ':' || IFNULL(i.action,''), '|') FROM check_items i WHERE i.check_id = c.id AND i.ok = 0 AND i.supply_gap = 0) AS gaps
       FROM checks c JOIN employees e ON e.id = c.employee_id JOIN sites s ON s.id = c.site_id
      WHERE c.is_finding = 1 AND c.check_date >= ? AND c.site_id IN (SELECT value FROM json_each(?))
      ORDER BY c.check_date DESC, s.name, e.name LIMIT 500`,
  ).all(addDays(today, -days + 1), JSON.stringify(u.siteIds)) as {
    id: number; check_date: string; check_type: CheckType; finding_no: number | null; employee_id: number; name: string; staff_no: string; site_name: string; gaps: string | null;
  }[];

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Follow-up</div><h1>Findings & actions</h1><div className="muted small mt-s">Every audit finding is closed within 7 days. Daily-check findings build each person's warning level.</div></div>
      </div>
      <div className="card pad panel mb">
        <h3>Open audit actions <span className="muted small">{actions.length} open · {actions.filter((a) => a.due_on < today).length} overdue</span></h3>
        {actions.length === 0 ? <Empty>No open actions. 👍</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Due</th><th>Site</th><th>Finding</th><th>Staff</th><th>Action</th><th>Owner</th><th>Audit</th><th></th></tr></thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className="nw">{a.due_on < today ? <span className="pill red">{fmtDate(a.due_on)} · late</span> : fmtDate(a.due_on)}</td>
                    <td>{a.site_name}</td>
                    <td>{a.finding}</td>
                    <td>{a.employee_id ? <Link className="blue" href={`/admin/employees/${a.employee_id}`}>{a.employee_name}</Link> : <span className="muted">(site)</span>}</td>
                    <td>{a.action}</td>
                    <td>{a.owner}</td>
                    <td className="nw"><Link className="blue" href={`/admin/audits/${a.audit_id}`}>{fmtDate(a.audit_date)}</Link></td>
                    <td>{can.closeActions(u) && <form action={toggleAction}><input type="hidden" name="id" value={a.id} /><button className="btn small ghost" type="submit">Close</button></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card pad panel">
        <h3>
          <span>Daily-check findings</span>
          <span className="chips">{[7, 30, 90].map((d) => <Link key={d} href={`/admin/findings?days=${d}`} className={`chip ${d === days ? "on" : ""}`}>Last {d} days</Link>)}</span>
        </h3>
        {daily.length === 0 ? <Empty>No findings in this period.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Date</th><th>Site</th><th>Employee</th><th>Check</th><th>Gaps</th><th>Action taken</th><th>Warning level</th></tr></thead>
              <tbody>
                {daily.map((r) => {
                  const g = (r.gaps ?? "").split("|").filter(Boolean).map((x) => x.split(":"));
                  const n = r.finding_no ?? 1;
                  return (
                    <tr key={r.id}>
                      <td className="nw">{fmtDate(r.check_date)}</td>
                      <td>{r.site_name}</td>
                      <td><Link className="blue" href={`/admin/employees/${r.employee_id}`}>{r.name}</Link><br /><span className="muted small">{r.staff_no}</span></td>
                      <td>{CHECK_TYPES[r.check_type].short}</td>
                      <td className="small">{g.map(([c]) => itemLabel(c)).join(", ")}</td>
                      <td className="small">{[...new Set(g.map(([, a]) => actionLabel(a)))].filter(Boolean).join(", ")}</td>
                      <td><span className={`pill ${n >= 3 ? "red" : n === 2 ? "amber" : "grey"}`}>No. {n}: {warningFor(n).level}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
