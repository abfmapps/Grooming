import Link from "next/link";
import { redirect } from "next/navigation";
import { requireField, can } from "@/lib/auth";
import { activeSite, initials } from "@/lib/field";
import { siteStaff, fmtDate } from "@/lib/queries";
import { TARGETS } from "@/lib/standards";
import { markTrained } from "../actions";

export default async function Training() {
  const u = await requireField();
  const s = await activeSite(u);
  if (!s) redirect("/app");
  const staff = siteStaff(s.id);
  const done = staff.filter((e) => e.trained_on).length;
  const pct = staff.length ? Math.round((100 * done) / staff.length) : 0;
  const sorted = [...staff].sort((a, b) => Number(!!a.trained_on) - Number(!!b.trained_on) || a.name.localeCompare(b.name));
  return (
    <>
      <div className="m-top">
        <Link href="/app" className="back">‹ Today</Link>
        <h1>Toolbox talk training</h1>
        <div className="muted small">Grooming, Etiquette & Work Standards. Target: 100% of staff by {fmtDate(TARGETS.trainingDeadline, true)}.</div>
        <div className="bar" style={{ height: 8 }}><i style={{ width: `${pct}%` }} /></div>
        <div className="small mt-s"><b>{done} of {staff.length}</b> trained ({pct}%)</div>
      </div>
      <div className="m-body">
        <div className="flash info">Run the toolbox talk with the team, then mark each person who attended.</div>
        <div className="card emp-list">
          {sorted.map((e) => (
            <div className="emp" key={e.id}>
              <div className="avatar">{initials(e.name)}</div>
              <div className="grow"><b>{e.name}</b><span>{e.staff_no} · {e.trained_on ? `Trained ${fmtDate(e.trained_on)}` : "Not trained yet"}</span></div>
              {can.markTraining(u) && (
                <form action={markTrained}>
                  <input type="hidden" name="id" value={e.id} />
                  {e.trained_on ? (
                    <><input type="hidden" name="undo" value="1" /><button className="pill green" style={{ border: 0, cursor: "pointer" }} type="submit" title="Tap to undo">✓ Trained</button></>
                  ) : (
                    <button className="btn small" type="submit">Mark trained</button>
                  )}
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
