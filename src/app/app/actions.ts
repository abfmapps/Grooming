"use server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, dataDir, todayISO, nowTime } from "@/lib/db";
import { requireField, requireUser, assertSite, can } from "@/lib/auth";
import { itemsFor, itemLabel, ITEMS, type CheckType } from "@/lib/standards";
import { findingsInWindow, siteStaff, checksOn } from "@/lib/queries";
import { SITE_COOKIE } from "@/lib/field";


export async function chooseSite(formData: FormData) {
  const u = await requireField();
  const siteId = Number(formData.get("site"));
  assertSite(u, siteId);
  (await cookies()).set(SITE_COOKIE, String(siteId), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect("/app");
}

function parseType(v: FormDataEntryValue | null): CheckType {
  return v === "camp" || v === "field" ? v : "site";
}

async function savePhoto(file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("Photo must be an image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Photo is too large (max 8 MB).");
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  const dir = path.join(dataDir(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

/**
 * Save one employee's check. Form fields:
 *   employee, type, status (pass|absent|leave|checked)
 *   item_<code> = "1" | "0"; supply_<code> = "1"; action_<code> = code; requested_<code> = date
 */
export async function saveCheck(formData: FormData) {
  const u = await requireField();
  const employeeId = Number(formData.get("employee"));
  const type = parseType(formData.get("type"));
  if (!can.checkTypes(u).includes(type)) throw new Error("Your role cannot do this type of check.");
  const emp = db().prepare("SELECT id, site_id, name FROM employees WHERE id = ? AND active = 1").get(employeeId) as
    | { id: number; site_id: number; name: string }
    | undefined;
  if (!emp) throw new Error("Employee not found.");
  assertSite(u, emp.site_id);
  const date = todayISO();
  const mode = String(formData.get("status") ?? "checked");
  const note = String(formData.get("note") ?? "").slice(0, 1000);
  const photo = await savePhoto(formData.get("photo"));

  const results = itemsFor(type).map((it) => {
    const ok = formData.get(`item_${it.code}`) !== "0";
    const supply = !ok && it.supplyItem === true && formData.get(`supply_${it.code}`) === "1";
    const action = !ok && !supply ? String(formData.get(`action_${it.code}`) ?? "") || null : null;
    const requested = String(formData.get(`requested_${it.code}`) ?? "") || date;
    return { code: it.code, ok, supply, action, requested };
  });

  let status: string;
  if (mode === "absent" || mode === "leave") status = mode;
  else if (results.some((r) => !r.ok && !r.supply)) status = "gaps";
  else if (results.some((r) => r.supply)) status = "supply";
  else status = "pass";
  const isFinding = status === "gaps";

  const tx = db().transaction(() => {
    const existing = db().prepare("SELECT id, photo FROM checks WHERE employee_id = ? AND check_date = ? AND check_type = ?").get(employeeId, date, type) as
      | { id: number; photo: string | null }
      | undefined;
    const findingNo = isFinding ? findingsInWindow(employeeId, date, existing?.id).length + 1 : null;
    let checkId: number;
    if (existing) {
      checkId = existing.id;
      db().prepare(
        "UPDATE checks SET status = ?, is_finding = ?, finding_no = ?, note = ?, photo = COALESCE(?, photo), checked_by = ?, created_at = datetime('now') WHERE id = ?",
      ).run(status, isFinding ? 1 : 0, findingNo, note, photo, u.id, checkId);
      db().prepare("DELETE FROM check_items WHERE check_id = ?").run(checkId);
    } else {
      checkId = Number(
        db().prepare(
          "INSERT INTO checks (employee_id, site_id, check_date, check_type, status, is_finding, finding_no, note, photo, checked_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).run(employeeId, emp.site_id, date, type, status, isFinding ? 1 : 0, findingNo, note, photo, u.id).lastInsertRowid,
      );
    }
    if (status !== "absent" && status !== "leave") {
      const ins = db().prepare("INSERT INTO check_items (check_id, item_code, ok, supply_gap, action) VALUES (?,?,?,?,?)");
      for (const r of results) ins.run(checkId, r.code, r.ok ? 1 : 0, r.supply ? 1 : 0, r.action);
      // Supply gaps: one open record per employee + item.
      for (const r of results.filter((x) => x.supply)) {
        const label = itemLabel(r.code);
        const open = db().prepare("SELECT id FROM supply_gaps WHERE employee_id = ? AND item = ? AND issued_on IS NULL").get(employeeId, label);
        if (!open) {
          db().prepare("INSERT INTO supply_gaps (employee_id, site_id, item, requested_on, check_id, created_by) VALUES (?,?,?,?,?,?)").run(
            employeeId, emp.site_id, label, r.requested, checkId, u.id,
          );
        }
      }
    }
  });
  tx();

  revalidatePath("/app");
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/app") ? next : `/app/check?type=${type}&saved=${encodeURIComponent(emp.name)}`);
}

export async function submitDay(formData: FormData) {
  const u = await requireField();
  const siteId = Number(formData.get("site"));
  assertSite(u, siteId);
  if (formData.get("confirm") !== "on") redirect("/app/submit?error=confirm");
  const date = todayISO();
  const staff = siteStaff(siteId);
  const checks = checksOn(siteId, date, "site");
  const missing = staff.filter((e) => !checks.has(e.id)).length;
  if (missing > 0) redirect("/app/submit?error=missing");
  const c = [...checks.values()];
  db().prepare(
    `INSERT INTO submissions (site_id, sub_date, submitted_by, submitted_at, staff_total, passed, gaps, supply, absent)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(site_id, sub_date) DO UPDATE SET submitted_by = excluded.submitted_by, submitted_at = excluded.submitted_at,
       staff_total = excluded.staff_total, passed = excluded.passed, gaps = excluded.gaps, supply = excluded.supply, absent = excluded.absent`,
  ).run(
    siteId, date, u.id, nowTime(), staff.length,
    c.filter((x) => x.status === "pass").length,
    c.filter((x) => x.status === "gaps").length,
    c.filter((x) => x.status === "supply").length,
    c.filter((x) => x.status === "absent" || x.status === "leave").length,
  );
  revalidatePath("/app");
  redirect("/app/submit?sent=1");
}

export async function markIssued(formData: FormData) {
  const u = await requireUser();
  if (!can.issueSupply(u)) throw new Error("Not allowed.");
  const id = Number(formData.get("id"));
  const g = db().prepare("SELECT site_id FROM supply_gaps WHERE id = ?").get(id) as { site_id: number } | undefined;
  if (!g) return;
  assertSite(u, g.site_id);
  const on = String(formData.get("on") ?? "") || todayISO();
  db().prepare("UPDATE supply_gaps SET issued_on = ? WHERE id = ?").run(on, id);
  revalidatePath("/app/supply");
  revalidatePath("/admin/supply");
  const back = String(formData.get("back") ?? "/app/supply");
  redirect(back.startsWith("/") ? back : "/app/supply");
}

export async function addSupplyGap(formData: FormData) {
  const u = await requireUser();
  const employeeId = Number(formData.get("employee"));
  const emp = db().prepare("SELECT site_id FROM employees WHERE id = ?").get(employeeId) as { site_id: number } | undefined;
  if (!emp) throw new Error("Employee not found.");
  assertSite(u, emp.site_id);
  const code = String(formData.get("item") ?? "");
  const item = ITEMS.find((i) => i.code === code)?.label ?? String(formData.get("other") ?? "").trim();
  if (!item) redirect("/app/supply?error=item");
  const requested = String(formData.get("requested") ?? "") || todayISO();
  db().prepare("INSERT INTO supply_gaps (employee_id, site_id, item, requested_on, created_by) VALUES (?,?,?,?,?)").run(employeeId, emp.site_id, item, requested, u.id);
  revalidatePath("/app/supply");
  redirect("/app/supply?added=1");
}

export async function markTrained(formData: FormData) {
  const u = await requireUser();
  if (!can.markTraining(u)) throw new Error("Not allowed.");
  const id = Number(formData.get("id"));
  const emp = db().prepare("SELECT site_id FROM employees WHERE id = ?").get(id) as { site_id: number } | undefined;
  if (!emp) return;
  assertSite(u, emp.site_id);
  const undo = formData.get("undo") === "1";
  db().prepare("UPDATE employees SET trained_on = ? WHERE id = ?").run(undo ? null : todayISO(), id);
  revalidatePath("/app/training");
  const back = String(formData.get("back") ?? "/app/training");
  redirect(back.startsWith("/") ? back : "/app/training");
}
