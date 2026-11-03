import Link from "next/link";
import { requireManage, can } from "@/lib/auth";
import { audits, fmtDate } from "@/lib/queries";
import { db, todayISO, daysBetween } from "@/lib/db";
import { AuditScore, Empty } from "@/components/ui";

export default async function Audits() {
  const u = await requireManage();
  const list = audits(u.siteIds);
  const today = todayISO();
  const open = db().prepare("SELECT audit_id, COUNT(*) AS n, SUM(CASE WHEN due_on < ? THEN 1 ELSE 0 END) AS late FROM audit_actions WHERE closed_on IS NULL GROUP BY audit_id").all(today) as { audit_id: number; n: number; late: number }[];
  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Independent, unannounced</div><h1>Audits</h1><div className="muted small mt-s">Every site at least monthly · 5+ staff sampled · pass mark 85 · report within 2 days</div></div>
        {can.audit(u) && <div className="filters"><Link className="btn" href="/admin/audits/new">+ New audit</Link></div>}
      </div>
      <div className="card pad">
        {list.length === 0 ? <Empty>No audits recorded yet.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Date</th><th>Site</th><th>Auditor</th><th>Sample</th><th>Grooming /30</th><th>PPE /25</th><th>Comms /25</th><th>Control /20</th><th>Total</th><th>Report</th><th>Open actions</th></tr></thead>
              <tbody>
                {list.map((a) => {
                  const o = open.find((x) => x.audit_id === a.id);
                  return (
                    <tr key={a.id} className="click">
                      <td className="nw"><Link href={`/admin/audits/${a.id}`}><b>{fmtDate(a.audit_date, true)}</b></Link></td>
                      <td>{a.site_name}</td>
                      <td>{a.auditor_name}{a.with_hse ? <span className="muted small"><br />with {a.with_hse}</span> : null}</td>
                      <td>{a.sample_size}</td>
                      <td>{a.score_grooming}</td><td>{a.score_ppe}</td><td>{a.score_communication}</td><td>{a.score_control}</td>
                      <td><AuditScore total={a.total} /></td>
                      <td>{a.report_sent_on ? <span className="pill green">Sent {fmtDate(a.report_sent_on)}</span> : daysBetween(a.audit_date, today) > 2 ? <span className="pill red">Late</span> : <span className="pill grey">Due</span>}</td>
                      <td>{o ? <span className={o.late ? "red" : ""}>{o.n}{o.late ? ` (${o.late} late)` : ""}</span> : <span className="muted">0</span>}</td>
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
