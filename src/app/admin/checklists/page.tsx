import Link from "next/link";
import { requireManage } from "@/lib/auth";
import { todayISO, db, addDays } from "@/lib/db";
import { sites, submission, fmtDay } from "@/lib/queries";

export default async function Checklists({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const u = await requireManage();
  const sp = await searchParams;
  const today = todayISO();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const list = sites(u.siteIds);
  const counts = db().prepare(
    `SELECT site_id, check_type, COUNT(*) AS n FROM checks WHERE check_date = ? GROUP BY site_id, check_type`,
  ).all(date) as { site_id: number; check_type: string; n: number }[];
  const staff = db().prepare("SELECT site_id, COUNT(*) AS n FROM employees WHERE active = 1 GROUP BY site_id").all() as { site_id: number; n: number }[];
  const n = (site: number, type: string) => counts.find((c) => c.site_id === site && c.check_type === type)?.n ?? 0;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Daily control</div><h1>Daily checklists</h1><div className="muted small mt-s">{fmtDay(date)}</div></div>
        <form className="filters">
          <Link className="btn small ghost" href={`/admin/checklists?date=${addDays(date, -1)}`}>‹ Previous day</Link>
          <input type="date" name="date" defaultValue={date} max={today} />
          <button className="btn small navy" type="submit">Go</button>
          {date < today && <Link className="btn small ghost" href={`/admin/checklists?date=${addDays(date, 1)}`}>Next day ›</Link>}
        </form>
      </div>
      <div className="card pad">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Site</th><th>Sent to Head Office</th><th>Staff</th><th>Site checks</th><th>Passed</th><th>Gaps</th><th>Supply gap</th><th>Absent / leave</th><th>Camp checks</th><th>Field checks</th></tr></thead>
            <tbody>
              {list.map((s) => {
                const sub = submission(s.id, date);
                const total = staff.find((x) => x.site_id === s.id)?.n ?? 0;
                return (
                  <tr key={s.id} className="click">
                    <td><Link href={`/admin/checklists/${s.id}?date=${date}`}><b>{s.name}</b></Link></td>
                    <td>{sub ? <span className="pill green">✓ {sub.submitted_at}{sub.by_name ? ` · ${sub.by_name}` : ""}</span> : <span className="pill red">Not sent</span>}</td>
                    <td>{total}</td>
                    <td>{n(s.id, "site")}</td>
                    <td className="green">{sub?.passed ?? "–"}</td>
                    <td className="red">{sub?.gaps ?? "–"}</td>
                    <td className="blue">{sub?.supply ?? "–"}</td>
                    <td>{sub?.absent ?? "–"}</td>
                    <td>{n(s.id, "camp")}</td>
                    <td>{n(s.id, "field")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
