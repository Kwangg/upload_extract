import fs from "fs/promises";
import path from "path";
import * as zip from "@zip.js/zip.js";

// Usage: node scripts/inspect-archive.mjs <archivePath> [password]
// Treats .g23/.d23/.zip as ZIP archives, lists entries, and extracts
// non-encrypted entries to uploads/_preview/<basename>/ for quick viewing.

const log = (...args) => console.log(...args);

async function main() {
  const archivePath = process.argv[2];
  const passwordArg = process.argv[3];
  if (!archivePath) {
    log("Usage: node scripts/inspect-archive.mjs <archivePath> [password]");
    process.exit(1);
  }

  const abs = path.isAbsolute(archivePath)
    ? archivePath
    : path.join(process.cwd(), archivePath);

  const baseName = path.parse(abs).name;
  const previewDir = path.join(process.cwd(), "uploads", "_preview", baseName);
  await fs.mkdir(previewDir, { recursive: true });

  const buf = await fs.readFile(abs);
  // Print first 16 bytes to identify format signature
  const toHex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join(" ");
  log("HEADER:", toHex(buf.subarray(0, 16)));
  // Also print first 200 chars as text for clue
  const textPreview = Buffer.from(buf.subarray(0, Math.min(200, buf.length))).toString("utf8");
  log("TEXT PREVIEW:", textPreview.replace(/\r|\n/g, " ").slice(0, 200));
  const blob = new Blob([buf]);
  const reader = new zip.ZipReader(new zip.BlobReader(blob), { password: passwordArg });
  const entries = await reader.getEntries();

  log("ARCHIVE:", abs);
  log("ENTRIES:");
  for (const e of entries) {
    log("-", e.filename, e.directory ? "(dir)" : "");
  }

  const extracted = [];
  const skipped = [];
  for (const entry of entries) {
    if (entry.directory || !entry.getData) continue;
    try {
      const writer = new zip.BlobWriter();
      const data = await entry.getData(writer, { password: passwordArg });
      const target = path.join(previewDir, entry.filename);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const buf2 = Buffer.from(await data.arrayBuffer());
      await fs.writeFile(target, buf2);
      extracted.push(target);
    } catch (e) {
      skipped.push(entry.filename);
    }
  }

  await reader.close();

  log("EXTRACTED COUNT:", extracted.length);
  if (extracted.length > 0) {
    log("EXTRACTED SAMPLE:", extracted[0]);
    log("PREVIEW_FILE:", extracted[0]);
  }
  if (skipped.length > 0) {
    log("SKIPPED (possibly encrypted or password mismatch):");
    for (const s of skipped) log("-", s);
  }
}

main().catch((err) => {
  console.error("inspect-archive error:", err);
  process.exit(1);
});