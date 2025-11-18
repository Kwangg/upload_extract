import fs from "fs/promises";
import path from "path";

// Usage: node scripts/decode-g23.mjs <filePath> [--out <outputPath>]
// Decodes a base64-encoded .g23/.d23 file.
// By default, does NOT write any file. Prints HEAD and size.
// If --out provided, writes decoded content to the given path.

async function main() {
  const args = process.argv.slice(2);
  const filePathArg = args[0];
  const outFlagIndex = args.indexOf("--out");
  const outArg = outFlagIndex >= 0 ? args[outFlagIndex + 1] : undefined;
  if (!filePathArg) {
    console.log("Usage: node scripts/decode-g23.mjs <filePath> [--out <outputPath>]");
    process.exit(1);
  }

  const abs = path.isAbsolute(filePathArg)
    ? filePathArg
    : path.join(process.cwd(), filePathArg);

  const baseName = path.parse(abs).name;
  const outPath = outArg
    ? (path.isAbsolute(outArg) ? outArg : path.join(process.cwd(), outArg))
    : undefined;

  const text = await fs.readFile(abs, "utf8");
  try {
    const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64");
    const head = decoded.subarray(0, 200).toString("utf8").replace(/\r|\n/g, " ");
    if (outPath) {
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, decoded);
      console.log("DECODED_TO:", outPath);
      console.log("PREVIEW_FILE:", outPath);
    }
    console.log("SIZE:", decoded.length);
    console.log("HEAD:", head);
  } catch (e) {
    console.error("Base64 decode failed:", e.message);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("decode-g23 error:", err);
  process.exit(1);
});