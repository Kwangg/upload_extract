import { NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pool = getPool();
    const [metaRows]: any = await pool.query('SELECT DATABASE() AS db, NOW() AS now');
    const [tablesRows]: any = await pool.query('SHOW TABLES');

    const sampleTables = Array.isArray(tablesRows) ? tablesRows.slice(0, 10) : [];

    return NextResponse.json({
      ok: true,
      meta: Array.isArray(metaRows) && metaRows.length ? metaRows[0] : null,
      tablesCount: Array.isArray(tablesRows) ? tablesRows.length : 0,
      sampleTables,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}