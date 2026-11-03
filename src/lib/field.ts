import { cookies } from "next/headers";
import type { User } from "./auth";
import { site, type Site } from "./queries";

export const SITE_COOKIE = "abfm_site";

/** The site the field user is working on (chosen on the Today screen). */
export async function activeSite(u: User): Promise<Site | null> {
  const chosen = Number((await cookies()).get(SITE_COOKIE)?.value);
  const id = u.siteIds.includes(chosen) ? chosen : u.siteIds[0];
  return id ? (site(id) ?? null) : null;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}
