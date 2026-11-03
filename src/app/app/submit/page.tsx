import Link from "next/link";
import { redirect } from "next/navigation";
import { requireField } from "@/lib/auth";
import { activeSite } from "@/lib/field";
import { todayISO, db } from "@/lib/db";
import { siteStaff, checksOn, submission, fmtDay } from "@/lib/queries";
import { itemLabel, actionLabel } from "@/lib/standards";
import { submitDay } from "../actions";

export default async function Submit({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const u = await requireField();
  const sp = await searchParams;
  const s = await activeSite(u);
  if (!s) redirect("/app");
  const today = todayISO();
  const staff = siteStaff(s.id);
  const checks = checksOn(s.id, today, "site");
  const c = [...checks.values()];
  const missing = staff.filter((e) => !checks.has(e.id));
  const sub = submission(s.id, today);
  const gaps = db().prepare(
    `SELECT e.name, c.status, i.item_code, i.supply_gap, i.action
       FROM checks c JOIN employees e ON e.id = c.employee_id JOIN check_items i ON i.check_id = c.id
      WHERE c.site_id = ? AND c.check_date = ? AND c.check_type = 'site' AND i.ok = 0 ORDER BY e.name`,
  ).all(s.id, today) as { name: string; status: string; item_code: string; supply_gap: number; action: string | null }[];
  const byPerson = new Map<string, typeof gaps>();
  for (const g of gaps) byPerson.set(g.name, [...(byPerson.get(g.name) ?? []), g]);
  const absent = c.filter((x) => x.status === "absent" || x.status === "leave").length;

  return (
    <>
      <div className="m-top">
        <Link href="/app" className="back">‹ Today</Link>
        <h1>Submit daily checklist</h1>
        <div className="muted small">{s.name} · {fmtDay(today)}</div>
      </div>
      <div className="m-body">
        {sp.sent && <div className="flash ok">✓ Sent to Head Office. You can resend if you change any check today.</div>}
        {sp.error === "confirm" && <div className="flash err">Tick the confirmation box first.</div>}
        {sp.error === "missing" && <div className="flash err">Some staff are not checked yet.</div>}
        {sub && !sp.sent && <div className="flash ok">Sent at {sub.submitted_at}{sub.by_name ? ` by ${sub.by_name}` : ""}.</div>}
        <div className="stats">
          <div className="card stat"><b>{staff.length}</b><span>Staff on site</span></div>
          <div className="card stat"><b className="green">{c.filter((x) => x.status === "pass").length}</b><span>Passed</span></div>
          <div className="card stat"><b className="red">{c.filter((x) => x.status === "gaps").length}</b><span>With gaps</span></div>
          <div className="card stat"><b className="blue">{c.filter((x) => x.status === "supply").length}</b><span>Supply gap · {absent} absent/leave</span></div>
        </div>
        {missing.length > 0 && (
          <div className="flash warn">
            <b>{missing.length} not checked yet:</b> {missing.slice(0, 6).map((e) => e.name).join(", ")}{missing.length > 6 ? "…" : ""}
            <div className="mt-s"><Link href="/app/check?type=site&f=todo" className="btn small">Check them now</Link></div>
          </div>
        )}
        {byPerson.size > 0 && (
          <>
            <div className="eyebrow" style={{ margin: "4px 2px 8px" }}>Gaps and action taken</div>
            <div className="card mb">
              {[...byPerson.entries()].map(([name, list]) => (
                <div className="gl" key={name}>
                  <div className="row between">
                    <b>{name}</b>
                    {list.every((g) => g.supply_gap) ? <span className="pill blue">Supply gap</span> : <span className="pill amber">{[...new Set(list.filter((g) => !g.supply_gap).map((g) => actionLabel(g.action)))].join(", ") || "Gap"}</span>}
                  </div>
                  <small>{list.map((g) => itemLabel(g.item_code) + (g.supply_gap ? " (supply)" : "")).join(" · ")}</small>
                </div>
              ))}
            </div>
          </>
        )}
        <form action={submitDay}>
          <input type="hidden" name="site" value={s.id} />
          <label className="confirm"><input type="checkbox" name="confirm" required /> I confirm I checked every staff member on this site today.</label>
          <button className="btn navy block" type="submit" disabled={missing.length > 0}>{sub ? "Send again" : "Send to Head Office"}</button>
        </form>
      </div>
    </>
  );
}
