import Link from "next/link";
import { requireManage } from "@/lib/auth";
import { todayISO } from "@/lib/db";
import { overview, fmtDay, fmtDate } from "@/lib/queries";
import { TARGETS } from "@/lib/standards";
import { stripClass, StripLegend, AuditScore, pct, Empty } from "@/components/ui";

export default async function Overview() {
  const u = await requireManage();
  const today = todayISO();
  const { rows, kpi, alerts } = overview(u.siteIds, today);
  const delta = kpi.compliance !== null && kpi.compliancePrev !== null ? kpi.compliance - kpi.compliancePrev : null;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{fmtDay(today)}</div><h1>Overview{u.role === "fm_manager" ? ", my sites" : ", all sites"}</h1></div>
        <div className="filters"><Link className="btn small navy" href="/admin/report">Monthly report</Link></div>
      </div>
      <div className="kpis">
        <div className="card kpi">
          <div className="l">Checklists received today</div>
          <div className="v">{kpi.submittedToday}<small> / {kpi.sitesTotal}</small></div>
          <div className={`s ${kpi.submittedToday < kpi.sitesTotal ? "red" : "green"}`}>{kpi.sitesTotal - kpi.submittedToday ? `${kpi.sitesTotal - kpi.submittedToday} site(s) not sent yet` : "All sites sent"}</div>
        </div>
        <div className="card kpi">
          <div className="l">Staff passing daily check (14 days)</div>
          <div className="v">{pct(kpi.compliance, 1)}</div>
          <div className={`s ${delta === null ? "muted" : delta >= 0 ? "green" : "red"}`}>{delta === null ? "Supply gaps count as pass" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)} pts vs previous 14 days`}</div>
        </div>
        <div className="card kpi">
          <div className="l">Open audit findings</div>
          <div className="v">{kpi.openFindings}</div>
          <div className={`s ${kpi.overdueFindings ? "red" : "muted"}`}>{kpi.overdueFindings ? `${kpi.overdueFindings} past the ${TARGETS.findingCloseDays}-day limit` : `Close within ${TARGETS.findingCloseDays} days`}</div>
        </div>
        <div className="card kpi">
          <div className="l">Average latest audit score</div>
          <div className="v">{kpi.avgAudit === null ? "–" : Math.round(kpi.avgAudit)}<small> / 100</small></div>
          <div className="s muted">Pass mark {TARGETS.auditPass} · {kpi.sitesBelow} site{kpi.sitesBelow === 1 ? "" : "s"} below</div>
        </div>
        <div className="card kpi">
          <div className="l">Staff trained</div>
          <div className="v">{pct(kpi.trainedPct)}</div>
          <div className="s muted">Target 100% by {fmtDate(TARGETS.trainingDeadline)}</div>
          <div className="bar"><i style={{ width: `${kpi.trainedPct ?? 0}%` }} /></div>
        </div>
      </div>
      <div className="grid2">
        <div className="card pad panel">
          <h3><span>Sites</span><StripLegend /></h3>
          {rows.length === 0 ? <Empty>No sites yet. Add them under <Link href="/admin/settings" className="blue">Sites & users</Link>.</Empty> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Site</th><th>FM Manager</th><th>Today</th><th>Daily compliance, last 14 days</th><th>Last audit</th><th>Open</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.site.id}>
                      <td><Link href={`/admin/checklists/${r.site.id}`}><b>{r.site.name}</b></Link><br /><span className="muted small">{r.staff} staff</span></td>
                      <td>{r.manager || <span className="muted">–</span>}</td>
                      <td>{r.todaySubmittedAt ? <span className="pill green">✓ {r.todaySubmittedAt}</span> : <span className="pill red">Not sent</span>}</td>
                      <td>
                        <div className="strip">
                          {r.strip.map((d) => <i key={d.date} className={stripClass(d)} title={`${fmtDate(d.date)}: ${d.sent ? (d.pct === null ? "sent" : d.pct + "%") : "not sent"}`} />)}
                        </div>
                      </td>
                      <td>{r.lastAudit ? <Link href={`/admin/audits/${r.lastAudit.id}`}><AuditScore total={r.lastAudit.total} /></Link> : <span className="muted">None yet</span>}</td>
                      <td>{r.open}{r.overdue ? <span className="red small"> ({r.overdue} late)</span> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card pad panel">
          <h3>Needs attention</h3>
          {alerts.length === 0 ? <Empty>Nothing needs attention. 👍</Empty> : alerts.slice(0, 12).map((a, i) => {
            const body = <><span className={`dot ${a.level}`} /><div><b>{a.title}</b>{a.detail}</div></>;
            return a.href ? <Link key={i} href={a.href} className="alert">{body}</Link> : <div key={i} className="alert">{body}</div>;
          })}
          {alerts.length > 12 && <div className="muted small mt-s">+ {alerts.length - 12} more</div>}
        </div>
      </div>
    </>
  );
}
