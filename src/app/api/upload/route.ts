import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import * as yauzl from "yauzl";
import { createExtractorFromFile } from "node-unrar-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ไม่พบไฟล์ในคำขอ" }, { status: 400 });
    }

    const name = file.name || "file";
    const ext = path.extname(name).toLowerCase();
    const allowed = [".zip", ".rar", ".d23", ".g23"];
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: "ชนิดไฟล์ไม่ถูกต้อง (รองรับ .zip, .rar, .d23 และ .g23)" }, { status: 415 });
    }

    const MAX_SIZE = 200 * 1024 * 1024; // 200MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "ไฟล์มีขนาดใหญ่เกินกำหนด (สูงสุด 200MB)" }, { status: 413 });
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const finalName = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadsDir, finalName);
    await fs.writeFile(filePath, buffer);

    // Utilities for recursive extraction and listing
    const toRel = (p: string) => {
      const rel = path.relative(uploadsDir, p);
      return rel.split(path.sep).join("/");
    };

    const listFilesRecursively = async (dir: string): Promise<string[]> => {
      const out: string[] = [];
      const walk = async (current: string, base: string) => {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const e of entries) {
          const abs = path.join(current, e.name);
          if (e.isDirectory()) {
            await walk(abs, base);
          } else if (e.isFile()) {
            const rel = path.relative(base, abs).split(path.sep).join("/");
            out.push(rel);
          }
        }
      };
      await walk(dir, dir);
      return out;
    };

    const findZipFiles = async (dir: string): Promise<string[]> => {
      const zips: string[] = [];
      const walk = async (current: string) => {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const e of entries) {
          const abs = path.join(current, e.name);
          if (e.isDirectory()) {
            await walk(abs);
          } else if (e.isFile() && abs.toLowerCase().endsWith(".zip")) {
            zips.push(abs);
          }
        }
      };
      await walk(dir);
      return zips;
    };

    const decodeName = (buf: Buffer): string => {
      // Try UTF-8 first
      let s = buf.toString("utf8");
      const hasReplacement = s.includes("\uFFFD");
      const thaiRange = /[\u0E00-\u0E7F]/;
      if (!hasReplacement) return s;
      // Try Windows-874 (Thai)
      s = iconv.decode(buf, "windows-874");
      if (thaiRange.test(s)) return s;
      // Try TIS-620
      s = iconv.decode(buf, "tis-620");
      if (thaiRange.test(s)) return s;
      // Fallback CP437
      s = iconv.decode(buf, "cp437");
      return s;
    };

    const listZipEntriesDecoded = async (zipPath: string): Promise<string[]> => {
      const names: string[] = [];
      await new Promise<void>((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
          if (err || !zipfile) return reject(err);
          zipfile.readEntry();
          zipfile.on("entry", (entry: any) => {
            // entry.fileName is Buffer because decodeStrings:false
            const nameBuf: Buffer = entry.fileName as Buffer;
            const decoded = decodeName(nameBuf);
            // skip directories (yauzl marks them by trailing slash)
            if (decoded.endsWith("/")) {
              zipfile.readEntry();
              return;
            }
            names.push(decoded);
            zipfile.readEntry();
          });
          zipfile.on("end", () => resolve());
          zipfile.on("error", (e: any) => reject(e));
        });
      });
      return names;
    };

    const listZipEncryptedEntries = async (zipPath: string): Promise<string[]> => {
      const encrypted: string[] = [];
      await new Promise<void>((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
          if (err || !zipfile) return reject(err);
          zipfile.readEntry();
          zipfile.on("entry", (entry: any) => {
            const nameBuf: Buffer = entry.fileName as Buffer;
            const decoded = decodeName(nameBuf);
            const isDir = decoded.endsWith("/");
            const isEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;
            if (!isDir && isEncrypted) {
              encrypted.push(decoded);
            }
            zipfile.readEntry();
          });
          zipfile.on("end", () => resolve());
          zipfile.on("error", (e: any) => reject(e));
        });
      });
      return encrypted;
    };

    const listRarEntries = async (rarPath: string): Promise<string[]> => {
      try {
        const extractor = await createExtractorFromFile({ filepath: rarPath });
        const list = extractor.getFileList();
        const files = [...list.fileHeaders]
          .filter((f) => !f.flags.directory)
          .map((f) => f.name);
        return files;
      } catch (e) {
        console.error(`Failed to list rar entries for ${rarPath}:`, e);
        return [];
      }
    };

    type ExtractGroup = { zipRelative: string; extractRelative: string; entries: string[] };
    const extractedGroups: ExtractGroup[] = [];

    if (ext === ".zip") {
      try {
        // ตรวจสอบไฟล์ที่เข้ารหัสใน zip ก่อน
        const encryptedEntries = await listZipEncryptedEntries(filePath);
        if (encryptedEntries.length > 0) {
          return NextResponse.json({
            ok: true,
            fileName: finalName,
            requiresPassword: true,
            type: "zip",
            encryptedEntries,
            extractedFiles: [],
            extractedGroups: [],
          });
        }

        // Extract top-level zip using yauzl with decoded filenames (Thai-friendly)
        const rootExtractDir = path.join(uploadsDir, finalName.replace(/\.zip$/i, ""));
        await fs.mkdir(rootExtractDir, { recursive: true });

        await new Promise<void>((resolve, reject) => {
          yauzl.open(filePath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
            if (err || !zipfile) return reject(err);
            zipfile.readEntry();
            zipfile.on("entry", (entry: any) => {
              const nameBuf: Buffer = entry.fileName as Buffer;
              const decoded = decodeName(nameBuf);
              if (decoded.endsWith("/")) {
                // directory
                const dirPath = path.join(rootExtractDir, decoded);
                fs.mkdir(dirPath, { recursive: true })
                  .then(() => zipfile.readEntry())
                  .catch(reject);
                return;
              }
              zipfile.openReadStream(entry, (err2: any, readStream: any) => {
                if (err2 || !readStream) return reject(err2);
                const outPath = path.join(rootExtractDir, decoded);
                fs.mkdir(path.dirname(outPath), { recursive: true })
                  .then(async () => {
                    const chunks: Buffer[] = [];
                    readStream.on("data", (c: Buffer) => chunks.push(c));
                    readStream.on("end", async () => {
                      try {
                        await fs.writeFile(outPath, Buffer.concat(chunks));
                        zipfile.readEntry();
                      } catch (wErr) {
                        reject(wErr);
                      }
                    });
                    readStream.on("error", reject);
                  })
                  .catch(reject);
              });
            });
            zipfile.on("end", () => resolve());
            zipfile.on("error", reject);
          });
        });

        // Use decoded entry names for display (Thai-friendly)
        const topEntries = await listZipEntriesDecoded(filePath);
        extractedGroups.push({
          zipRelative: toRel(filePath),
          extractRelative: toRel(rootExtractDir),
          entries: topEntries,
        });

        // Recursively extract nested zip files (use decoded filenames)
        const processed = new Set<string>();
        const extractNested = async (startDir: string) => {
          const nestedZips = await findZipFiles(startDir);
          for (const nz of nestedZips) {
            if (processed.has(nz)) continue;
            processed.add(nz);
            const extractDir = path.join(path.dirname(nz), path.basename(nz).replace(/\.zip$/i, ""));
            await fs.mkdir(extractDir, { recursive: true });
            try {
              await new Promise<void>((resolve, reject) => {
                yauzl.open(nz, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
                  if (err || !zipfile) return reject(err);
                  zipfile.readEntry();
                  zipfile.on("entry", (entry: any) => {
                    const nameBuf: Buffer = entry.fileName as Buffer;
                    const decoded = decodeName(nameBuf);
                    if (decoded.endsWith("/")) {
                      const dirPath = path.join(extractDir, decoded);
                      fs.mkdir(dirPath, { recursive: true })
                        .then(() => zipfile.readEntry())
                        .catch(reject);
                      return;
                    }
                    zipfile.openReadStream(entry, (err2: any, readStream: any) => {
                      if (err2 || !readStream) return reject(err2);
                      const outPath = path.join(extractDir, decoded);
                      fs.mkdir(path.dirname(outPath), { recursive: true })
                        .then(async () => {
                          const chunks: Buffer[] = [];
                          readStream.on("data", (c: Buffer) => chunks.push(c));
                          readStream.on("end", async () => {
                            try {
                              await fs.writeFile(outPath, Buffer.concat(chunks));
                              zipfile.readEntry();
                            } catch (wErr) {
                              reject(wErr);
                            }
                          });
                          readStream.on("error", reject);
                        })
                        .catch(reject);
                    });
                  });
                  zipfile.on("end", () => resolve());
                  zipfile.on("error", reject);
                });
              });
            } catch (e) {
              console.error("Nested zip extraction error:", e);
              continue;
            }
            // Use decoded entry names for nested zip display
            const entries = await listZipEntriesDecoded(nz);
            extractedGroups.push({
              zipRelative: toRel(nz),
              extractRelative: toRel(extractDir),
              entries,
            });
            await extractNested(extractDir);
          }
        };

        await extractNested(rootExtractDir);
      } catch (zipError) {
        console.error("Zip extraction error:", zipError);
        // ไม่หยุดการอัพโหลด เพียงแค่แจ้งว่าแตกไฟล์ไม่ได้
      }
    } else if (ext === ".rar") {
      try {
        // ตรวจสอบว่ามีไฟล์ที่เข้ารหัสใน RAR หรือไม่
        const extractor = await createExtractorFromFile({ filepath: filePath });
        const list = extractor.getFileList();
        const encryptedEntries = [...list.fileHeaders]
          .filter((f: any) => !f.flags?.directory && (f.flags?.encrypted ?? false))
          .map((f: any) => f.name);

        if (encryptedEntries.length > 0) {
          return NextResponse.json({
            ok: true,
            fileName: finalName,
            requiresPassword: true,
            type: "rar",
            encryptedEntries,
            extractedFiles: [],
            extractedGroups: [],
          });
        }

        // หากไม่เข้ารหัส แสดงรายชื่อไฟล์ (ยังไม่แตกจริง) ให้ UI
        const rootExtractDir = path.join(uploadsDir, finalName.replace(/\.rar$/i, ""));
        await fs.mkdir(rootExtractDir, { recursive: true });
        const topEntries = [...list.fileHeaders]
          .filter((f: any) => !f.flags?.directory)
          .map((f: any) => f.name);
        extractedGroups.push({
          zipRelative: toRel(filePath),
          extractRelative: toRel(rootExtractDir),
          entries: topEntries,
        });

      } catch (rarError: any) {
        console.error("Rar processing error:", rarError);
        const errorMessage = (rarError?.message || "").toLowerCase();

        // Detect clearly unsupported/corrupted cases (do NOT prompt for password)
        const unsupportedHints = [
          "is not rar archive",
          "bad archive",
          "unsupported",
          "unknown format",
          "not supported",
          "invalid header",
          "rar5",
        ];
        if (unsupportedHints.some((h) => errorMessage.includes(h))) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "ไฟล์เสียหาย, ไม่ใช่ไฟล์ RAR, หรือเป็นเวอร์ชันที่ไม่รองรับ (รองรับเฉพาะ RAR4)",
              details: rarError?.message,
            },
            { status: 415 }
          );
        }

        // For other read failures, treat as password-required to improve UX
        return NextResponse.json({
          ok: true,
          fileName: finalName,
          requiresPassword: true,
          type: "rar",
          encryptedEntries: [],
          extractedFiles: [],
          extractedGroups: [],
        });
      }
    }

    // Flatten entries for simple UI fallback
    const extractedFiles = extractedGroups.flatMap((g) =>
      g.entries.map((entry) => `${g.extractRelative}/${entry}`)
    );

    return NextResponse.json({ ok: true, fileName: finalName, extractedFiles, extractedGroups });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดระหว่างอัพโหลดไฟล์" }, { status: 500 });
  }
}