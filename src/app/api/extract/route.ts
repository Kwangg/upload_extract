import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import * as zip from "@zip.js/zip.js";
import { createExtractorFromFile } from "node-unrar-js";

// Helper สำหรับแปลง Windows path → URL file:// ที่ extractor ต้องการ
const toExtractorPath = (p: string) => (process.platform === "win32" ? `file:///${p.replace(/\\/g, "/")}` : p);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fileName = (body?.fileName as string) || "";
    // ใช้รหัสผ่านเริ่มต้น 1234 โดยอัตโนมัติ หากไม่ได้ส่งมา
    const password = String(body?.password ?? "bizpoten1234");
    // หากต้องการแตกเฉพาะ entry ใดๆ ให้ส่ง targetEntry มา
    const targetEntry = (body?.targetEntry as string) || null;
    // path สำหรับแตกไฟล์ ถ้าไม่ส่งมา จะสร้างใหม่เอง
    const outputDir = (body?.outputDir as string) || null;

    if (!fileName) {
      return NextResponse.json({ error: "Missing fileName" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "uploads", fileName);
    const baseName = path.parse(fileName).name;
    const extractDir = outputDir
      ? path.join(process.cwd(), "uploads", outputDir)
      : path.join(process.cwd(), "uploads", fileName.replace(/\.[^/.]+$/, "")); // ใช้ชื่อไฟล์แม่เป็นโฟลเดอร์ ไม่สร้าง timestamp ใหม่

    await fs.mkdir(extractDir, { recursive: true });

    const ext = path.extname(fileName).toLowerCase();

    if ([".zip", ".d23", ".g23"].includes(ext)) {
      // Helper: resolve collision by appending (archiveName) and incremental index if needed
      const ensureUniquePath = async (desiredPath: string): Promise<string> => {
        const dir = path.dirname(desiredPath);
        const { name, ext } = path.parse(desiredPath);
        let candidate = desiredPath;
        let index = 1;
        while (true) {
          try {
            await fs.stat(candidate);
            // exists -> make a new candidate
            const suffix = index === 1 ? ` (2)` : ` (${index + 1})`;
            candidate = path.join(dir, `${name}${suffix}${ext}`);
            index++;
          } catch {
            // not exists
            return candidate;
          }
        }
      };

      // Place all extracted entries into subfolder named after the archive when outputDir provided
      const zipTargetDir = outputDir
        ? path.join(process.cwd(), "uploads", outputDir, baseName)
        : extractDir;
      await fs.mkdir(zipTargetDir, { recursive: true });
      const blob = await fs.readFile(filePath).then((b) => new Blob([b]));
      const reader = new zip.ZipReader(new zip.BlobReader(blob), { password });
      const entries = await reader.getEntries();
      const extractedEntries: string[] = [];

      for (const entry of entries) {
        if (entry.directory || !entry.getData) continue;
        // ถ้าระบุ targetEntry มา ให้แตกเฉพาะไฟล์นั้น
        if (targetEntry && entry.filename !== targetEntry) continue;

        const writer = new zip.BlobWriter();
        const data = await entry.getData(writer, {
          password,
          onprogress: async (progress, total) => {
            // const percent = total && total > 0 ? Math.round((progress / total) * 100) : Math.round(progress * 100);
            // console.log(`Extracting ${entry.filename}: ${percent}%`);
          },
        });

        const desiredPath = path.join(zipTargetDir, entry.filename);
        await fs.mkdir(path.dirname(desiredPath), { recursive: true });
        const targetPath = await ensureUniquePath(desiredPath);
        const buffer = Buffer.from(await data.arrayBuffer());
        await fs.writeFile(targetPath, buffer);
        const savedRel = path.relative(zipTargetDir, targetPath).split(path.sep).join("/");
        extractedEntries.push(savedRel);
      }

      await reader.close();

      return NextResponse.json({
        message: "ZIP extracted",
        extractedFiles: extractedEntries,
        extractedGroups: [],
      });
    }

    if (ext === ".rar") {
      // For RAR, extract into a subfolder named after the archive to avoid collisions
      const rarTargetDir = outputDir
        ? path.join(process.cwd(), "uploads", outputDir, baseName)
        : extractDir;
      await fs.mkdir(rarTargetDir, { recursive: true });

      const group = {
        zipRelative: fileName,
        extractRelative: path.relative(path.join(process.cwd(), "uploads"), rarTargetDir),
        entries: [] as string[],
      };

      try {
        const extractor = await createExtractorFromFile({ filepath: filePath, targetPath: toExtractorPath(rarTargetDir), password });
        const result = extractor.extract();
        const allEntries = [...result.files]
          .map((f: any) => f.fileHeader?.name)
          .filter((n: any) => typeof n === "string");
        // ถ้าระบุ targetEntry มา ให้แตกเฉพาะไฟล์นั้น โดยกรองออกมาก่อน
        if (targetEntry) {
          // แตกเฉพาะไฟล์ที่ตรงกับ targetEntry เท่านั้น
          const wanted = allEntries.find((n:string) => n === targetEntry);
          group.entries = wanted ? [wanted] : [];
        } else {
          group.entries = allEntries;
        }
      } catch (e: any) {
        console.error("RAR password extraction failed:", e);
        if (e.message?.includes("password")) {
          return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง", requiresPassword: true }, { status: 403 });
        }
        return NextResponse.json({ error: "แตกไฟล์ RAR ไม่สำเร็จ" }, { status: 500 });
      }

      return NextResponse.json({
        message: "RAR extracted",
        extractedFiles: [],
        extractedGroups: [group],
      });
    }

    return NextResponse.json({ error: "Unsupported archive format" }, { status: 400 });
  } catch (err: any) {
    console.error("Extract error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}