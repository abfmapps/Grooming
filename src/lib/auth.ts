import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, setting } from "./db";

export type Role =
  | "supervisor" | "fm_manager" | "camp_boss" | "site_manager"
  | "director" | "oco" | "hse" | "hr" | "stores" | "admin";

export const ROLES: { code: Role; label: string; field: boolean; manage: boolean; allSites: boolean }[] = [
  { code: "supervisor", label: "Supervisor / Team Leader", field: true, manage: false, allSites: false },
  { code: "camp_boss", label: "Camp Boss", field: true, manage: false, allSites: false },
  { code: "site_manager", label: "Site Manager", field: true, manage: false, allSites: false },
  { code: "fm_manager", label: "FM Manager", field: true, manage: true, allSites: false },
  { code: "director", label: "Director of Operations", field: false, manage: true, allSites: true },
  { code: "oco", label: "Operations Control Officer", field: false, manage: true, allSites: true },
  { code: "hse", label: "HSE", field: false, manage: true, allSites: true },
  { code: "hr", label: "HR", field: false, manage: true, allSites: true },
  { code: "stores", label: "Stores / Procurement", field: false, manage: true, allSites: true },
  { code: "admin", label: "Administrator", field: true, manage: true, allSites: true },
];

export function roleInfo(role: string) {
  return ROLES.find((r) => r.code === role) ?? ROLES[0];
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  siteIds: number[];
}

const COOKIE = "abfm_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

function secret(): string {
  return process.env.SESSION_SECRET || setting(db(), "session_secret", () => crypto.randomBytes(32).toString("hex"));
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function startSession(userId: number) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${userId}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const row = db().prepare("SELECT id, username, name, role FROM users WHERE id = ? AND active = 1").get(Number(id)) as
    | Omit<User, "siteIds">
    | undefined;
  if (!row) return null;
  return { ...row, siteIds: siteIdsFor(row.id, row.role) };
}

function siteIdsFor(userId: number, role: Role): number[] {
  if (roleInfo(role).allSites) {
    return (db().prepare("SELECT id FROM sites WHERE active = 1 ORDER BY name").all() as { id: number }[]).map((r) => r.id);
  }
  return (
    db().prepare("SELECT s.id FROM user_sites us JOIN sites s ON s.id = us.site_id WHERE us.user_id = ? AND s.active = 1 ORDER BY s.name").all(userId) as { id: number }[]
  ).map((r) => r.id);
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireField(): Promise<User> {
  const u = await requireUser();
  if (!roleInfo(u.role).field) redirect("/admin");
  return u;
}

export async function requireManage(): Promise<User> {
  const u = await requireUser();
  if (!roleInfo(u.role).manage) redirect("/app");
  return u;
}

/** Fine-grained permissions. */
export const can = {
  audit: (u: User) => ["oco", "hse", "director", "admin"].includes(u.role),
  closeActions: (u: User) => ["oco", "hse", "director", "admin", "fm_manager", "hr"].includes(u.role),
  issueSupply: (u: User) => ["stores", "hr", "admin", "director", "fm_manager", "supervisor", "site_manager"].includes(u.role),
  manageStaff: (u: User) => ["admin", "hr", "director"].includes(u.role),
  manageUsers: (u: User) => ["admin", "director"].includes(u.role),
  markTraining: (u: User) => !["stores"].includes(u.role),
  checkTypes: (u: User): ("site" | "camp" | "field")[] =>
    u.role === "camp_boss" ? ["camp"] : u.role === "admin" ? ["site", "camp", "field"] : ["site", "field"],
};

export function assertSite(u: User, siteId: number) {
  if (!u.siteIds.includes(siteId)) throw new Error("You do not have access to this site.");
}
