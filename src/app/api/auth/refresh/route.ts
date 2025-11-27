import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ต่ออายุคุกกี้ session เมื่อยังมีการใช้งาน
export async function POST(req: NextRequest) {
  const session = req.cookies.get("session")?.value || "";
  if (!session) {
    return NextResponse.json({ ok: false, error: "no session" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  // ต่ออายุอีก 20 นาที (เลื่อนตามการใช้งาน)
  res.headers.set(
    "Set-Cookie",
    `session=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1200`
  );
  return res;
}