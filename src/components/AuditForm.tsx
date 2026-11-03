"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { createAudit } from "@/app/admin/actions";
import { AREAS, TARGETS } from "@/lib/standards";

interface Props {
  sites: { id: number; name: string }[];
  siteId: number | null;
  staff: { id: number; name: string; staff_no: string }[];
  evidence: { submitted: number; days: number; field: number; fieldTarget: number; suggested: number } | null;
  today: string;
  auditor: string;
}

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function AuditForm({ sites, siteId, staff, evidence, today, auditor }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [scores, setScores] = useState<Record<string, number>>({ grooming: AREAS[0].auditPoints, ppe: AREAS[1].auditPoints, communication: AREAS[2].auditPoints, control: evidence?.suggested ?? 20 });
  const [rows, setRows] = useState(3);
  const total = Object.values(scores).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const pass = total >= TARGETS.auditPass;
  const areas = [...AREAS.map((a) => ({ code: a.code, label: a.label, max: a.auditPoints })), { code: "control", label: "Daily control evidence (checklists, gap log, field checks)", max: 20 }];

  return (
    <form action={createAudit}>
      <div className="grid-half">
        <div className="card pad panel">
          <h3>Visit</h3>
          <label className="field">Site
            <select name="site" required value={siteId ?? ""} onChange={(e) => router.push(`/admin/audits/new?site=${e.target.value}`)}>
              <option value="" disabled>Choose a site…</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="grid-form">
            <label className="field">Audit date<input type="date" name="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></label>
            <label className="field">Staff sampled<input type="number" name="sample" min={1} defaultValue={5} required /></label>
          </div>
          <label className="field">Auditor<input type="text" value={auditor} disabled /></label>
          <label className="field">With HSE (name)<input type="text" name="with_hse" placeholder="Optional" /></label>
          <label className="field">Notes<textarea name="notes" placeholder="General observations" /></label>
        </div>
        <div className="card pad panel">
          <h3>Score</h3>
          {areas.map((a) => (
            <div className="area" key={a.code}>
              <div className="top">
                <span>{a.label}</span>
                <span className="row" style={{ gap: 6 }}>
                  <input type="number" name={`score_${a.code}`} min={0} max={a.max} required style={{ width: 70, padding: "5px 8px" }}
                    value={Number.isFinite(scores[a.code]) ? scores[a.code] : ""}
                    onChange={(e) => setScores((s) => ({ ...s, [a.code]: Math.min(a.max, Math.max(0, e.target.valueAsNumber)) }))} />
                  <b>/ {a.max}</b>
                </span>
              </div>
              <div className="hbar"><i style={{ width: `${(100 * (scores[a.code] || 0)) / a.max}%` }} /></div>
              {a.code === "control" && evidence && (
                <div className="small muted mt-s">Last 30 days: {evidence.submitted} of {evidence.days} daily checklists sent · {evidence.field} of {evidence.fieldTarget} field checks. Suggested score: <b>{evidence.suggested}</b></div>
              )}
            </div>
          ))}
          <div className={`total ${pass ? "pass" : "fail"}`}>
            <div className="big">{total}</div>
            <div><b>{pass ? "Pass" : `Below ${TARGETS.auditPass}: non-compliant`}</b><div className="small">{pass ? "Site meets the standard." : `FM Manager must send a corrective action plan. Re-audit by ${addDays(date, TARGETS.reauditDays)}.`}</div></div>
          </div>
        </div>
      </div>
      <div className="card pad panel mt">
        <h3>Findings and corrective actions <span className="muted small">Due date defaults to {TARGETS.findingCloseDays} days after the audit</span></h3>
        {!siteId && <p className="muted small mb">Choose a site to pick staff names.</p>}
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Finding</th><th>Staff member (optional)</th><th>Corrective action</th><th>Owner</th><th>Due</th></tr></thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => (
                <tr key={i}>
                  <td><input type="text" name={`finding_${i}`} placeholder="e.g. No ear plugs at grinder" style={{ width: "100%" }} /></td>
                  <td>
                    <select name={`employee_${i}`} style={{ width: "100%" }}>
                      <option value="">– Site / none –</option>
                      {staff.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.staff_no}</option>)}
                    </select>
                  </td>
                  <td><input type="text" name={`action_${i}`} placeholder="e.g. Ear plugs issued" style={{ width: "100%" }} /></td>
                  <td><input type="text" name={`owner_${i}`} placeholder="FM Manager" style={{ width: 130 }} /></td>
                  <td><input type="date" name={`due_${i}`} defaultValue={addDays(date, TARGETS.findingCloseDays)} key={date} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows < 20 && <button type="button" className="linkbtn mt-s" onClick={() => setRows((r) => r + 1)}>+ Add another finding</button>}
        <div className="small muted mt-s">A finding linked to a staff member counts towards that person's warning level.</div>
      </div>
      <div className="row mt" style={{ justifyContent: "flex-end" }}>
        <Link href="/admin/audits" />
        <Submit disabled={!siteId} />
      </div>
    </form>
  );
}

function Link({ href }: { href: string }) {
  return <a className="btn ghost" href={href}>Cancel</a>;
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={disabled || pending}>{pending ? "Saving…" : "Save audit"}</button>;
}
