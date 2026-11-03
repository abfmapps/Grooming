import Link from "next/link";
import { redirect } from "next/navigation";
import { requireField, can } from "@/lib/auth";
import { activeSite } from "@/lib/field";
import { todayISO } from "@/lib/db";
import { supplyGaps, supplyAgeWorkingDays, siteStaff, fmtDate } from "@/lib/queries";
import { ITEMS, TARGETS } from "@/lib/standards";
import { markIssued, addSupplyGap } from "../actions";

export default async function Supply({ searchParams }: { searchParams: Promise<{ added?: string; error?: string }> }) {
  const u = await requireField();
  const sp = await searchParams;
  const s = await activeSite(u);
  if (!s) redirect("/app");
  const open = supplyGaps([s.id]);
  const staff = siteStaff(s.id);
  return (
    <>
      <div className="m-top">
        <Link href="/app" className="back">‹ Today</Link>
        <h1>Supply gaps · {s.name}</h1>
        <div className="muted small">Items staff asked for but have not received. These are not counted against the staff member.</div>
      </div>
      <div className="m-body">
        {sp.added && <div className="flash ok">Added to the supply list.</div>}
        {sp.error && <div className="flash err">Choose an item or type one.</div>}
        {open.length === 0 ? <p className="muted mb">Nothing waiting from Stores. 👍</p> : (
          <div className="card mb">
            {open.map((g) => {
              const age = supplyAgeWorkingDays(g);
              return (
                <div className="gl" key={g.id}>
                  <div className="row between">
                    <b>{g.employee_name}</b>
                    <span className={`pill ${age > TARGETS.supplyWorkingDays ? "red" : "blue"}`}>{age} working day{age === 1 ? "" : "s"}</span>
                  </div>
                  <small>{g.item}{g.item.includes("uniform") && g.uniform_size ? ` (size ${g.uniform_size})` : ""}{g.item.includes("shoes") && g.shoe_size ? ` (size ${g.shoe_size})` : ""} · requested {fmtDate(g.requested_on)}</small>
                  {can.issueSupply(u) && (
                    <form action={markIssued} className="mt-s">
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="on" value={todayISO()} />
                      <button className="btn small ghost" type="submit">✓ Received today</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <details className="card sec">
          <summary style={{ padding: "12px 0", fontWeight: 600, cursor: "pointer" }}>+ Record a new request</summary>
          <form action={addSupplyGap} style={{ paddingBottom: 8 }}>
            <label className="field">Employee
              <select name="employee" required>{staff.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.staff_no}</option>)}</select>
            </label>
            <label className="field">Item
              <select name="item">
                {ITEMS.filter((i) => i.supplyItem).map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}
                <option value="">Other (type below)</option>
              </select>
            </label>
            <label className="field">Other item<input type="text" name="other" placeholder="e.g. Rain jacket" /></label>
            <label className="field">Date requested<input type="date" name="requested" defaultValue={todayISO()} max={todayISO()} /></label>
            <button className="btn block" type="submit">Add</button>
          </form>
        </details>
      </div>
    </>
  );
}
