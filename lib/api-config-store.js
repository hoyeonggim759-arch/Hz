'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { decodeKey } = require('./crypto');

const filePath = path.join(process.env.DATA_DIR || '/data', 'api-config.enc.json');

function encryptObject(value) {
  const key = decodeKey('API_CONFIG_KEY');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptObject(envelope) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') {
    throw new Error('API 설정 파일 버전이 올바르지 않습니다.');
  }
  const key = decodeKey('API_CONFIG_KEY');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8'));
}

async function readAll() {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return decryptObject(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAll(items) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temp = `${filePath}.${process.pid}.tmp`;
  const envelope = JSON.stringify(encryptObject(items), null, 2);
  await fs.writeFile(temp, envelope, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temp, filePath);
  await fs.chmod(filePath, 0o600).catch(() => {});
}

function publicSummary(item) {
  let hostname = '';
  try { hostname = new URL(item.url).host; } catch { hostname = '저장된 주소'; }
  return {
    id: item.id,
    name: item.name,
    method: item.method,
    hostname,
    enabled: Boolean(item.enabled),
    updatedAt: item.updatedAt,
  };
}

module.exports = { readAll, writeAll, publicSummary };
