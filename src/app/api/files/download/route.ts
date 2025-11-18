import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rel = searchParams.get("path") || "";
    const uploadsRoot = path.join(process.cwd(), "uploads");

    const abs = path.resolve(uploadsRoot, rel);
    if (!abs.startsWith(uploadsRoot)) {
      return NextResponse.json({ ok: false, error: "invalid path" }, { status: 400 });
    }

    const stat = await fs.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) {
      return NextResponse.json({ ok: false, error: "ไม่พบไฟล์" }, { status: 404 });
    }

    const data = await fs.readFile(abs);
    const filename = path.basename(abs);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("download error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}