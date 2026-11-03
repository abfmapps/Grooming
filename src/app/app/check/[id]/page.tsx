import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireField, can } from "@/lib/auth";
import { initials } from "@/lib/field";
import { todayISO, db } from "@/lib/db";
import { employee, checkWithItems, findingsInWindow, fmtDate } from "@/lib/queries";
import { AREAS, CHECK_TYPES, itemsFor, type CheckType } from "@/lib/standards";
import { CheckForm } from "@/components/CheckForm";

export default async function CheckEmployee({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const u = await requireField();
  const { id } = await params;
  const sp = await searchParams;
  const allowed = can.checkTypes(u);
  const type = (allowed.includes(sp.type as CheckType) ? sp.type : allowed[0]) as CheckType;
  const e = employee(Number(id));
  if (!e || !e.active || !e.site_id) notFound();
  if (!u.siteIds.includes(e.site_id)) redirect("/app");
  const today = todayISO();
  const existing = checkWithItems(e.id, today, type);
  const prior = findingsInWindow(e.id, today, existing?.id);
  const openGaps = db().prepare("SELECT item, requested_on FROM supply_gaps WHERE employee_id = ? AND issued_on IS NULL").all(e.id) as { item: string; requested_on: string }[];
  const items = itemsFor(type);
  const areas = AREAS.filter((a) => items.some((i) => i.area === a.code)).map((a) => ({ ...a, items: items.filter((i) => i.area === a.code) }));

  return (
    <>
      <div className="m-top">
        <Link href={`/app/check?type=${type}`} className="back">‹ {CHECK_TYPES[type].label}</Link>
        <div className="row">
          <div className="avatar">{initials(e.name)}</div>
          <div className="grow">
            <b style={{ fontSize: 16 }}>{e.name}</b>
            <div className="muted small">{e.staff_no} · {e.trade}{e.uniform_size ? ` · Uniform ${e.uniform_size}` : ""}{e.shoe_size ? ` · Shoes ${e.shoe_size}` : ""}</div>
          </div>
        </div>
      </div>
      <div className="m-body">
        {existing && <div className="flash info">Already checked today. Saving again replaces the earlier result.</div>}
        {prior.length > 0 && (
          <div className="flash warn">
            ⚠️ <b>{prior.length} finding{prior.length > 1 ? "s" : ""} in the last 90 days</b> (latest {fmtDate(prior[0].date)}).
          </div>
        )}
        {openGaps.length > 0 && (
          <div className="flash info">📦 Waiting from Stores: {openGaps.map((g) => `${g.item} (requested ${fmtDate(g.requested_on)})`).join(", ")}</div>
        )}
        <CheckForm
          employeeId={e.id}
          type={type}
          areas={areas.map((a) => ({ code: a.code, label: a.label, points: a.auditPoints, items: a.items.map((i) => ({ code: i.code, label: i.label, hint: i.hint, supplyItem: !!i.supplyItem })) }))}
          priorFindings={prior.length}
          openGapItems={openGaps.map((g) => g.item)}
          existing={existing ? { status: existing.status, note: existing.note, photo: existing.photo, items: existing.items.map((i) => ({ code: i.item_code, ok: !!i.ok, supply: !!i.supply_gap, action: i.action ?? "" })) } : null}
          today={today}
        />
      </div>
    </>
  );
}
