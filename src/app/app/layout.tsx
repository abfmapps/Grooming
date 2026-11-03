import { requireField, roleInfo } from "@/lib/auth";
import { FieldTabs } from "@/components/Tabs";

export const dynamic = "force-dynamic";

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const u = await requireField();
  return (
    <div className="m">
      {children}
      <FieldTabs showAdmin={roleInfo(u.role).manage} />
    </div>
  );
}
