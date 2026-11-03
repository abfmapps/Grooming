import Link from "next/link";
import { requireManage, can } from "@/lib/auth";
import { db, todayISO } from "@/lib/db";
import { sites, findingsInWindow, fmtDate, type Employee } from "@/lib/queries";
import { warningFor } from "@/lib/standards";
import { saveEmployee, importEmployees } from "../actions";
import { initials } from "@/lib/field";

export default async function Employees({ searchParams }: { searchParams: Promise<{ q?: string; site?: string; filter?: string; imported?: string; updated?: string; skipped?: string; ok?: string; error?: string }> }) {
  const u = await requireManage();
  const sp = await searchParams;
  const today = todayISO();
  const siteList = sites(u.siteIds);
  const siteId = Number(sp.site) || null;
  const q = (sp.q ?? "").trim();
  const rows = db().prepare(
    `SELECT e.*, s.name AS site_name,
       (SELECT COUNT(*) FROM supply_gaps g WHERE g.employee_id = e.id AND g.issued_on IS NULL) AS open_gaps,
       (SELECT MAX(check_date) FROM checks c WHERE c.employee_id = e.id) AS last_check
       FROM employees e LEFT JOIN sites s ON s.id = e.site_id
      WHERE (e.site_id IN (SELECT value FROM json_each(?)) ${can.manageStaff(u) ? "OR e.site_id IS NULL" : ""})
        AND (? IS NULL OR e.site_id = ?)
        AND (? = '' OR e.name LIKE '%' || ? || '%' OR e.staff_no LIKE '%' || ? || '%' OR e.trade LIKE '%' || ? || '%')
        AND e.active = ?
      ORDER BY e.name LIMIT 1000`,
  ).all(JSON.stringify(u.siteIds), siteId, siteId, q, q, q, q, sp.filter === "inactive" ? 0 : 1) as (Employee & { site_name: string | null; open_gaps: number; last_check: string | null })[];
  const withFindings = rows.map((e) => ({ ...e, findings: findingsInWindow(e.id, today).length }));
  const shown = sp.filter === "repeat" ? withFindings.filter((e) => e.findings >= 2).sort((a, b) => b.findings - a.findings) : withFindings;

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">People</div><h1>Employees</h1><div className="muted small mt-s">{shown.length} shown · warning level counts findings in the last 90 days</div></div>
        <form className="filters">
          <input type="search" name="q" defaultValue={q} placeholder="Name, staff ID, trade" />
          <select name="site" defaultValue={siteId ?? ""}><option value="">All sites</option>{siteList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="filter" defaultValue={sp.filter ?? ""}><option value="">Active</option><option value="repeat">Repeat findings (2+)</option><option value="inactive">Inactive</option></select>
          <button className="btn small navy" type="submit">Filter</button>
        </form>
      </div>
      {sp.imported && <div className="flash ok">Import done: {sp.imported} added, {sp.updated} updated{Number(sp.skipped) ? `, ${sp.skipped} skipped` : ""}.</div>}
      {sp.ok && <div className="flash ok">Employee added.</div>}
      {sp.error && <div className="flash err">That staff number already exists.</div>}
      <div className="card pad mb">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Employee</th><th>Trade</th><th>Site</th><th>Sizes</th><th>Findings (90d)</th><th>Next step</th><th>Trained</th><th>Supply</th><th>Last check</th></tr></thead>
            <tbody>
              {shown.map((e) => {
                const w = e.findings ? warningFor(e.findings + 1) : null;
                return (
                  <tr key={e.id} className="click">
                    <td><Link href={`/admin/employees/${e.id}`} className="row"><span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(e.name)}</span><span><b>{e.name}</b><br /><span className="muted small">{e.staff_no}</span></span></Link></td>
                    <td>{e.trade}</td>
                    <td>{e.site_name ?? <span className="muted">–</span>}</td>
                    <td className="small nw">{e.uniform_size && `Uniform ${e.uniform_size}`}{e.shoe_size && ` · Shoes ${e.shoe_size}`}</td>
                    <td>{e.findings ? <span className={`pill ${e.findings >= 3 ? "red" : e.findings === 2 ? "amber" : "grey"}`}>{e.findings}</span> : <span className="muted">0</span>}</td>
                    <td className="small">{w ? w.action.split(";")[0].split("(")[0] : ""}</td>
                    <td>{e.trained_on ? <span className="pill green">✓ {fmtDate(e.trained_on)}</span> : <span className="pill grey">No</span>}</td>
                    <td>{e.open_gaps ? <span className="pill blue">{e.open_gaps} waiting</span> : ""}</td>
                    <td className="small nw">{fmtDate(e.last_check)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {can.manageStaff(u) && (
        <div className="grid-half">
          <details className="card pad panel">
            <summary className="linkbtn" style={{ cursor: "pointer" }}>+ Add an employee</summary>
            <form action={saveEmployee} className="grid-form mt">
              <label className="field">Staff number<input type="text" name="staff_no" required /></label>
              <label className="field">Full name<input type="text" name="name" required /></label>
              <label className="field">Trade<input type="text" name="trade" placeholder="Cleaner, Technician…" /></label>
              <label className="field">Site<select name="site"><option value="">–</option>{siteList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className="field">Uniform size<input type="text" name="uniform_size" /></label>
              <label className="field">Shoe size<input type="text" name="shoe_size" /></label>
              <div><button className="btn small" type="submit">Add employee</button></div>
            </form>
          </details>
          <details className="card pad panel">
            <summary className="linkbtn" style={{ cursor: "pointer" }}>⇪ Import from Excel / CSV</summary>
            <form action={importEmployees} className="mt">
              <p className="small muted mb">Columns, in this order: <b>staff number, name, trade, site, uniform size, shoe size</b>. Save the Excel sheet as CSV, or paste rows copied from Excel. Existing staff numbers are updated; new site names are created.</p>
              <label className="field">CSV file<input type="file" name="file" accept=".csv,.txt" /></label>
              <label className="field">…or paste rows<textarea name="csv" placeholder={"ABFM-1001, Rajesh Kumar, Cleaner, Al Reem Villas, L, 42"} /></label>
              <button className="btn small" type="submit">Import</button>
            </form>
          </details>
        </div>
      )}
    </>
  );
}
