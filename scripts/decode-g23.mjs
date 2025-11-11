import fs from "fs/promises";
import path from "path";

// Usage: node scripts/decode-g23.mjs <filePath>
// Decodes a base64-encoded .g23/.d23 file to a preview .sql file.

async function main() {
  const filePathArg = process.argv[2];
  if (!filePathArg) {
    console.log("Usage: node scripts/decode-g23.mjs <filePath>");
    process.exit(1);
  }

  const abs = path.isAbsolute(filePathArg)
    ? filePathArg
    : path.join(process.cwd(), filePathArg);

  const baseName = path.parse(abs).name;
  const previewDir = path.join(process.cwd(), "uploads", "_preview");
  await fs.mkdir(previewDir, { recursive: true });
  const outPath = path.join(previewDir, `${baseName}.sql`);

  const text = await fs.readFile(abs, "utf8");
  try {
    const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64");
    await fs.writeFile(outPath, decoded);
    console.log("DECODED_TO:", outPath);
    console.log("PREVIEW_FILE:", outPath);
    console.log("HEAD:", decoded.subarray(0, 200).toString("utf8").replace(/\r|\n/g, " "));
  } catch (e) {
    console.error("Base64 decode failed:", e.message);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("decode-g23 error:", err);
  process.exit(1);
});