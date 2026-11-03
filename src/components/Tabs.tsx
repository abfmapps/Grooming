"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function FieldTabs({ showAdmin }: { showAdmin: boolean }) {
  const p = usePathname();
  const tabs = [
    { href: "/app", label: "Today", ic: "🏠", on: p === "/app" },
    { href: "/app/check", label: "Staff", ic: "✅", on: p.startsWith("/app/check") || p.startsWith("/app/submit") },
    { href: "/app/supply", label: "Supply", ic: "📦", on: p.startsWith("/app/supply") },
    { href: "/app/training", label: "Training", ic: "🎓", on: p.startsWith("/app/training") },
    showAdmin ? { href: "/admin", label: "Dashboard", ic: "📊", on: false } : { href: "/logout", label: "Log out", ic: "↩︎", on: false },
  ];
  return (
    <div className="m-tabs">
      <nav>
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={t.on ? "on" : ""} prefetch={false}>
            <span className="ic">{t.ic}</span>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const NAV = [
  ["/admin", "Overview"],
  ["/admin/checklists", "Daily checklists"],
  ["/admin/audits", "Audits"],
  ["/admin/findings", "Findings & actions"],
  ["/admin/employees", "Employees"],
  ["/admin/supply", "Supply gaps"],
  ["/admin/training", "Training"],
  ["/admin/report", "Monthly report"],
  ["/admin/settings", "Sites & users"],
] as const;

export function AdminNav({ counts }: { counts: Record<string, number> }) {
  const p = usePathname();
  return (
    <nav className="nav">
      {NAV.map(([href, label]) => {
        const on = href === "/admin" ? p === "/admin" : p.startsWith(href);
        const n = counts[href];
        return (
          <Link key={href} href={href} className={on ? "on" : ""}>
            <span className="d" />
            {label}
            {n ? <span className="cnt">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
