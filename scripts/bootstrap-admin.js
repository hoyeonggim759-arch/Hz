'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

async function main() {
  const username = process.env.ADMIN_LOGIN_ID;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !/^[a-zA-Z0-9_-]{4,32}$/.test(username)) throw new Error('ADMIN_LOGIN_ID must be 4-32 letters, numbers, _ or -.');
  if (!password || password.length < 14) throw new Error('ADMIN_PASSWORD must be at least 14 characters.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const existing = await pool.query('SELECT id,role FROM users WHERE username=$1', [username]);
    if (existing.rowCount) {
      if (existing.rows[0].role !== 'ADMIN') throw new Error('This login ID exists and is not an administrator. Choose a different ADMIN_LOGIN_ID.');
      console.log(`Administrator ${username} already exists. No password or role was changed.`);
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    const ip = '127.0.0.1';
    await pool.query(`INSERT INTO users (id,username,password_hash,role,status,registration_ip) VALUES ($1,$2,$3,'ADMIN','ACTIVE',$4)`, [crypto.randomUUID(), username, hash, ip]);
    console.log(`Administrator created: ${username}`);
    console.log('Remove ADMIN_PASSWORD and ADMIN_LOGIN_ID from the environment after this one-time setup.');
  } finally { await pool.end(); }
}
main().catch(err => { console.error('[ADMIN SETUP FAILED]', err.message); process.exit(1); });
