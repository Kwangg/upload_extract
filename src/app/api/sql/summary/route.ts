import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const relPath = searchParams.get('path');

    if (!relPath) {
      return NextResponse.json({ ok: false, error: 'missing path' }, { status: 400 });
    }

    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const absPath = path.resolve(uploadsRoot, relPath);
    if (!absPath.startsWith(uploadsRoot)) {
      return NextResponse.json({ ok: false, error: 'invalid path' }, { status: 400 });
    }

    const stat = await fs.promises.stat(absPath);
    if (!stat.isFile()) {
      return NextResponse.json({ ok: false, error: 'not a file' }, { status: 400 });
    }

    const insertCounts: Record<string, number> = {};
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

    const tables = Object.entries(insertCounts)
      .map(([name, inserts]) => ({ name, inserts }))
      .sort((a, b) => b.inserts - a.inserts);

    return NextResponse.json({ ok: true, path: relPath, totalInserts: total.inserts, tables });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}