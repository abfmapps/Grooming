import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManage } from "@/lib/auth";
import { todayISO, db, nowTime } from "@/lib/db";
import { PrintButton } from "@/components/PrintButton";
import { site, submission, fmtDay } from "@/lib/queries";
import { CHECK_TYPES, itemLabel, actionLabel, type CheckType } from "@/lib/standards";
import { StatusPill } from "@/components/StatusPill";
import type { Check } from "@/lib/queries";

export default async function SiteDay({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ date?: string }> }) {
  const u = await requireManage();
  const { siteId } = await params;
  const sp = await searchParams;
  const s = site(Number(siteId));
  if (!s || !u.siteIds.includes(s.id)) notFound();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayISO();
  const sub = submission(s.id, date);
  const rows = db().prepare(
    `SELECT c.*, e.name, e.staff_no, e.trade, u.name AS by_name,
            (SELECT group_concat(i.item_code || ':' || i.supply_gap || ':' || IFNULL(i.action,''), '|') FROM check_items i WHERE i.check_id = c.id AND i.ok = 0) AS gaps
       FROM checks c JOIN employees e ON e.id = c.employee_id LEFT JOIN users u ON u.id = c.checked_by
      WHERE c.site_id = ? AND c.check_date = ? ORDER BY c.check_type, e.name`,
  ).all(s.id, date) as (Check & { name: string; staff_no: string; trade: string; by_name: string | null; gaps: string | null })[];
  const unchecked = db().prepare(
    `SELECT name, staff_no FROM employees WHERE site_id = ? AND active = 1 AND id NOT IN (SELECT employee_id FROM checks WHERE site_id = ? AND check_date = ? AND check_type = 'site') ORDER BY name`,
  ).all(s.id, s.id, date) as { name: string; staff_no: string }[];

  return (
    <>
      <div className="head">
        <div><div className="eyebrow"><Link href={`/admin/checklists?date=${date}`}>Daily checklists</Link> › {s.name}</div><h1>{fmtDay(date)}</h1>
          <div className="muted small mt-s">{sub ? `Sent to Head Office at ${sub.submitted_at}${sub.by_name ? ` by ${sub.by_name}` : ""}` : "Not sent to Head Office"}</div></div>
        <div className="filters no-print"><PrintButton /></div>
      </div>
      {unchecked.length > 0 && <div className="flash warn">Not checked on site: {unchecked.map((e) => e.name).join(", ")}</div>}
      {(["site", "camp", "field"] as CheckType[]).map((t) => {
        const list = rows.filter((r) => r.check_type === t);
        if (!list.length) return null;
        return (
          <div className="card pad panel mb" key={t}>
            <h3>{CHECK_TYPES[t].label} <span className="muted small">{list.length} checked</span></h3>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Employee</th><th>Status</th><th>Gaps</th><th>Action taken</th><th>Note</th><th>Checked by</th></tr></thead>
                <tbody>
                  {list.map((r) => {
                    const gaps = (r.gaps ?? "").split("|").filter(Boolean).map((g) => { const [code, supply, action] = g.split(":"); return { code, supply: supply === "1", action }; });
                    return (
                      <tr key={r.id}>
                        <td><Link href={`/admin/employees/${r.employee_id}`}><b>{r.name}</b></Link><br /><span className="muted small">{r.staff_no} · {r.trade}</span></td>
                        <td><StatusPill c={r} />{r.finding_no ? <div className="small muted mt-s">Finding no. {r.finding_no}</div> : null}</td>
                        <td className="small">{gaps.map((g) => itemLabel(g.code) + (g.supply ? " (supply gap)" : "")).join(", ")}</td>
                        <td className="small">{[...new Set(gaps.filter((g) => !g.supply).map((g) => actionLabel(g.action)))].filter(Boolean).join(", ")}</td>
                        <td className="small">{r.note}{r.photo && <div><a href={`/photo/${r.photo}`} target="_blank"><img src={`/photo/${r.photo}`} alt="" className="photo-thumb" /></a></div>}</td>
                        <td className="small nw">{r.by_name}<br /><span className="muted">{nowTime(new Date(r.created_at.replace(" ", "T") + "Z"))}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {rows.length === 0 && <p className="muted">No checks recorded on this day.</p>}
    </>
  );
}
