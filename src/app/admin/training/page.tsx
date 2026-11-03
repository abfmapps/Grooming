import Link from "next/link";
import { requireManage, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { sites, fmtDate } from "@/lib/queries";
import { TARGETS } from "@/lib/standards";
import { markTrained } from "@/app/app/actions";

export default async function Training({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const u = await requireManage();
  const sp = await searchParams;
  const list = sites(u.siteIds);
  const stats = db().prepare(
    "SELECT site_id, COUNT(*) AS n, SUM(CASE WHEN trained_on IS NOT NULL THEN 1 ELSE 0 END) AS t FROM employees WHERE active = 1 GROUP BY site_id",
  ).all() as { site_id: number; n: number; t: number }[];
  const siteId = Number(sp.site) || null;
  const untrained = db().prepare(
    `SELECT e.id, e.name, e.staff_no, e.trade, s.name AS site_name FROM employees e JOIN sites s ON s.id = e.site_id
      WHERE e.active = 1 AND e.trained_on IS NULL AND e.site_id IN (SELECT value FROM json_each(?)) AND (? IS NULL OR e.site_id = ?) ORDER BY s.name, e.name`,
  ).all(JSON.stringify(u.siteIds), siteId, siteId) as { id: number; name: string; staff_no: string; trade: string; site_name: string }[];
  const tot = list.reduce((a, s) => { const x = stats.find((y) => y.site_id === s.id); return { n: a.n + (x?.n ?? 0), t: a.t + (x?.t ?? 0) }; }, { n: 0, t: 0 });

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Target: 100% by {fmtDate(TARGETS.trainingDeadline, true)}</div><h1>Training</h1><div className="muted small mt-s">Staff toolbox talk: Grooming, Etiquette & Work Standards · {tot.t} of {tot.n} trained ({tot.n ? Math.round((100 * tot.t) / tot.n) : 0}%)</div></div>
      </div>
      <div className="grid-half">
        <div className="card pad panel">
          <h3>By site</h3>
          <table className="t">
            <thead><tr><th>Site</th><th>Trained</th><th style={{ width: "40%" }}></th></tr></thead>
            <tbody>
              {list.map((s) => {
                const x = stats.find((y) => y.site_id === s.id) ?? { n: 0, t: 0 };
                const p = x.n ? Math.round((100 * x.t) / x.n) : 0;
                return (
                  <tr key={s.id}>
                    <td><Link href={`/admin/training?site=${s.id}`} className={siteId === s.id ? "" : "blue"}><b>{s.name}</b></Link></td>
                    <td className="nw">{x.t} / {x.n} <span className="muted">({p}%)</span></td>
                    <td><div className="bar" style={{ marginTop: 0 }}><i style={{ width: `${p}%`, background: p === 100 ? "var(--green)" : undefined }} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card pad panel">
          <h3><span>Not trained yet{siteId ? ` · ${list.find((s) => s.id === siteId)?.name}` : ""}</span>{siteId && <Link href="/admin/training" className="linkbtn">All sites</Link>}</h3>
          {untrained.length === 0 ? <p className="muted">Everyone is trained. 👍</p> : (
            <table className="t">
              <tbody>
                {untrained.map((e) => (
                  <tr key={e.id}>
                    <td><Link className="blue" href={`/admin/employees/${e.id}`}>{e.name}</Link><br /><span className="muted small">{e.staff_no} · {e.trade} · {e.site_name}</span></td>
                    <td style={{ textAlign: "right" }}>
                      {can.markTraining(u) && (
                        <form action={markTrained}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={`/admin/training${siteId ? `?site=${siteId}` : ""}`} /><button className="btn small ghost" type="submit">Mark trained</button></form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
