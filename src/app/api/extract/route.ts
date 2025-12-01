import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import * as zip from "@zip.js/zip.js";
import { createExtractorFromFile } from "node-unrar-js";
import StreamZip from "node-stream-zip";
import * as yauzl from "yauzl";

// Helper สำหรับแปลง Windows path → URL file:// ที่ extractor ต้องการ
const toExtractorPath = (p: string) => (process.platform === "win32" ? `file:///${p.replace(/\\/g, "/")}` : p);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fileName = (body?.fileName as string) || "";
    // ใช้รหัสผ่านเริ่มต้น 1234 โดยอัตโนมัติ หากไม่ได้ส่งมา
    const password = String(body?.password ?? "bizpoten1234");
    const userProvidedPassword = body?.password !== undefined && String(body?.password).trim() !== "";
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

      // Place all extracted entries into subfolder named after the archive when outputDir provided
      const zipTargetDir = outputDir
        ? path.join(process.cwd(), "uploads", outputDir, baseName)
        : extractDir;
      await fs.mkdir(zipTargetDir, { recursive: true });
      const blob = await fs.readFile(filePath).then((b) => new Blob([b]));
      const reader = new zip.ZipReader(new zip.BlobReader(blob), { password });
      const entries = await reader.getEntries();
      const extractedEntries: string[] = [];
      const skippedEntries: string[] = [];
      let requiresPasswordFlag = false;

      for (const entry of entries) {
        if (entry.directory || !entry.getData) continue;
        // ถ้าระบุ targetEntry มา ให้แตกเฉพาะไฟล์นั้น
        if (targetEntry && entry.filename !== targetEntry) continue;

        try {
          const writer = new zip.BlobWriter();
          const data = await entry.getData(writer, {
            password,
            onprogress: async () => {},
          });

          const desiredPath = path.join(zipTargetDir, entry.filename);
          await fs.mkdir(path.dirname(desiredPath), { recursive: true });
          const targetPath = desiredPath; // overwrite existing to avoid duplicates
          const buffer = Buffer.from(await data.arrayBuffer());
          await fs.writeFile(targetPath, buffer);
          const savedRel = path.relative(zipTargetDir, targetPath).split(path.sep).join("/");
          extractedEntries.push(savedRel);
        } catch (e: any) {
          // If password mismatch or encrypted entry, skip and flag
          const msg = String(e?.message || "").toLowerCase();
          if (msg.includes("password") || msg.includes("encrypt") || msg.includes("decryp")) {
            requiresPasswordFlag = true;
          }
          skippedEntries.push(entry.filename);
          continue;
        }
      }

      await reader.close();

      // Build group info for UI (to support nested extraction buttons for ZIP)
      const group = {
        zipRelative: fileName,
        extractRelative: path.relative(path.join(process.cwd(), "uploads"), zipTargetDir),
        entries: extractedEntries,
      };

      // หากแตกได้บางส่วน ให้ตอบ 200 พร้อมรายการที่ข้าม และแจ้ง requiresPassword เป็น true เพื่อให้ผู้ใช้ลองรหัสใหม่ได้
      if (extractedEntries.length > 0) {
        return NextResponse.json({
          message: "ZIP extracted (บางไฟล์อาจถูกข้าม)",
          extractedFiles: extractedEntries,
          extractedGroups: [group],
          skipped: skippedEntries,
          requiresPassword: skippedEntries.length > 0,
        });
      }

      // แตกไม่ได้เลยและพบสัญญาณว่าต้องใช้รหัสผ่าน → ลอง fallback ด้วย node-stream-zip หากผู้ใช้ส่งรหัสมา
      if (requiresPasswordFlag) {
        if (userProvidedPassword) {
          try {
            const zipAsync = new (StreamZip as any).async({ file: filePath, password });
            if (!targetEntry) {
              await zipAsync.extract(null, zipTargetDir);
            } else {
              const targetPath = path.join(zipTargetDir, targetEntry);
              await fs.mkdir(path.dirname(targetPath), { recursive: true });
              await zipAsync.extract(targetEntry, targetPath);
            }
            await zipAsync.close();

            const finalEntries = extractedEntries.length > 0 ? extractedEntries : (targetEntry ? [targetEntry] : []);
            const finalGroup = {
              zipRelative: fileName,
              extractRelative: path.relative(path.join(process.cwd(), "uploads"), zipTargetDir),
              entries: finalEntries,
            };

            return NextResponse.json({
              message: "ZIP extracted",
              extractedFiles: finalEntries,
              extractedGroups: [finalGroup],
              skipped: [],
            });
          } catch (e: any) {
            const msg = String(e?.message || "").toLowerCase();
            const pwdHints = ["wrong password", "decryption failed", "encrypted", "invalid password", "auth failed"];
            if (pwdHints.some((h) => msg.includes(h))) {
              // แนบรายชื่อไฟล์ที่เข้ารหัส (ถ้าระบุได้) ให้ผู้ใช้เห็น
              const encryptedEntries = await new Promise<string[]>((resolve) => {
                const list: string[] = [];
                yauzl.open(filePath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
                  if (err || !zipfile) return resolve(list);
                  zipfile.readEntry();
                  zipfile.on("entry", (entry: any) => {
                    const isDir = String(entry.fileName || "").endsWith("/");
                    const isEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;
                    if (!isDir && isEncrypted) list.push(String(entry.fileName));
                    zipfile.readEntry();
                  });
                  zipfile.on("end", () => resolve(list));
                  zipfile.on("error", () => resolve(list));
                });
              });
              return NextResponse.json(
                { error: "รหัสผ่านไม่ถูกต้อง กรุณากรอกรหัสใหม่", requiresPassword: true, encryptedEntries },
                { status: 403 }
              );
            }
            return NextResponse.json({ error: "ไม่สามารถแตกไฟล์ ZIP ได้" }, { status: 500 });
          }
        }

        // ไม่มีรหัสผ่านจากผู้ใช้ → แจ้งให้กรอกรหัสผ่าน พร้อมรายการไฟล์ที่เข้ารหัสถ้าระบุได้
        const encryptedEntries = await new Promise<string[]>((resolve) => {
          const list: string[] = [];
          yauzl.open(filePath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
            if (err || !zipfile) return resolve(list);
            zipfile.readEntry();
            zipfile.on("entry", (entry: any) => {
              const isDir = String(entry.fileName || "").endsWith("/");
              const isEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;
              if (!isDir && isEncrypted) list.push(String(entry.fileName));
              zipfile.readEntry();
            });
            zipfile.on("end", () => resolve(list));
            zipfile.on("error", () => resolve(list));
          });
        });
        return NextResponse.json(
          { error: "ไฟล์ ZIP นี้เข้ารหัส ต้องใช้รหัสผ่าน", requiresPassword: true, encryptedEntries },
          { status: 403 }
        );
      }

      // กรณีอื่น ๆ ที่ไม่สามารถแตกได้
      return NextResponse.json({ error: "ไม่สามารถแตกไฟล์ ZIP ได้" }, { status: 500 });
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