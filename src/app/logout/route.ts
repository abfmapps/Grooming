import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";

export async function GET(req: Request) {
  await endSession();
  return NextResponse.redirect(new URL("/login", req.url));
}
