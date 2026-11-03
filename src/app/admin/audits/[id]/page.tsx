import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManage, can } from "@/lib/auth";
import { todayISO, addDays } from "@/lib/db";
import { audit, auditActions, siteAudits, siteStaff, fmtDate } from "@/lib/queries";
import { TARGETS } from "@/lib/standards";
import { auditStep, toggleAction, addAuditAction } from "../../actions";
import { PrintButton } from "@/components/PrintButton";

export default async function AuditDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const u = await requireManage();
  const { id } = await params;
  const sp = await searchParams;
  const a = audit(Number(id));
  if (!a || !u.siteIds.includes(a.site_id)) notFound();
  const today = todayISO();
  const actions = auditActions(a.id);
  const history = siteAudits(a.site_id);
  const prev = history.find((x) => x.audit_date < a.audit_date || (x.audit_date === a.audit_date && x.id < a.id));
  const later = history.find((x) => x.audit_date > a.audit_date);
  const pass = a.total >= TARGETS.auditPass;
  const closed = actions.filter((x) => x.closed_on).length;
  const allClosed = actions.length > 0 && closed === actions.length;
  const lastClose = actions.reduce((m, x) => (x.closed_on && x.closed_on > m ? x.closed_on : m), "");

  const due = {
    report: addDays(a.audit_date, TARGETS.reportDays),
    plan: addDays(a.audit_date, TARGETS.planDays),
    close: addDays(a.audit_date, TARGETS.findingCloseDays),
  };
  const stepClass = (done: string | null | boolean, dueOn: string) => (done ? "done" : today > dueOn ? "late" : "now");

  const areas = [
    { label: "Grooming and uniform", v: a.score_grooming, max: 30 },
    { label: "PPE", v: a.score_ppe, max: 25 },
    { label: "Customer communication", v: a.score_communication, max: 25 },
    { label: "Daily control evidence", sub: "checklists, gap log, field checks", v: a.score_control, max: 20 },
  ];

  const StepBtn = ({ step, done, label }: { step: string; done: string | null; label: string }) =>
    (step === "plan" ? can.closeActions(u) : can.audit(u)) ? (
      <form action={auditStep} className="mt-s no-print">
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="step" value={step} />
        {done ? <><input type="hidden" name="undo" value="1" /><button className="linkbtn" type="submit">Undo</button></> : <button className="btn small ghost" type="submit">{label}</button>}
      </form>
    ) : null;

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow"><Link href="/admin/audits">Audits</Link> › {a.site_name}</div>
          <h1>Audit, {fmtDate(a.audit_date, true)}</h1>
          <div className="muted small mt-s">Unannounced · {a.auditor_name ?? "Unknown auditor"}{a.with_hse ? ` with HSE (${a.with_hse})` : ""} · {a.sample_size} staff sampled</div>
        </div>
        <div className="filters"><PrintButton label="Print / save PDF" /></div>
      </div>
      {sp.created && <div className="flash ok">Audit saved. Mark the report as sent once the FM Manager has it.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 400px) minmax(0, 1fr)", gap: 18 }} className="audit-grid">
        <div className="card pad panel">
          <h3>Score</h3>
          {areas.map((x) => (
            <div className="area" key={x.label}>
              <div className="top"><span>{x.label}{x.sub && <><br /><span className="muted small">{x.sub}</span></>}</span><b>{x.v} / {x.max}</b></div>
              <div className="hbar"><i style={{ width: `${(100 * x.v) / x.max}%` }} /></div>
            </div>
          ))}
          <div className={`total ${pass ? "pass" : "fail"}`}>
            <div className="big">{a.total}</div>
            <div>
              <b style={{ fontSize: 15 }}>{pass ? "Pass" : `Below ${TARGETS.auditPass}: non-compliant`}</b>
              <div className="small" style={{ marginTop: 3 }}>{pass ? "The site meets the standard." : `The FM Manager must send a corrective action plan. Re-audit by ${fmtDate(addDays(a.audit_date, TARGETS.reauditDays))}.`}</div>
            </div>
          </div>
          {a.notes && <p className="small mt">{a.notes}</p>}
        </div>
        <div>
          <div className="steps">
            <div className="step done"><div className="e">Day 0 ✓</div><b>Audit visit</b>{fmtDate(a.audit_date)}</div>
            <div className={`step ${stepClass(a.report_sent_on, due.report)}`}><div className="e">By day 2{a.report_sent_on ? " ✓" : ""}</div><b>Report sent</b>{a.report_sent_on ? fmtDate(a.report_sent_on) : `Due ${fmtDate(due.report)}`}<StepBtn step="report" done={a.report_sent_on} label="Mark sent" /></div>
            <div className={`step ${stepClass(a.plan_received_on, due.plan)}`}><div className="e">By day 3{a.plan_received_on ? " ✓" : ""}</div><b>Action plan</b>{a.plan_received_on ? fmtDate(a.plan_received_on) : `Due ${fmtDate(due.plan)}`}<StepBtn step="plan" done={a.plan_received_on} label="Mark received" /></div>
            <div className={`step ${stepClass(allClosed || actions.length === 0, due.close)}`}><div className="e">By day 7{allClosed ? " ✓" : today > due.close ? " · late" : ""}</div><b>Actions closed</b>{actions.length === 0 ? "No findings" : allClosed ? fmtDate(lastClose) : `Due ${fmtDate(due.close)} · ${closed} of ${actions.length}`}</div>
            <div className={`step ${a.verified_on ? "done" : ""}`}><div className="e">Next visit{a.verified_on ? " ✓" : ""}</div><b>Verified on site</b>{a.verified_on ? fmtDate(a.verified_on) : "By the OCO"}<StepBtn step="verified" done={a.verified_on} label="Mark verified" /></div>
          </div>
          <div className="card pad panel">
            <h3><span>Findings and corrective actions</span>{actions.length > 0 && <span className={`pill ${allClosed ? "green" : "amber"}`}>{closed} of {actions.length} closed</span>}</h3>
            {actions.length === 0 ? <p className="muted small">No findings recorded.</p> : (
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Finding</th><th>Staff</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
                  <tbody>
                    {actions.map((x) => (
                      <tr key={x.id}>
                        <td>{x.finding}</td>
                        <td>{x.employee_id ? <Link href={`/admin/employees/${x.employee_id}`} className="blue">{x.employee_name}</Link> : <span className="muted">(site)</span>}</td>
                        <td>{x.action}</td>
                        <td>{x.owner}</td>
                        <td className="nw">{fmtDate(x.due_on)}</td>
                        <td className="nw">
                          {x.closed_on ? <span className="pill green">Closed {fmtDate(x.closed_on)}</span> : x.due_on < today ? <span className="pill red">Overdue</span> : <span className="pill amber">Open</span>}
                          {can.closeActions(u) && (
                            <form action={toggleAction} className="no-print" style={{ display: "inline", marginLeft: 6 }}>
                              <input type="hidden" name="id" value={x.id} />
                              <input type="hidden" name="back" value={`/admin/audits/${a.id}`} />
                              {x.closed_on ? <><input type="hidden" name="reopen" value="1" /><button className="linkbtn" type="submit">Reopen</button></> : <button className="linkbtn" type="submit">Close</button>}
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {can.closeActions(u) && (
              <details className="mt no-print">
                <summary className="linkbtn" style={{ cursor: "pointer" }}>+ Add a finding</summary>
                <form action={addAuditAction} className="grid-form mt-s">
                  <input type="hidden" name="audit" value={a.id} />
                  <label className="field">Finding<input type="text" name="finding" required /></label>
                  <label className="field">Staff member<select name="employee"><option value="">– Site / none –</option>{siteStaff(a.site_id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
                  <label className="field">Action<input type="text" name="action" /></label>
                  <label className="field">Owner<input type="text" name="owner" /></label>
                  <label className="field">Due<input type="date" name="due" defaultValue={due.close} /></label>
                  <div style={{ alignSelf: "end", marginBottom: 12 }}><button className="btn small" type="submit">Add</button></div>
                </form>
              </details>
            )}
          </div>
          <div className="banner mt">
            <b>Escalation check:</b>{" "}
            {prev ? `The previous audit (${fmtDate(prev.audit_date)}) scored ${prev.total}. ` : "This is the first audit for this site. "}
            {!pass && prev && prev.total < TARGETS.auditPass
              ? "This site has failed two audits in a row: escalate to the Director of Operations."
              : !pass
                ? later ? `Re-audited on ${fmtDate(later.audit_date)} (${later.total}).` : "If the next audit also fails, the site goes to the Director of Operations."
                : "A site that fails two audits in a row, or misses closure dates, goes to the Director of Operations."}
          </div>
        </div>
      </div>
    </>
  );
}
