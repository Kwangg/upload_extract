import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const relPath = searchParams.get('path');
    const maxLines = Number(searchParams.get('lines') || 200);

    if (!relPath) {
      return NextResponse.json({ ok: false, error: 'missing path' }, { status: 400 });
    }

    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const absPath = path.resolve(uploadsRoot, relPath);

    if (!absPath.startsWith(uploadsRoot)) {
      return NextResponse.json({ ok: false, error: 'invalid path' }, { status: 400 });
    }

    const stat = await fs.promises.stat(absPath);
    if (stat.isDirectory()) {
      const items = await fs.promises.readdir(absPath, { withFileTypes: true });
      return NextResponse.json({
        ok: true,
        type: 'directory',
        path: relPath,
        children: items.map((d) => ({ name: d.name, type: d.isDirectory() ? 'dir' : 'file' })),
      });
    }

    // Read text file and return first N lines
    const buf = await fs.promises.readFile(absPath);
    // Assume UTF-8 for now; can add iconv-lite if needed
    const content = buf.toString('utf8');
    const lines = content.split(/\r?\n/).slice(0, maxLines);
    return NextResponse.json({
      ok: true,
      type: 'file',
      path: relPath,
      size: stat.size,
      linesCount: lines.length,
      preview: lines,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}