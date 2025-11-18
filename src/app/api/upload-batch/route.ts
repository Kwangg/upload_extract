import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

// รับหลายไฟล์ผ่าน formData key 'files' โดยตั้งชื่อไฟล์เป็น webkitRelativePath
// สร้างโฟลเดอร์ย่อยใน uploads สำหรับ batch นี้ และคงโครงสร้างโฟลเดอร์ตามชื่อไฟล์
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ ok: false, error: "ไม่พบไฟล์ในคำขอ" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    // ใช้โฟลเดอร์บนสุดจากไฟล์แรกเป็นชื่อฐานของ batch
    const firstName = (files[0].name || "batch").replace(/\\/g, "/");
    const top = firstName.split("/")[0] || "batch";
    const safeTop = top.replace(/[^a-zA-Z0-9._-]/g, "_");
    const batchRoot = path.join(uploadsDir, `${Date.now()}-${safeTop}`);
    await fs.mkdir(batchRoot, { recursive: true });

    let count = 0;
    for (const f of files) {
      const relRaw = (f.name || f.type || "file").replace(/\\/g, "/");
      // ป้องกัน path traversal และ normalize ส่วนประกอบ
      const segments = relRaw.split("/").filter((seg) => seg && seg !== "." && seg !== "..");
      const targetAbs = path.join(batchRoot, ...segments);
      const targetDir = path.dirname(targetAbs);
      await fs.mkdir(targetDir, { recursive: true });
      const buf = Buffer.from(await f.arrayBuffer());
      await fs.writeFile(targetAbs, buf);
      count++;
    }

    const batchRelative = path.relative(uploadsDir, batchRoot).split(path.sep).join("/");
    return NextResponse.json({ ok: true, batchRelative, filesCount: count });
  } catch (err: any) {
    console.error("upload-batch error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}