import mysql from 'mysql2/promise';

declare global {
  // Preserve pool across hot reloads in development
  // eslint-disable-next-line no-var
  var mysqlPool: mysql.Pool | undefined;
}

function createPool() {
  return mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'cad_gl',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
    queueLimit: 0,
    // For legacy Thai dumps, ensure client uses the same charset
    charset: (process.env.MYSQL_CHARSET || 'tis620') as any,
  });
}

export function getPool(): mysql.Pool {
  if (!global.mysqlPool) {
    global.mysqlPool = createPool();
  }
  return global.mysqlPool;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const pool = getPool();
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function ping(): Promise<boolean> {
  const pool = getPool();
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export {};