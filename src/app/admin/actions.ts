"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, hashPin, todayISO, addDays } from "@/lib/db";
import { requireManage, can, assertSite, ROLES, type Role } from "@/lib/auth";
import { AREAS, TARGETS } from "@/lib/standards";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0);
const back = (f: FormData, fallback: string) => {
  const b = str(f, "back");
  return b.startsWith("/admin") ? b : fallback;
};

// ---------------- audits ----------------
export async function createAudit(f: FormData) {
  const u = await requireManage();
  if (!can.audit(u)) throw new Error("Only the OCO, HSE or Director can record audits.");
  const siteId = num(f, "site");
  assertSite(u, siteId);
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  const max = Object.fromEntries(AREAS.map((a) => [a.code, a.auditPoints]));
  const date = str(f, "date") || todayISO();
  const tx = db().transaction(() => {
    const id = Number(
      db().prepare(
        `INSERT INTO audits (site_id, audit_date, auditor_id, with_hse, sample_size, score_grooming, score_ppe, score_communication, score_control, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        siteId, date, u.id, str(f, "with_hse"), Math.max(1, num(f, "sample") || 5),
        clamp(num(f, "score_grooming"), max.grooming), clamp(num(f, "score_ppe"), max.ppe),
        clamp(num(f, "score_communication"), max.communication), clamp(num(f, "score_control"), 20), str(f, "notes"),
      ).lastInsertRowid,
    );
    const ins = db().prepare("INSERT INTO audit_actions (audit_id, finding, employee_id, action, owner, due_on) VALUES (?,?,?,?,?,?)");
    for (let i = 0; i < 20; i++) {
      const finding = str(f, `finding_${i}`);
      if (!finding) continue;
      ins.run(id, finding, num(f, `employee_${i}`) || null, str(f, `action_${i}`), str(f, `owner_${i}`), str(f, `due_${i}`) || addDays(date, TARGETS.findingCloseDays));
    }
    return id;
  });
  const id = tx();
  revalidatePath("/admin");
  redirect(`/admin/audits/${id}?created=1`);
}

export async function auditStep(f: FormData) {
  const u = await requireManage();
  const id = num(f, "id");
  const a = db().prepare("SELECT site_id FROM audits WHERE id = ?").get(id) as { site_id: number } | undefined;
  if (!a) return;
  assertSite(u, a.site_id);
  const step = str(f, "step");
  const col = { report: "report_sent_on", plan: "plan_received_on", verified: "verified_on" }[step];
  if (!col) return;
  if (step !== "plan" && !can.audit(u)) throw new Error("Only the OCO/HSE can do this step.");
  db().prepare(`UPDATE audits SET ${col} = ? WHERE id = ?`).run(f.get("undo") ? null : str(f, "on") || todayISO(), id);
  revalidatePath(`/admin/audits/${id}`);
  redirect(`/admin/audits/${id}`);
}

export async function addAuditAction(f: FormData) {
  const u = await requireManage();
  const auditId = num(f, "audit");
  const a = db().prepare("SELECT site_id, audit_date FROM audits WHERE id = ?").get(auditId) as { site_id: number; audit_date: string } | undefined;
  if (!a) return;
  assertSite(u, a.site_id);
  if (!can.closeActions(u)) throw new Error("Not allowed.");
  const finding = str(f, "finding");
  if (finding) {
    db().prepare("INSERT INTO audit_actions (audit_id, finding, employee_id, action, owner, due_on) VALUES (?,?,?,?,?,?)").run(
      auditId, finding, num(f, "employee") || null, str(f, "action"), str(f, "owner"), str(f, "due") || addDays(a.audit_date, TARGETS.findingCloseDays),
    );
  }
  revalidatePath(`/admin/audits/${auditId}`);
  redirect(`/admin/audits/${auditId}`);
}

export async function toggleAction(f: FormData) {
  const u = await requireManage();
  if (!can.closeActions(u)) throw new Error("Not allowed.");
  const id = num(f, "id");
  const row = db().prepare("SELECT a.site_id FROM audit_actions aa JOIN audits a ON a.id = aa.audit_id WHERE aa.id = ?").get(id) as { site_id: number } | undefined;
  if (!row) return;
  assertSite(u, row.site_id);
  db().prepare("UPDATE audit_actions SET closed_on = ? WHERE id = ?").run(f.get("reopen") ? null : todayISO(), id);
  revalidatePath("/admin");
  redirect(back(f, "/admin/findings"));
}

// ---------------- sites, users, employees ----------------
export async function addSite(f: FormData) {
  const u = await requireManage();
  if (!can.manageUsers(u)) throw new Error("Not allowed.");
  const name = str(f, "name");
  if (name) {
    try {
      db().prepare("INSERT INTO sites (name) VALUES (?)").run(name);
    } catch {
      redirect("/admin/settings?error=site_exists");
    }
  }
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=site");
}

export async function toggleSite(f: FormData) {
  const u = await requireManage();
  if (!can.manageUsers(u)) throw new Error("Not allowed.");
  db().prepare("UPDATE sites SET active = 1 - active WHERE id = ?").run(num(f, "id"));
  revalidatePath("/admin/settings");
  redirect("/admin/settings");
}

export async function saveUser(f: FormData) {
  const u = await requireManage();
  if (!can.manageUsers(u)) throw new Error("Not allowed.");
  const id = num(f, "id");
  const role = str(f, "role") as Role;
  if (!ROLES.some((r) => r.code === role)) throw new Error("Unknown role.");
  const pin = str(f, "pin");
  if (pin && !/^\d{4,8}$/.test(pin)) redirect("/admin/settings?error=pin");
  const siteIds = f.getAll("sites").map(Number).filter(Boolean);
  const tx = db().transaction(() => {
    let userId = id;
    if (id) {
      db().prepare("UPDATE users SET name = ?, role = ? WHERE id = ?").run(str(f, "name"), role, id);
      if (pin) db().prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(hashPin(pin), id);
    } else {
      if (!pin) return "pin";
      try {
        userId = Number(db().prepare("INSERT INTO users (username, name, role, pin_hash) VALUES (?,?,?,?)").run(str(f, "username"), str(f, "name"), role, hashPin(pin)).lastInsertRowid);
      } catch {
        return "user_exists";
      }
    }
    db().prepare("DELETE FROM user_sites WHERE user_id = ?").run(userId);
    const ins = db().prepare("INSERT INTO user_sites (user_id, site_id) VALUES (?, ?)");
    for (const s of siteIds) ins.run(userId, s);
    return null;
  });
  const err = tx();
  if (err) redirect(`/admin/settings?error=${err}`);
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=user");
}

export async function toggleUser(f: FormData) {
  const u = await requireManage();
  if (!can.manageUsers(u)) throw new Error("Not allowed.");
  const id = num(f, "id");
  if (id === u.id) redirect("/admin/settings?error=self");
  db().prepare("UPDATE users SET active = 1 - active WHERE id = ?").run(id);
  revalidatePath("/admin/settings");
  redirect("/admin/settings");
}

export async function saveEmployee(f: FormData) {
  const u = await requireManage();
  if (!can.manageStaff(u)) throw new Error("Not allowed.");
  const id = num(f, "id");
  const vals = [str(f, "staff_no"), str(f, "name"), str(f, "trade"), num(f, "site") || null, str(f, "uniform_size"), str(f, "shoe_size")];
  try {
    if (id) db().prepare("UPDATE employees SET staff_no=?, name=?, trade=?, site_id=?, uniform_size=?, shoe_size=?, active=? WHERE id=?").run(...vals, f.get("active") ? 1 : 0, id);
    else db().prepare("INSERT INTO employees (staff_no, name, trade, site_id, uniform_size, shoe_size) VALUES (?,?,?,?,?,?)").run(...vals);
  } catch {
    redirect(`${back(f, "/admin/employees")}?error=staff_no`);
  }
  revalidatePath("/admin/employees");
  redirect(id ? `/admin/employees/${id}?saved=1` : back(f, "/admin/employees") + "?ok=1");
}

/** CSV import: staff_no,name,trade,site,uniform_size,shoe_size (header row optional). Existing staff numbers are updated. */
export async function importEmployees(f: FormData) {
  const u = await requireManage();
  if (!can.manageStaff(u)) throw new Error("Not allowed.");
  let text = str(f, "csv");
  const file = f.get("file");
  if (file instanceof File && file.size > 0) text = await file.text();
  const sites = db().prepare("SELECT id, name FROM sites").all() as { id: number; name: string }[];
  let added = 0, updated = 0, skipped = 0;
  const tx = db().transaction(() => {
    for (const line of text.split(/\r?\n/)) {
      const cols = parseCsvLine(line);
      if (cols.length < 2 || /^staff/i.test(cols[0])) continue;
      const [staffNo, name, trade = "", siteName = "", uni = "", shoe = ""] = cols;
      if (!staffNo || !name) { skipped++; continue; }
      let site = sites.find((s) => s.name.toLowerCase() === siteName.toLowerCase());
      if (!site && siteName) {
        const sid = Number(db().prepare("INSERT INTO sites (name) VALUES (?)").run(siteName).lastInsertRowid);
        site = { id: sid, name: siteName };
        sites.push(site);
      }
      const r = db().prepare("SELECT id FROM employees WHERE staff_no = ?").get(staffNo) as { id: number } | undefined;
      if (r) {
        db().prepare("UPDATE employees SET name=?, trade=?, site_id=COALESCE(?, site_id), uniform_size=?, shoe_size=?, active=1 WHERE id=?").run(name, trade, site?.id ?? null, uni, shoe, r.id);
        updated++;
      } else {
        db().prepare("INSERT INTO employees (staff_no, name, trade, site_id, uniform_size, shoe_size) VALUES (?,?,?,?,?,?)").run(staffNo, name, trade, site?.id ?? null, uni, shoe);
        added++;
      }
    }
  });
  tx();
  revalidatePath("/admin/employees");
  redirect(`/admin/employees?imported=${added}&updated=${updated}&skipped=${skipped}`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t" || c === ";") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out.filter((_, i, a) => i < a.length || a[i] !== "");
}
