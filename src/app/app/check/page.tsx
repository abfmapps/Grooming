import Link from "next/link";
import { redirect } from "next/navigation";
import { requireField, can } from "@/lib/auth";
import { activeSite, initials } from "@/lib/field";
import { todayISO, db } from "@/lib/db";
import { siteStaff, checksOn } from "@/lib/queries";
import { CHECK_TYPES, type CheckType } from "@/lib/standards";
import { StatusPill } from "@/components/StatusPill";

type Filter = "all" | "todo" | "gaps" | "pass";

export default async function StaffList({ searchParams }: { searchParams: Promise<{ type?: string; f?: string; q?: string; saved?: string }> }) {
  const u = await requireField();
  const sp = await searchParams;
  const allowed = can.checkTypes(u);
  const type = (allowed.includes(sp.type as CheckType) ? sp.type : allowed[0]) as CheckType;
  if (sp.type && sp.type !== type) redirect(`/app/check?type=${type}`);
  const s = await activeSite(u);
  if (!s) redirect("/app");
  const today = todayISO();
  const staff = siteStaff(s.id);
  const checks = checksOn(s.id, today, type);
  const gapCounts = new Map(
    (db().prepare(
      `SELECT c.employee_id, COUNT(*) AS n FROM check_items i JOIN checks c ON c.id = i.check_id
        WHERE c.site_id = ? AND c.check_date = ? AND c.check_type = ? AND i.ok = 0 AND i.supply_gap = 0 GROUP BY c.employee_id`,
    ).all(s.id, today, type) as { employee_id: number; n: number }[]).map((r) => [r.employee_id, r.n]),
  );
  const f = (["all", "todo", "gaps", "pass"].includes(sp.f ?? "") ? sp.f : "all") as Filter;
  const q = (sp.q ?? "").trim().toLowerCase();
  const counts = {
    all: staff.length,
    todo: staff.filter((e) => !checks.has(e.id)).length,
    gaps: staff.filter((e) => ["gaps", "supply"].includes(checks.get(e.id)?.status ?? "")).length,
    pass: staff.filter((e) => checks.get(e.id)?.status === "pass").length,
  };
  const shown = staff.filter((e) => {
    if (q && !`${e.name} ${e.staff_no} ${e.trade}`.toLowerCase().includes(q)) return false;
    const c = checks.get(e.id);
    if (f === "todo") return !c;
    if (f === "gaps") return c && ["gaps", "supply"].includes(c.status);
    if (f === "pass") return c?.status === "pass";
    return true;
  });
  // Unchecked first, then by name.
  shown.sort((a, b) => Number(checks.has(a.id)) - Number(checks.has(b.id)) || a.name.localeCompare(b.name));
  const link = (o: Record<string, string>) => `/app/check?${new URLSearchParams({ type, f, ...(q ? { q } : {}), ...o })}`;

  return (
    <>
      <div className="m-top">
        <Link href="/app" className="back">‹ Today</Link>
        <h1>{CHECK_TYPES[type].label} · {s.name}</h1>
        <div className="muted small">{CHECK_TYPES[type].who}</div>
        {allowed.length > 1 && (
          <div className="chips mt-s">
            {allowed.map((t) => (
              <Link key={t} href={`/app/check?type=${t}`} className={`chip ${t === type ? "on" : ""}`}>{CHECK_TYPES[t].short}</Link>
            ))}
          </div>
        )}
        <form action="/app/check">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="f" value={f} />
          <input className="search" type="search" name="q" defaultValue={sp.q} placeholder="🔍  Search name, staff ID or trade" />
        </form>
        <div className="chips mt-s">
          {(["all", "todo", "gaps", "pass"] as Filter[]).map((k) => (
            <Link key={k} href={link({ f: k })} className={`chip ${f === k ? "on" : ""}`}>
              {{ all: "All", todo: "To check", gaps: "Gaps", pass: "Pass" }[k]} {counts[k]}
            </Link>
          ))}
        </div>
      </div>
      <div className="m-body">
        {sp.saved && <div className="flash ok">Saved: {sp.saved}</div>}
        {type === "field" && <div className="flash info">Pick technicians at random while they are working. Target: 3 per site per week.</div>}
        {shown.length === 0 ? (
          <p className="muted">{staff.length ? "No one matches." : "No staff on this site yet. Ask HR or the administrator to add them."}</p>
        ) : (
          <div className="card emp-list">
            {shown.map((e) => {
              const c = checks.get(e.id);
              return (
                <Link key={e.id} href={`/app/check/${e.id}?type=${type}`} className="emp">
                  <div className="avatar">{initials(e.name)}</div>
                  <div className="grow"><b>{e.name}</b><span>{e.staff_no} · {e.trade}</span></div>
                  <StatusPill c={c ? { ...c, gapCount: gapCounts.get(e.id) } : undefined} />
                </Link>
              );
            })}
          </div>
        )}
        {type === "site" && counts.todo === 0 && staff.length > 0 && (
          <Link href="/app/submit" className="btn navy block mt">Everyone checked: review and submit ›</Link>
        )}
      </div>
    </>
  );
}
