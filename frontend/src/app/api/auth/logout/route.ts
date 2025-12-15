import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const res = NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  // Clear session cookie
  res.headers.set(
    "Set-Cookie",
    `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  return res;
}