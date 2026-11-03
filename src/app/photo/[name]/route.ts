import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/db";
import { currentUser } from "@/lib/auth";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", gif: "image/gif" };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await currentUser())) return new Response("Unauthorized", { status: 401 });
  const { name } = await params;
  if (!/^[a-f0-9]{24}\.[a-z0-9]{1,5}$/.test(name)) return new Response("Not found", { status: 404 });
  const file = path.join(dataDir(), "uploads", name);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  const ext = name.split(".").pop()!;
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=86400" } });
}
