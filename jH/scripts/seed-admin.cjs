const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
(async () => {
  const loginId = process.env.ADMIN_LOGIN_ID;
  const password = process.env.ADMIN_PASSWORD;
  if (!loginId || !/^[a-zA-Z0-9_-]{4,32}$/.test(loginId)) throw new Error('Set ADMIN_LOGIN_ID in .env (4-32 safe characters)');
  if (!password || password.length < 14) throw new Error('Set ADMIN_PASSWORD in .env (at least 14 characters)');
  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.upsert({ where: { loginId }, update: { role: 'ADMIN', passwordHash, status: 'ACTIVE', sessionVersion: { increment: 1 } }, create: { loginId, passwordHash, role: 'ADMIN' } });
    console.log(`Admin account ready: ${user.loginId}. Remove ADMIN_PASSWORD from your shell history and keep it secret.`);
  } finally { await prisma.$disconnect(); }
})().catch(e => { console.error(e.message); process.exit(1); });
