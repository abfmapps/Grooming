import Link from "next/link";
import { requireField, roleInfo, can } from "@/lib/auth";
import { activeSite } from "@/lib/field";
import { todayISO } from "@/lib/db";
import { sites, siteStaff, checksOn, submission, fieldChecksLast7, campCheckCount, supplyGaps, fmtDay } from "@/lib/queries";
import { TARGETS } from "@/lib/standards";
import { chooseSite } from "./actions";
import { AutoSelect } from "@/components/AutoSelect";

export default async function Today() {
  const u = await requireField();
  const s = await activeSite(u);
  const mySites = sites(u.siteIds);
  const today = todayISO();
  const first = u.name.split(" ")[0];

  if (!s) {
    return (
      <div className="m-body">
        <h1>Hello {first}</h1>
        <p className="muted mt">You are not assigned to a site yet. Ask your administrator to add you to a site.</p>
        <a className="btn ghost mt" href="/logout">Log out</a>
      </div>
    );
  }

  const staff = siteStaff(s.id);
  const types = can.checkTypes(u);
  const main = types.includes("site") ? "site" : "camp";
  const done = checksOn(s.id, today, main);
  const checked = staff.filter((e) => done.has(e.id)).length;
  const pct = staff.length ? Math.round((100 * checked) / staff.length) : 0;
  const sub = submission(s.id, today);
  const field = fieldChecksLast7(s.id, today);
  const camp = campCheckCount(s.id, today);
  const gaps = supplyGaps([s.id]);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "numeric", hour12: false }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <div className="hero">
        <div className="row between">
          <div className="hi">{greet}</div>
          <a href="/logout" className="small" style={{ opacity: 0.7 }}>Log out</a>
        </div>
        <h1>{u.name}</h1>
        <form action={chooseSite}>
          <AutoSelect name="site" defaultValue={s.id} aria-label="Site">
            {mySites.map((x) => (
              <option key={x.id} value={x.id}>📍 {x.name} · {roleInfo(u.role).label}</option>
            ))}
          </AutoSelect>
        </form>
        <div className="prog">
          <div className="ring" style={{ background: `conic-gradient(var(--orange) 0 ${pct}%, rgba(255,255,255,.18) ${pct}% 100%)` }}>
            <div>{checked}/{staff.length}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{fmtDay(today)}</div>
            <div className="small" style={{ opacity: 0.8, marginTop: 3 }}>
              {checked} of {staff.length} staff checked
              <br />
              {main === "site" ? (sub ? `Checklist sent at ${sub.submitted_at}` : "Checklist due by end of day") : "Camp check before staff leave"}
            </div>
          </div>
        </div>
      </div>
      <div className="m-body">
        {types.includes("site") && (
          <Link href="/app/check?type=site" className="card task">
            <div className="ico" style={{ background: "var(--orange-soft)" }}>✅</div>
            <div className="grow"><b>Site check</b><span>{staff.length - checked ? `${staff.length - checked} staff left to check` : "Everyone checked"}</span></div>
            {staff.length - checked ? <span className="chev">›</span> : <span className="pill green">Done</span>}
          </Link>
        )}
        <Link href="/app/check?type=camp" className="card task" aria-disabled={!types.includes("camp")}>
          <div className="ico" style={{ background: "var(--blue-soft)" }}>🏠</div>
          <div className="grow"><b>Camp check</b><span>{camp ? `${camp} of ${staff.length} checked by the Camp Boss` : "Not done yet today"}</span></div>
          {camp >= staff.length && staff.length ? <span className="pill green">Done</span> : types.includes("camp") ? <span className="chev">›</span> : null}
        </Link>
        {types.includes("field") && (
          <Link href="/app/check?type=field" className="card task">
            <div className="ico" style={{ background: "var(--amber-soft)" }}>🔧</div>
            <div className="grow"><b>Random field check</b><span>{field} done in the last 7 days (target {TARGETS.fieldChecksPerWeek})</span></div>
            {field >= TARGETS.fieldChecksPerWeek ? <span className="pill green">On target</span> : <span className="chev">›</span>}
          </Link>
        )}
        <Link href="/app/supply" className="card task">
          <div className="ico" style={{ background: "var(--red-soft)" }}>📦</div>
          <div className="grow"><b>Supply gaps</b><span>{gaps.length ? `${gaps.length} item${gaps.length > 1 ? "s" : ""} waiting from Stores` : "Nothing waiting"}</span></div>
          <span className="chev">›</span>
        </Link>
        {types.includes("site") && (
          sub ? (
            <Link href="/app/submit" className="btn ghost block mt-s">✓ Sent to Head Office at {sub.submitted_at}. View</Link>
          ) : (
            <Link href="/app/submit" className={`btn block mt-s ${checked < staff.length ? "ghost" : "navy"}`}>
              {checked < staff.length ? "Submit to Head Office (finish checks first)" : "Submit to Head Office"}
            </Link>
          )
        )}
      </div>
    </>
  );
}
