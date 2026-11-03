import { currentUser, roleInfo } from "@/lib/auth";
import { todayISO } from "@/lib/db";
import { monthlyReport } from "@/lib/queries";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || !roleInfo(u.role).manage) return new Response("Unauthorized", { status: 401 });
  const month = new URL(req.url).searchParams.get("month") ?? todayISO().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad month", { status: 400 });
  const rows = monthlyReport(u.siteIds, month);
  const head = ["Site", "Staff", "Days", "Checklists sent", "Site checks", "Pass rate %", "Findings", "Repeat findings", "Field checks", "Field target", "Audits", "Latest audit score", "Actions raised", "Actions closed on time", "Actions open", "Supply gaps opened", "Supply gaps waiting", "Avg working days to issue", "Trained %"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...rows.map((r) => [r.site, r.staff, r.days, r.sent, r.siteChecks, r.passRate, r.findings, r.repeatFindings, r.fieldChecks, r.fieldTarget, r.audits, r.latestAudit, r.actionsRaised, r.actionsClosedOnTime, r.actionsOpen, r.supplyOpened, r.supplyOpen, r.supplyAvgDays, r.trainedPct])];
  const csv = "﻿" + lines.map((l) => l.map(esc).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="abfm-grooming-${month}.csv"` } });
}
