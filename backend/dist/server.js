import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import * as yauzl from 'yauzl';
import { createExtractorFromFile } from 'node-unrar-js';
import StreamZip from 'node-stream-zip';
import readline from 'readline';
import { ZipReader, BlobReader, BlobWriter } from '@zip.js/zip.js';
const app = express();
// Allow frontend dev origin; adjust in production
app.use(cors({ origin: ['http://localhost:3000'], credentials: true }));
app.use(express.json());
// __dirname for ESM (ts-node running in ES module mode)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });
// Helpers
const resolveSafe = (rel) => {
    const abs = path.resolve(uploadsRoot, rel);
    if (!abs.startsWith(uploadsRoot))
        throw new Error('invalid path');
    return abs;
};
const toRel = (p) => path.relative(uploadsRoot, p).split(path.sep).join('/');
const decodeName = (buf) => {
    let s = buf.toString('utf8');
    const hasReplacement = s.includes('\uFFFD');
    const thaiRange = /[\u0E00-\u0E7F]/;
    if (!hasReplacement)
        return s;
    s = iconv.decode(buf, 'windows-874');
    if (thaiRange.test(s))
        return s;
    s = iconv.decode(buf, 'tis-620');
    if (thaiRange.test(s))
        return s;
    s = iconv.decode(buf, 'cp437');
    return s;
};
const listZipEncryptedEntries = async (zipPath) => {
    const encrypted = [];
    await new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
            if (err || !zipfile)
                return reject(err);
            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                const nameBuf = entry.fileName;
                const decoded = decodeName(nameBuf);
                const isDir = decoded.endsWith('/');
                const isEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;
                if (!isDir && isEncrypted)
                    encrypted.push(decoded);
                zipfile.readEntry();
            });
            zipfile.on('end', () => resolve());
            zipfile.on('error', (e) => reject(e));
        });
    });
    return encrypted;
};
// ปรับชื่อ segment ของพาธให้ปลอดภัยบน Windows โดยยังคงตัวอักษรไทย/ยูนิโค้ด
const sanitizeSegment = (s) => s.replace(/[<>:\"\/\\|?*\x00-\x1F]/g, '_').trim() || '_';
const sanitizeEntryPath = (p) => p.split('/').map(sanitizeSegment).join(path.sep);
const uniquePathIfExists = async (absTarget) => {
    let candidate = absTarget;
    const dir = path.dirname(absTarget);
    const ext = path.extname(absTarget);
    const base = path.basename(absTarget, ext);
    let n = 1;
    // ตรวจสอบทีละรอบ: ถ้าไฟล์มีอยู่แล้วให้เติม (n) แล้วลองใหม่
    while (true) {
        try {
            await fsp.access(candidate); // exists
            candidate = path.join(dir, `${base} (${n})${ext}`);
            n++;
        }
        catch {
            // not exists -> ใช้ candidate นี้
            break;
        }
    }
    return candidate;
};
const listZipEntriesDecoded = async (zipPath) => {
    const names = [];
    await new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
            if (err || !zipfile)
                return reject(err);
            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                const nameBuf = entry.fileName;
                const decoded = decodeName(nameBuf);
                if (decoded.endsWith('/')) {
                    zipfile.readEntry();
                    return;
                }
                names.push(decoded);
                zipfile.readEntry();
            });
            zipfile.on('end', () => resolve());
            zipfile.on('error', (e) => reject(e));
        });
    });
    return names;
};
// --- Per-user scoping helpers ---
function getSessionUser(req) {
    const cookie = String(req.headers.cookie || '');
    const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}
function getUserRoot(req) {
    const user = getSessionUser(req) || 'public';
    const safeUser = user.replace(/[^a-zA-Z0-9._-]/g, '_');
    const userRoot = path.resolve(uploadsRoot, safeUser);
    fs.mkdirSync(userRoot, { recursive: true });
    return userRoot;
}
const resolveSafeForUser = (req, rel) => {
    const base = getUserRoot(req);
    const abs = path.resolve(base, rel);
    if (!abs.startsWith(base))
        throw new Error('invalid path');
    return abs;
};
const toRelForUser = (req, p) => {
    const base = getUserRoot(req);
    return path.relative(base, p).split(path.sep).join('/');
};
const storage = multer.diskStorage({
    destination: (req, _file, cb) => cb(null, getUserRoot(req)),
    filename: (_req, file, cb) => {
        // ถอดรหัสชื่อไฟล์จาก latin1 -> utf8 (แก้ปัญหาอักขระเพี้ยนจาก busboy/multer)
        const decodedOriginal = Buffer.from(file.originalname || 'file', 'latin1').toString('utf8');
        // ใช้ชื่อเดิมของไฟล์ (รองรับตัวอักษรไทย/ยูนิโค้ด) โดยลบตัวอักษรต้องห้ามใน Windows
        const raw = path.basename(decodedOriginal);
        const ext = path.extname(raw);
        const base = raw.slice(0, raw.length - ext.length);
        // แทนที่อักขระต้องห้าม: <>:"/\|?* และ control chars
        const sanitize = (s) => s.replace(/[<>:\"\/\\|?*\x00-\x1F]/g, '_').trim();
        let safeBase = sanitize(base) || 'file';
        const safeExt = sanitize(ext);
        // ป้องกันชื่อที่เป็นจุดหรือว่าง
        if (safeBase === '.' || safeBase === '')
            safeBase = 'file';
        let candidate = `${safeBase}${safeExt}`;
        let n = 1;
        // ถ้าชื่อซ้ำ ให้เติม (1), (2), ... ก่อนนามสกุล
        // ตรวจสอบชื่อซ้ำในโฟลเดอร์ของผู้ใช้
        const userRoot = getUserRoot(_req);
        while (fs.existsSync(path.join(userRoot, candidate))) {
            candidate = `${safeBase} (${n})${safeExt}`;
            n++;
        }
        cb(null, candidate);
    }
});
const upload = multer({ storage });
// Upload: save file and detect encrypted zip entries
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'ไม่พบไฟล์ในคำขอ' });
        }
        const name = req.file.filename;
        const ext = path.extname(name).toLowerCase();
        const allowed = ['.zip', '.rar', '.d23', '.g23'];
        if (!allowed.includes(ext)) {
            return res.status(415).json({ error: 'ชนิดไฟล์ไม่ถูกต้อง (รองรับ .zip, .rar, .d23 และ .g23)' });
        }
        const filePath = req.file.path;
        const rel = toRelForUser(req, filePath);
        if (ext === '.zip') {
            const encryptedEntries = await listZipEncryptedEntries(filePath).catch(() => []);
            if (encryptedEntries.length > 0) {
                return res.json({ ok: true, fileName: rel, requiresPassword: true, type: 'zip', encryptedEntries, extractedFiles: [], extractedGroups: [] });
            }
            // Not extracting on upload; return basic info
            const topEntries = await listZipEntriesDecoded(filePath).catch(() => []);
            return res.json({ ok: true, fileName: rel, requiresPassword: false, type: 'zip', encryptedEntries: [], extractedFiles: [], extractedGroups: [], entries: topEntries });
        }
        // For other types, just acknowledge upload
        return res.json({ ok: true, fileName: rel, requiresPassword: false, extractedFiles: [], extractedGroups: [] });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'เกิดข้อผิดพลาด' });
    }
});
// Extract archives (.zip/.rar/.g23/.d23)
app.post('/extract', async (req, res) => {
    try {
        const body = req.body || {};
        const fileName = String(body?.fileName || '');
        const password = String(body?.password ?? 'bizpoten1234');
        const userProvidedPassword = body?.password !== undefined && String(body?.password).trim() !== '';
        const targetEntry = body?.targetEntry || null;
        const outputDir = body?.outputDir || null;
        if (!fileName)
            return res.status(400).json({ error: 'Missing fileName' });
        const filePath = resolveSafeForUser(req, fileName);
        const baseName = path.parse(fileName).name;
        const extractRoot = outputDir ? resolveSafeForUser(req, outputDir) : resolveSafeForUser(req, fileName.replace(/\.[^/.]+$/, ''));
        await fsp.mkdir(extractRoot, { recursive: true });
        const ext = path.extname(fileName).toLowerCase();
        if (['.zip'].includes(ext)) {
            const zipTargetDir = outputDir ? path.join(resolveSafeForUser(req, outputDir), baseName) : extractRoot;
            await fsp.mkdir(zipTargetDir, { recursive: true });
            // Try zip.js first (ESM import)
            const blob = await fsp.readFile(filePath).then((b) => new Blob([b]));
            const reader = new ZipReader(new BlobReader(blob), { password });
            const entries = await reader.getEntries();
            const extractedEntries = [];
            const skippedEntries = [];
            let requiresPasswordFlag = false;
            for (const entry of entries) {
                if (entry.directory || !entry.getData)
                    continue;
                if (targetEntry && entry.filename !== targetEntry)
                    continue;
                try {
                    const writer = new BlobWriter();
                    const data = await entry.getData(writer, { password });
                    // สร้างพาธแบบปลอดภัยและไม่ทับไฟล์เดิม โดยรักษาโครงสร้างโฟลเดอร์
                    let safeRel = sanitizeEntryPath(entry.filename);
                    // ป้องกันโฟลเดอร์ซ้ำชื่อเดียวกับไฟล์ zip: ถ้า entry เริ่มด้วยชื่อ base ให้ตัด prefix ออก
                    const baseSegment = sanitizeSegment(baseName);
                    const sep = path.sep;
                    if (safeRel.startsWith(baseSegment + sep)) {
                        safeRel = safeRel.substring(baseSegment.length + 1);
                    }
                    const initialDesired = path.join(zipTargetDir, safeRel);
                    await fsp.mkdir(path.dirname(initialDesired), { recursive: true });
                    const desiredPath = await uniquePathIfExists(initialDesired);
                    await fsp.mkdir(path.dirname(desiredPath), { recursive: true });
                    const buffer = Buffer.from(await data.arrayBuffer());
                    await fsp.writeFile(desiredPath, buffer);
                    const savedRel = path.relative(zipTargetDir, desiredPath).split(path.sep).join('/');
                    extractedEntries.push(savedRel);
                }
                catch (e) {
                    const msg = String(e?.message || '').toLowerCase();
                    if (msg.includes('password') || msg.includes('encrypt') || msg.includes('decryp')) {
                        requiresPasswordFlag = true;
                    }
                    skippedEntries.push(entry.filename);
                    continue;
                }
            }
            await reader.close();
            const group = { zipRelative: fileName, extractRelative: toRelForUser(req, zipTargetDir), entries: extractedEntries };
            if (extractedEntries.length > 0) {
                return res.json({ message: 'ZIP extracted (บางไฟล์อาจถูกข้าม)', extractedFiles: extractedEntries, extractedGroups: [group], skipped: skippedEntries, requiresPassword: skippedEntries.length > 0 });
            }
            if (requiresPasswordFlag) {
                if (userProvidedPassword) {
                    try {
                        const zipAsync = new StreamZip.async({ file: filePath, password });
                        if (!targetEntry) {
                            await zipAsync.extract(null, zipTargetDir);
                        }
                        else {
                            const targetPath = path.join(zipTargetDir, targetEntry);
                            await fsp.mkdir(path.dirname(targetPath), { recursive: true });
                            await zipAsync.extract(targetEntry, targetPath);
                        }
                        await zipAsync.close();
                        const finalEntries = extractedEntries.length > 0 ? extractedEntries : (targetEntry ? [targetEntry] : []);
                        const finalGroup = { zipRelative: fileName, extractRelative: toRelForUser(req, zipTargetDir), entries: finalEntries };
                        return res.json({ message: 'ZIP extracted', extractedFiles: finalEntries, extractedGroups: [finalGroup], skipped: [] });
                    }
                    catch (e) {
                        const msg = String(e?.message || '').toLowerCase();
                        const pwdHints = ['wrong password', 'decryption failed', 'encrypted', 'invalid password', 'auth failed'];
                        if (pwdHints.some((h) => msg.includes(h))) {
                            const encryptedEntries = await new Promise((resolve) => {
                                const list = [];
                                yauzl.open(filePath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
                                    if (err || !zipfile)
                                        return resolve(list);
                                    zipfile.readEntry();
                                    zipfile.on('entry', (entry) => {
                                        const isDir = String(entry.fileName || '').endsWith('/');
                                        const isEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;
                                        if (!isDir && isEncrypted)
                                            list.push(String(entry.fileName));
                                        zipfile.readEntry();
                                    });
                                    zipfile.on('end', () => resolve(list));
                                    zipfile.on('error', () => resolve(list));
                                });
                            });
                            return res.status(403).json({ error: 'รหัสผ่านไม่ถูกต้อง กรุณากรอกรหัสใหม่', requiresPassword: true, encryptedEntries });
                        }
                        return res.status(500).json({ error: 'ไม่สามารถแตกไฟล์ ZIP ได้' });
                    }
                }
                const encryptedEntries = await new Promise((resolve) => {
                    const list = [];
                    yauzl.open(filePath, { lazyEntries: true, decodeStrings: false }, (err, zipfile) => {
                        if (err || !zipfile)
                            return resolve(list);
                        zipfile.readEntry();
                        zipfile.on('entry', (entry) => {
                            const isDir = String(entry.fileName || '').endsWith('/');
                            const isEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;
                            if (!isDir && isEncrypted)
                                list.push(String(entry.fileName));
                            zipfile.readEntry();
                        });
                        zipfile.on('end', () => resolve(list));
                        zipfile.on('error', () => resolve(list));
                    });
                });
                return res.status(403).json({ error: 'ไฟล์ ZIP นี้เข้ารหัส ต้องใช้รหัสผ่าน', requiresPassword: true, encryptedEntries });
            }
            return res.status(500).json({ error: 'ไม่สามารถแตกไฟล์ ZIP ได้' });
        }
        if (ext === '.g23' || ext === '.d23') {
            return res.status(415).json({ error: 'ไม่รองรับการแตกไฟล์สำหรับ .g23/.d23', requiresPassword: false });
        }
        if (ext === '.rar') {
            const rarTargetDir = outputDir ? path.join(resolveSafeForUser(req, outputDir), baseName) : extractRoot;
            await fsp.mkdir(rarTargetDir, { recursive: true });
            const group = { zipRelative: fileName, extractRelative: toRelForUser(req, rarTargetDir), entries: [] };
            try {
                const extractor = await createExtractorFromFile({ filepath: filePath, targetPath: process.platform === 'win32' ? `file:///${rarTargetDir.replace(/\\/g, '/')}` : rarTargetDir, password });
                const result = extractor.extract();
                const allEntries = [...result.files].map((f) => f.fileHeader?.name).filter((n) => typeof n === 'string');
                if (targetEntry) {
                    const wanted = allEntries.find((n) => n === targetEntry);
                    group.entries = wanted ? [wanted] : [];
                }
                else {
                    group.entries = allEntries;
                }
            }
            catch (e) {
                if (e.message?.includes('password')) {
                    return res.status(403).json({ error: 'รหัสผ่านไม่ถูกต้อง', requiresPassword: true });
                }
                return res.status(500).json({ error: 'แตกไฟล์ RAR ไม่สำเร็จ' });
            }
            return res.json({ message: 'RAR extracted', extractedFiles: group.entries, extractedGroups: [group] });
        }
        return res.status(400).json({ error: 'ชนิดไฟล์ไม่รองรับสำหรับการแตก' });
    }
    catch (err) {
        return res.status(500).json({ error: err?.message || 'เกิดข้อผิดพลาด' });
    }
});
// G23/D23 preview
app.post('/g23/preview', async (req, res) => {
    try {
        const fileName = String(req.body?.fileName || '');
        if (!fileName)
            return res.status(400).json({ ok: false, error: 'ไม่พบพาธไฟล์' });
        const abs = resolveSafeForUser(req, fileName);
        const text = await fsp.readFile(abs, 'utf8');
        let decoded;
        try {
            decoded = Buffer.from(text.replace(/\s+/g, ''), 'base64');
        }
        catch {
            return res.status(415).json({ ok: false, error: 'ไฟล์ไม่ใช่ base64 หรือเสียหาย' });
        }
        const head = decoded.subarray(0, Math.min(5000, decoded.length)).toString('utf8');
        return res.json({ ok: true, previewHead: head, outputRelative: null, size: decoded.length, persisted: false });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: 'ไม่สามารถถอดรหัสไฟล์ได้' });
    }
});
// Files: preview (dir listing or text head)
app.get('/files/preview', async (req, res) => {
    try {
        const relPath = String(req.query.path || '');
        const maxLines = Number(req.query.lines || 200);
        if (!relPath)
            return res.status(400).json({ ok: false, error: 'missing path' });
        const absPath = resolveSafeForUser(req, relPath);
        const stat = await fsp.stat(absPath);
        if (stat.isDirectory()) {
            const items = await fsp.readdir(absPath, { withFileTypes: true });
            const children = await Promise.all(items.map(async (d) => {
                const childAbs = path.resolve(absPath, d.name);
                const st = await fsp.stat(childAbs);
                return { name: d.name, type: d.isDirectory() ? 'dir' : 'file', mtime: st.mtime.toISOString(), size: d.isDirectory() ? undefined : st.size };
            }));
            // Hide .zip and .rar files from directory listings
            const filtered = children.filter((c) => {
                if (c.type !== 'file')
                    return true;
                const n = String(c.name || '').toLowerCase();
                return !(n.endsWith('.zip') || n.endsWith('.rar'));
            });
            return res.json({ ok: true, type: 'directory', path: relPath, children: filtered });
        }
        const buf = await fsp.readFile(absPath);
        const content = buf.toString('utf8');
        const lines = content.split(/\r?\n/).slice(0, maxLines);
        return res.json({ ok: true, type: 'file', path: relPath, size: stat.size, linesCount: lines.length, preview: lines });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
    }
});
// Files: zip
app.post('/files/zip', async (req, res) => {
    try {
        const body = req.body || {};
        const sourceDir = body.sourceDir;
        const items = body.items;
        const zipName = body.zipName;
        let filesToZip = [];
        let baseEntryPrefix = '';
        if (sourceDir) {
            const absDir = resolveSafeForUser(req, sourceDir);
            const stat = await fsp.stat(absDir).catch(() => null);
            if (!stat || !stat.isDirectory())
                return res.status(400).json({ ok: false, error: 'ต้องระบุโฟลเดอร์ที่มีอยู่จริง' });
            const baseName = path.basename(absDir);
            baseEntryPrefix = baseName;
            const walk = async (current, root) => {
                const entries = await fsp.readdir(current, { withFileTypes: true });
                for (const e of entries) {
                    const abs = path.join(current, e.name);
                    if (e.isDirectory())
                        await walk(abs, root);
                    else if (e.isFile()) {
                        const relInside = path.relative(root, abs).split(path.sep).join('/');
                        const entryName = `${baseEntryPrefix}/${relInside}`;
                        filesToZip.push({ abs, entryName });
                    }
                }
            };
            await walk(absDir, absDir);
        }
        else if (Array.isArray(items) && items.length > 0) {
            for (const rel of items) {
                const abs = resolveSafeForUser(req, rel);
                const stat = await fsp.stat(abs).catch(() => null);
                if (!stat)
                    continue;
                if (stat.isDirectory()) {
                    const baseName = path.basename(abs);
                    const walk = async (current, root) => {
                        const entries = await fsp.readdir(current, { withFileTypes: true });
                        for (const e of entries) {
                            const p = path.join(current, e.name);
                            if (e.isDirectory())
                                await walk(p, root);
                            else if (e.isFile()) {
                                const relInside = path.relative(root, p).split(path.sep).join('/');
                                filesToZip.push({ abs: p, entryName: `${baseName}/${relInside}` });
                            }
                        }
                    };
                    await walk(abs, abs);
                }
                else if (stat.isFile()) {
                    filesToZip.push({ abs, entryName: path.basename(abs) });
                }
            }
        }
        else {
            return res.status(400).json({ ok: false, error: 'ต้องระบุ sourceDir หรือ items' });
        }
        if (filesToZip.length === 0)
            return res.status(400).json({ ok: false, error: 'ไม่พบไฟล์ในรายการที่จะ zip' });
        const zipArchive = new AdmZip();
        const entryNames = [];
        for (const f of filesToZip) {
            const buf = await fsp.readFile(f.abs);
            zipArchive.addFile(f.entryName, buf);
            entryNames.push(f.entryName);
        }
        const zipBaseName = zipName ? zipName.replace(/[^a-zA-Z0-9._-]/g, '_') : `${Date.now()}-archive.zip`;
        const zipAbs = path.join(getUserRoot(req), zipBaseName);
        zipArchive.writeZip(zipAbs);
        const stat = await fsp.stat(zipAbs);
        const zipRelative = toRelForUser(req, zipAbs);
        return res.json({ ok: true, zipRelative, entriesCount: filesToZip.length, size: stat.size, entries: entryNames });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'เกิดข้อผิดพลาด' });
    }
});
// Files: download
app.get('/files/download', async (req, res) => {
    try {
        const relPath = String(req.query.path || '');
        if (!relPath)
            return res.status(400).send('missing path');
        const abs = resolveSafeForUser(req, relPath);
        const filename = path.basename(abs);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(abs).pipe(res);
    }
    catch (err) {
        return res.status(500).send(err?.message || 'error');
    }
});
// Files: delete
const rimraf = async (p) => {
    try {
        const stat = await fsp.stat(p);
        if (stat.isDirectory()) {
            const entries = await fsp.readdir(p);
            for (const e of entries)
                await rimraf(path.join(p, e));
            await fsp.rmdir(p);
        }
        else {
            await fsp.unlink(p);
        }
    }
    catch { }
};
app.delete('/files/delete', async (req, res) => {
    try {
        const relPath = String(req.body?.path || '');
        if (!relPath)
            return res.status(400).json({ ok: false, error: 'missing path' });
        const abs = resolveSafeForUser(req, relPath);
        await rimraf(abs);
        return res.json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'error' });
    }
});
// SQL summary
app.get('/sql/summary', async (req, res) => {
    try {
        const relPath = String(req.query.path || '');
        if (!relPath)
            return res.status(400).json({ ok: false, error: 'missing path' });
        const absPath = resolveSafeForUser(req, relPath);
        const stat = await fsp.stat(absPath);
        if (!stat.isFile())
            return res.status(400).json({ ok: false, error: 'not a file' });
        const insertCounts = {};
        const total = { inserts: 0 };
        const stream = fs.createReadStream(absPath);
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        const re = /INSERT\s+INTO\s+[`"]?([A-Za-z0-9_]+)[`"]?/i;
        for await (const line of rl) {
            const m = re.exec(line);
            if (m && m[1]) {
                const table = m[1];
                insertCounts[table] = (insertCounts[table] || 0) + 1;
                total.inserts++;
            }
        }
        const tables = Object.entries(insertCounts).map(([name, inserts]) => ({ name, inserts })).sort((a, b) => b.inserts - a.inserts);
        return res.json({ ok: true, path: relPath, totalInserts: total.inserts, tables });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
    }
});
// Upload batch (multiple files)
const multiUpload = multer({ storage });
app.post('/upload-batch', multiUpload.array('files', 20), async (req, res) => {
    try {
        const files = req.files || [];
        const uploaded = files.map((f) => ({ name: f.filename, path: toRelForUser(req, f.path), size: f.size }));
        return res.json({ ok: true, uploadedCount: uploaded.length, uploadedFiles: uploaded });
    }
    catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'เกิดข้อผิดพลาด' });
    }
});
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend listening on http://localhost:${port}`);
});
