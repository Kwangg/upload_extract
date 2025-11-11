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
    const baseName = path.parse(abs).name;
    const previewDir = path.join(process.cwd(), "uploads", "_preview");
    await fs.mkdir(previewDir, { recursive: true });
    const outPath = path.join(previewDir, `${baseName}.sql`);

    const text = await fs.readFile(abs, "utf8");
    let decoded: Buffer;
    try {
      decoded = Buffer.from(text.replace(/\s+/g, ""), "base64");
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: "ไฟล์ไม่ใช่ base64 หรือเสียหาย" }, { status: 415 });
    }

    await fs.writeFile(outPath, decoded);
    const head = decoded.subarray(0, Math.min(5000, decoded.length)).toString("utf8");
    const outRel = path.relative(path.join(process.cwd(), "uploads"), outPath).split(path.sep).join("/");

    return NextResponse.json({ ok: true, previewHead: head, outputRelative: outRel, size: decoded.length });
  } catch (err) {
    console.error("g23 preview error:", err);
    return NextResponse.json({ ok: false, error: "ไม่สามารถถอดรหัสไฟล์ได้" }, { status: 500 });
  }
}