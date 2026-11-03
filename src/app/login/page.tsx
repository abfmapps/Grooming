import { redirect } from "next/navigation";
import { db, verifyPin } from "@/lib/db";
import { startSession, currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";
  const username = String(formData.get("username") ?? "").trim();
  const pin = String(formData.get("pin") ?? "");
  const row = db().prepare("SELECT id, pin_hash FROM users WHERE username = ? AND active = 1").get(username) as
    | { id: number; pin_hash: string }
    | undefined;
  if (!row || !verifyPin(pin, row.pin_hash)) redirect("/login?error=1");
  await startSession(row.id);
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="login">
      <form action={login} className="card">
        <div className="eyebrow">Al Bonian FM</div>
        <h1>Grooming Control</h1>
        <div className="bar" />
        <p className="muted small mb">Daily checklist and management review. One standard, controlled daily.</p>
        {error && <div className="flash err">Wrong username or PIN.</div>}
        <label className="field">
          Username
          <input type="text" name="username" autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="field">
          PIN
          <input type="password" name="pin" inputMode="numeric" autoComplete="current-password" required />
        </label>
        <button className="btn block" type="submit">Log in</button>
      </form>
    </main>
  );
}
