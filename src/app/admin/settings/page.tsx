import { requireManage, can, ROLES, roleInfo } from "@/lib/auth";
import { db } from "@/lib/db";
import { allSites } from "@/lib/queries";
import { addSite, toggleSite, saveUser, toggleUser } from "../actions";

const ERRORS: Record<string, string> = {
  site_exists: "A site with that name already exists.",
  pin: "PIN must be 4 to 8 digits (required for new users).",
  user_exists: "That username is taken.",
  self: "You cannot deactivate your own account.",
};

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; edit?: string }> }) {
  const u = await requireManage();
  const sp = await searchParams;
  if (!can.manageUsers(u)) {
    return (<><div className="head"><h1>Sites & users</h1></div><p className="muted">Only the Administrator or the Director of Operations can manage sites and users.</p></>);
  }
  const sites = allSites();
  const users = db().prepare("SELECT id, username, name, role, active FROM users ORDER BY active DESC, name").all() as { id: number; username: string; name: string; role: string; active: number }[];
  const links = db().prepare("SELECT user_id, site_id FROM user_sites").all() as { user_id: number; site_id: number }[];
  const staff = db().prepare("SELECT site_id, COUNT(*) AS n FROM employees WHERE active = 1 GROUP BY site_id").all() as { site_id: number; n: number }[];
  const editing = users.find((x) => x.id === Number(sp.edit));
  const editSites = new Set(links.filter((l) => l.user_id === editing?.id).map((l) => l.site_id));

  return (
    <>
      <div className="head"><div><div className="eyebrow">Setup</div><h1>Sites & users</h1></div></div>
      {sp.ok && <div className="flash ok">Saved.</div>}
      {sp.error && <div className="flash err">{ERRORS[sp.error] ?? "Something went wrong."}</div>}
      <div className="grid-half">
        <div className="card pad panel">
          <h3>Users</h3>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Name</th><th>Role</th><th>Sites</th><th></th></tr></thead>
              <tbody>
                {users.map((x) => {
                  const r = roleInfo(x.role);
                  const s = links.filter((l) => l.user_id === x.id).map((l) => sites.find((y) => y.id === l.site_id)?.name).filter(Boolean);
                  return (
                    <tr key={x.id} style={x.active ? undefined : { opacity: 0.5 }}>
                      <td><b>{x.name}</b><br /><span className="muted small">{x.username}</span></td>
                      <td className="small">{r.label}</td>
                      <td className="small">{r.allSites ? <span className="muted">All sites</span> : s.join(", ") || <span className="red">None</span>}</td>
                      <td className="nw">
                        <a className="linkbtn" href={`/admin/settings?edit=${x.id}#user-form`}>Edit</a>{" · "}
                        <form action={toggleUser} style={{ display: "inline" }}><input type="hidden" name="id" value={x.id} /><button className="linkbtn" type="submit">{x.active ? "Deactivate" : "Activate"}</button></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form action={saveUser} id="user-form" className="mt" key={editing?.id ?? "new"}>
            <h3>{editing ? `Edit ${editing.name}` : "Add a user"}</h3>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid-form">
              <label className="field">Username<input type="text" name="username" defaultValue={editing?.username} disabled={!!editing} required={!editing} autoCapitalize="none" /></label>
              <label className="field">Full name<input type="text" name="name" defaultValue={editing?.name} required /></label>
              <label className="field">Role
                <select name="role" defaultValue={editing?.role ?? "supervisor"}>{ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
              </label>
              <label className="field">{editing ? "New PIN (leave empty to keep)" : "PIN (4–8 digits)"}<input type="password" name="pin" inputMode="numeric" pattern="\d{4,8}" required={!editing} /></label>
            </div>
            <div className="field">Sites (for supervisors, camp bosses, site and FM managers)</div>
            <div className="chips mb">
              {sites.filter((s) => s.active).map((s) => (
                <label key={s.id} className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" name="sites" value={s.id} defaultChecked={editSites.has(s.id)} /> {s.name}
                </label>
              ))}
            </div>
            <div className="row">
              <button className="btn small" type="submit">{editing ? "Save changes" : "Add user"}</button>
              {editing && <a className="btn small ghost" href="/admin/settings">Cancel</a>}
            </div>
          </form>
        </div>
        <div className="card pad panel">
          <h3>Sites</h3>
          <table className="t">
            <thead><tr><th>Site</th><th>Staff</th><th></th></tr></thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} style={s.active ? undefined : { opacity: 0.5 }}>
                  <td><b>{s.name}</b>{!s.active && <span className="muted small"> (inactive)</span>}</td>
                  <td>{staff.find((x) => x.site_id === s.id)?.n ?? 0}</td>
                  <td><form action={toggleSite}><input type="hidden" name="id" value={s.id} /><button className="linkbtn" type="submit">{s.active ? "Deactivate" : "Activate"}</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addSite} className="row mt">
            <input type="text" name="name" placeholder="New site name" required className="grow" />
            <button className="btn small" type="submit">Add site</button>
          </form>
          <p className="muted small mt">Staff are added under <a className="blue" href="/admin/employees">Employees</a>, one by one or by importing your Excel list.</p>
        </div>
      </div>
    </>
  );
}
