import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManage, can } from "@/lib/auth";
import { todayISO } from "@/lib/db";
import { sites, siteStaff, controlEvidence } from "@/lib/queries";
import { AuditForm } from "@/components/AuditForm";

export default async function NewAudit({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const u = await requireManage();
  if (!can.audit(u)) redirect("/admin/audits");
  const sp = await searchParams;
  const list = sites(u.siteIds);
  const siteId = list.find((s) => s.id === Number(sp.site))?.id ?? null;
  const today = todayISO();
  return (
    <>
      <div className="head">
        <div><div className="eyebrow"><Link href="/admin/audits">Audits</Link> › New</div><h1>Record an audit</h1><div className="muted small mt-s">Sample at least 5 staff on the day, then check the daily checklists and gap log.</div></div>
      </div>
      <AuditForm
        sites={list.map((s) => ({ id: s.id, name: s.name }))}
        siteId={siteId}
        staff={siteId ? siteStaff(siteId).map((e) => ({ id: e.id, name: e.name, staff_no: e.staff_no })) : []}
        evidence={siteId ? controlEvidence(siteId, today) : null}
        today={today}
        auditor={u.name}
      />
    </>
  );
}
