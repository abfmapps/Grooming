import Link from "next/link";
import { requireManage, roleInfo } from "@/lib/auth";
import { initials } from "@/lib/field";
import { openActions, supplyGaps } from "@/lib/queries";
import { AdminNav } from "@/components/Tabs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireManage();
  const counts = {
    "/admin/findings": openActions(u.siteIds).length,
    "/admin/supply": supplyGaps(u.siteIds).length,
  };
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><div className="eyebrow">Al Bonian FM</div><b>Grooming Control</b></div>
        <AdminNav counts={counts} />
        <div className="user">
          <div className="avatar">{initials(u.name)}</div>
          <div>
            <b>{u.name}</b>
            {roleInfo(u.role).label}
            <div>
              {roleInfo(u.role).field && <><Link href="/app">Checklist app</Link> · </>}
              <a href="/logout">Log out</a>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
