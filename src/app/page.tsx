import { redirect } from "next/navigation";
import { currentUser, roleInfo } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const u = await currentUser();
  if (!u) redirect("/login");
  const r = roleInfo(u.role);
  redirect(r.field && u.role !== "admin" ? "/app" : "/admin");
}
