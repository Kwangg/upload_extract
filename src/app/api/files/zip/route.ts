import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import AdmZip from "adm-zip";

export const runtime = "nodejs";

type ZipBody = {
  sourceDir?: string; // relative to uploads
  items?: string[]; // relative paths under uploads
  zipName?: string; // optional output filename (without path), default auto
};

export async function POST(req: NextRequest) {
  try {
    const body: ZipBody = await req.json();
    const uploadsRoot = path.join(process.cwd(), "uploads");

    const resolveSafe = (rel: string) => {
      const abs = path.resolve(uploadsRoot, rel);
      if (!abs.startsWith(uploadsRoot)) throw new Error("invalid path");
      return abs;
    };

    let filesToZip: { abs: string; entryName: string }[] = [];
    let baseEntryPrefix = "";

    if (body.sourceDir) {
      const absDir = resolveSafe(body.sourceDir);
      const stat = await fs.stat(absDir).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        return NextResponse.json({ ok: false, error: "ต้องระบุโฟลเดอร์ที่มีอยู่จริง" }, { status: 400 });
      }
      const baseName = path.basename(absDir);
      baseEntryPrefix = baseName;

      // Walk directory recursively and collect files
      const walk = async (current: string, root: string) => {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const e of entries) {
          const abs = path.join(current, e.name);
          if (e.isDirectory()) {
            await walk(abs, root);
          } else if (e.isFile()) {
            const relInside = path.relative(root, abs).split(path.sep).join("/");
            const entryName = `${baseEntryPrefix}/${relInside}`;
            filesToZip.push({ abs, entryName });
          }
        }
      };
      await walk(absDir, absDir);
    } else if (Array.isArray(body.items) && body.items.length > 0) {
      for (const rel of body.items) {
        const abs = resolveSafe(rel);
        const stat = await fs.stat(abs).catch(() => null);
        if (!stat) continue;
        if (stat.isDirectory()) {
          // zip directory preserving its name as top-level folder
          const baseName = path.basename(abs);
          const walk = async (current: string, root: string) => {
            const entries = await fs.readdir(current, { withFileTypes: true });
            for (const e of entries) {
              const p = path.join(current, e.name);
              if (e.isDirectory()) await walk(p, root);
              else if (e.isFile()) {
                const relInside = path.relative(root, p).split(path.sep).join("/");
                filesToZip.push({ abs: p, entryName: `${baseName}/${relInside}` });
              }
            }
          };
          await walk(abs, abs);
        } else if (stat.isFile()) {
          // place file at root of zip using its filename
          filesToZip.push({ abs, entryName: path.basename(abs) });
        }
      }
    } else {
      return NextResponse.json({ ok: false, error: "ต้องระบุ sourceDir หรือ items" }, { status: 400 });
    }

    if (filesToZip.length === 0) {
      return NextResponse.json({ ok: false, error: "ไม่พบไฟล์ในรายการที่จะ zip" }, { status: 400 });
    }

  const zip = new AdmZip();
  const entryNames: string[] = [];
  for (const f of filesToZip) {
    const buf = await fs.readFile(f.abs);
    zip.addFile(f.entryName, buf);
    entryNames.push(f.entryName);
  }

    const zipBaseName = body.zipName
      ? body.zipName.replace(/[^a-zA-Z0-9._-]/g, "_")
      : `${Date.now()}-archive.zip`;
    const zipAbs = path.join(uploadsRoot, zipBaseName);
    zip.writeZip(zipAbs);

    const stat = await fs.stat(zipAbs);
    const zipRelative = path.relative(uploadsRoot, zipAbs).split(path.sep).join("/");
  return NextResponse.json({ ok: true, zipRelative, entriesCount: filesToZip.length, size: stat.size, entries: entryNames });
  } catch (err: any) {
    console.error("zip route error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}