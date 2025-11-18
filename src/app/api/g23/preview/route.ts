import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fileName = String(body?.fileName || "");
    if (!fileName) {
      return NextResponse.json({ ok: false, error: "ไม่พบพาธไฟล์" }, { status: 400 });
    }

    const abs = path.join(process.cwd(), "uploads", fileName);
    // ไม่สร้างไฟล์หรือโฟลเดอร์ _preview อีกต่อไป

    const text = await fs.readFile(abs, "utf8");
    let decoded: Buffer;
    try {
      decoded = Buffer.from(text.replace(/\s+/g, ""), "base64");
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: "ไฟล์ไม่ใช่ base64 หรือเสียหาย" }, { status: 415 });
    }

    const head = decoded.subarray(0, Math.min(5000, decoded.length)).toString("utf8");
    return NextResponse.json({ ok: true, previewHead: head, outputRelative: null, size: decoded.length, persisted: false });
  } catch (err) {
    console.error("g23 preview error:", err);
    return NextResponse.json({ ok: false, error: "ไม่สามารถถอดรหัสไฟล์ได้" }, { status: 500 });
  }
}