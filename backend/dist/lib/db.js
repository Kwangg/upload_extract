import mysql from 'mysql2/promise';
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
        charset: (process.env.MYSQL_CHARSET || 'tis620'),
    });
}
export function getPool() {
    if (!global.mysqlPool) {
        global.mysqlPool = createPool();
    }
    return global.mysqlPool;
}
export async function query(sql, params) {
    const pool = getPool();
    const [rows] = await pool.query(sql, params);
    return rows;
}
export async function ping() {
    const pool = getPool();
    try {
        await pool.query('SELECT 1');
        return true;
    }
    catch {
        return false;
    }
}
