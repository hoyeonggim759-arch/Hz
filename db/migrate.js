'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 환경 변수가 없습니다.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('[DB] Schema is up to date.');
  } finally {
    await pool.end();
  }
}
main().catch((err) => { console.error('[DB] Migration failed:', err.message); process.exit(1); });
