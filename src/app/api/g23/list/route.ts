import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const uploadsDir = path.join(process.cwd(), "uploads");

    const results: string[] = [];
    const walk = async (dir: string, base: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(abs, base);
        } else if (e.isFile()) {
          const low = e.name.toLowerCase();
          if (low.endsWith(".g23") || low.endsWith(".d23")) {
            const rel = path.relative(base, abs).split(path.sep).join("/");
            results.push(rel);
          }
        }
      }
    };

    await walk(uploadsDir, uploadsDir);
    return NextResponse.json({ ok: true, files: results });
  } catch (err) {
    console.error("g23 list error:", err);
    return NextResponse.json({ ok: false, error: "ไม่สามารถอ่านรายการไฟล์ได้" }, { status: 500 });
  }
}