import Link from "next/link";
import { requireManage } from "@/lib/auth";
import { todayISO } from "@/lib/db";
import { monthlyReport } from "@/lib/queries";
import { TARGETS } from "@/lib/standards";
import { PrintButton } from "@/components/PrintButton";
import { pct } from "@/components/ui";

function months(today: string): string[] {
  const out: string[] = [];
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < 12; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m--; if (m === 0) { m = 12; y--; }
  }
  return out;
}
const monthName = (ym: string) => new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function Report({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requireManage();
  const sp = await searchParams;
  const today = todayISO();
  const opts = months(today);
  const month = opts.includes(sp.month ?? "") ? sp.month! : opts[0];
  const rows = monthlyReport(u.siteIds, month, today);
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Monthly report to the COO</div><h1>{monthName(month)}</h1><div className="muted small mt-s">Compliance by site, repeat findings, open actions and supply gaps{month === opts[0] ? ` · month to date (${rows[0]?.days ?? 0} days)` : ""}</div></div>
        <form className="filters">
          <select name="month" defaultValue={month}>{opts.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
          <button className="btn small navy" type="submit">Show</button>
          <Link className="btn small ghost" href={`/admin/report/export?month=${month}`}>Download CSV (Excel)</Link>
          <PrintButton label="Print / PDF" />
        </form>
      </div>
      <div className="kpis">
        <div className="card kpi"><div className="l">Daily checklists sent</div><div className="v">{sum("sent")}<small> / {sum("days") }</small></div><div className="s muted">site-days</div></div>
        <div className="card kpi"><div className="l">Daily-check findings</div><div className="v">{sum("findings")}</div><div className="s muted">{sum("repeatFindings")} repeat</div></div>
        <div className="card kpi"><div className="l">Audit actions raised</div><div className="v">{sum("actionsRaised")}</div><div className="s muted">{sum("actionsClosedOnTime")} closed on time · {sum("actionsOpen")} open</div></div>
        <div className="card kpi"><div className="l">Supply gaps opened</div><div className="v">{sum("supplyOpened")}</div><div className="s muted">{sum("supplyOpen")} still waiting</div></div>
      </div>
      <div className="card pad">
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr><th>Site</th><th>Staff</th><th>Checklists sent</th><th>Pass rate</th><th>Findings (repeat)</th><th>Field checks</th><th>Audits</th><th>Actions on time / raised</th><th>Open actions</th><th>Supply opened / waiting</th><th>Avg days to issue</th><th>Trained</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.site}>
                  <td><b>{r.site}</b></td>
                  <td>{r.staff}</td>
                  <td className={r.sent < r.days ? "red" : ""}>{r.sent} / {r.days}</td>
                  <td>{pct(r.passRate, 1)}</td>
                  <td>{r.findings}{r.repeatFindings ? <span className="red"> ({r.repeatFindings})</span> : ""}</td>
                  <td className={r.fieldChecks < r.fieldTarget ? "red" : ""}>{r.fieldChecks} / {r.fieldTarget}</td>
                  <td className="small">{r.audits ? <span className={r.latestAudit !== null && r.latestAudit < TARGETS.auditPass ? "red" : ""}>{r.audits}</span> : <span className="red">None</span>}</td>
                  <td>{r.actionsClosedOnTime} / {r.actionsRaised}</td>
                  <td className={r.actionsOpen ? "red" : ""}>{r.actionsOpen}</td>
                  <td>{r.supplyOpened} / {r.supplyOpen}</td>
                  <td>{r.supplyAvgDays === null ? "–" : r.supplyAvgDays.toFixed(1)}</td>
                  <td>{pct(r.trainedPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small mt">Targets: 100% trained by {TARGETS.trainingDeadline} · audit score {TARGETS.auditPass}+ · findings closed within {TARGETS.findingCloseDays} days · {TARGETS.fieldChecksPerWeek} field checks per site per week · supply within {TARGETS.supplyWorkingDays} working days.</p>
    </>
  );
}
