import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rel = searchParams.get("path") || "";

    const uploadsRoot = path.join(process.cwd(), "uploads");
    const abs = path.resolve(uploadsRoot, rel);

    // ป้องกัน path traversal – ต้องอยู่ภายใต้โฟลเดอร์ uploads เท่านั้น
    if (!abs.startsWith(uploadsRoot)) {
      return NextResponse.json({ ok: false, error: "invalid path" }, { status: 400 });
    }

    const stat = await fs.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) {
      return NextResponse.json({ ok: false, error: "ไม่พบไฟล์" }, { status: 404 });
    }

    await fs.unlink(abs);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("delete error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}