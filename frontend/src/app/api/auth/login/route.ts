import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body?.username || "");
    const password = String(body?.password || "");

    // หมายเหตุ: เดิมจะตรวจเชื่อมต่อฐานข้อมูลด้วย ping() แต่ปัจจุบันปิดไว้ชั่วคราว
    // เพื่อแก้ปัญหา missing module (mysql2) ระหว่าง build. เมื่อติดตั้ง mysql2 แล้ว
    // สามารถเปิดการตรวจ DB ได้อีกครั้ง.

    // Simple credential check per requirement
    // อนุญาตให้ผู้ใช้ใดๆ เข้าด้วยรหัสผ่านเดียว (demo): 1234
    if (password !== "1234" || username.trim() === "") {
      return NextResponse.json({ ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }

    // ออก cookie ชื่อผู้ใช้เป็น session เพื่อแยกขอบเขตการมองเห็นไฟล์
    const safeUser = encodeURIComponent(username.trim());
    const res = NextResponse.json({ ok: true, user: { username: username.trim() } });
    res.headers.set(
      "Set-Cookie",
      `session=${safeUser}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`
    );
    return res;
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
