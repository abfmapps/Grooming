import Link from "next/link";
import { requireManage, can } from "@/lib/auth";
import { todayISO } from "@/lib/db";
import { supplyGaps, supplyAgeWorkingDays, fmtDate } from "@/lib/queries";
import { TARGETS } from "@/lib/standards";
import { markIssued } from "@/app/app/actions";
import { Empty } from "@/components/ui";

export default async function Supply({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireManage();
  const sp = await searchParams;
  const issued = sp.tab === "issued";
  const list = supplyGaps(u.siteIds, !issued);
  const today = todayISO();
  const late = issued ? 0 : list.filter((g) => supplyAgeWorkingDays(g) > TARGETS.supplyWorkingDays).length;
  return (
    <>
      <div className="head">
        <div><div className="eyebrow">HR / Procurement / Stores</div><h1>Supply gaps</h1><div className="muted small mt-s">Staff who asked for an item and have not received it are not marked non-compliant. Target: issue within {TARGETS.supplyWorkingDays} working days.</div></div>
        <div className="filters chips">
          <Link href="/admin/supply" className={`chip ${!issued ? "on" : ""}`}>Waiting</Link>
          <Link href="/admin/supply?tab=issued" className={`chip ${issued ? "on" : ""}`}>Issued</Link>
        </div>
      </div>
      {late > 0 && <div className="flash warn">{late} item{late > 1 ? "s" : ""} waiting longer than {TARGETS.supplyWorkingDays} working days.</div>}
      <div className="card pad">
        {list.length === 0 ? <Empty>{issued ? "Nothing issued yet." : "Nothing waiting. 👍"}</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Requested</th><th>Employee</th><th>Site</th><th>Item</th><th>Size</th><th>{issued ? "Issued" : "Waiting"}</th><th></th></tr></thead>
              <tbody>
                {list.map((g) => {
                  const age = supplyAgeWorkingDays(g);
                  return (
                    <tr key={g.id}>
                      <td className="nw">{fmtDate(g.requested_on)}</td>
                      <td><Link className="blue" href={`/admin/employees/${g.employee_id}`}>{g.employee_name}</Link><br /><span className="muted small">{g.staff_no}</span></td>
                      <td>{g.site_name}</td>
                      <td>{g.item}</td>
                      <td className="small">{/uniform/i.test(g.item) ? g.uniform_size : /shoe/i.test(g.item) ? g.shoe_size : ""}</td>
                      <td className="nw">{issued ? `${fmtDate(g.issued_on)} (${age} working days)` : <span className={`pill ${age > TARGETS.supplyWorkingDays ? "red" : "blue"}`}>{age} working day{age === 1 ? "" : "s"}</span>}</td>
                      <td>
                        {!issued && can.issueSupply(u) && (
                          <form action={markIssued} className="row" style={{ gap: 6 }}>
                            <input type="hidden" name="id" value={g.id} />
                            <input type="hidden" name="back" value="/admin/supply" />
                            <input type="date" name="on" defaultValue={today} max={today} min={g.requested_on} style={{ padding: "5px 8px" }} />
                            <button className="btn small ghost" type="submit">Mark issued</button>
                          </form>
                        )}
                      </td>
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
