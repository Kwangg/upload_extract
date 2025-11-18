import fs from "fs/promises";
import path from "path";
import * as zip from "@zip.js/zip.js";

// Usage: node scripts/inspect-archive.mjs <archivePath> [password] [--out <dir>]
// Treats .g23/.d23/.zip as ZIP archives, lists entries.
// By default, DOES NOT extract anywhere. If --out provided, extracts
// non-encrypted entries to the specified directory.

const log = (...args) => console.log(...args);

async function main() {
  const args = process.argv.slice(2);
  const archivePath = args[0];
  const passwordArg = args[1];
  const outFlagIndex = args.indexOf("--out");
  const outDirArg = outFlagIndex >= 0 ? args[outFlagIndex + 1] : undefined;
  if (!archivePath) {
    log("Usage: node scripts/inspect-archive.mjs <archivePath> [password] [--out <dir>]");
    process.exit(1);
  }

  const abs = path.isAbsolute(archivePath)
    ? archivePath
    : path.join(process.cwd(), archivePath);

  const baseName = path.parse(abs).name;
  const previewDir = outDirArg
    ? (path.isAbsolute(outDirArg) ? path.join(outDirArg, baseName) : path.join(process.cwd(), outDirArg, baseName))
    : undefined;
  if (previewDir) {
    await fs.mkdir(previewDir, { recursive: true });
  }

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
      const buf2 = Buffer.from(await data.arrayBuffer());
      if (previewDir) {
        const target = path.join(previewDir, entry.filename);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, buf2);
        extracted.push(target);
      } else {
        // Default: do not write; just record filename
        extracted.push(entry.filename);
      }
    } catch (e) {
      skipped.push(entry.filename);
    }
  }

  await reader.close();

  log("EXTRACTED COUNT:", extracted.length);
  if (extracted.length > 0) {
    log("EXTRACTED SAMPLE:", extracted[0]);
    if (previewDir) log("PREVIEW_FILE:", extracted[0]);
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