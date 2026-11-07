'use strict';
const crypto = require('node:crypto');

function decodeKey(name) {
  const raw = process.env[name] || '';
  if (/^[a-fA-F0-9]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32 && decoded.toString('base64') === raw) return decoded;
  throw new Error(`${name} must be a 32-byte key encoded as 64 hex characters or canonical base64`);
}

function encryptText(plainText, envName = 'APP_DATA_KEY') {
  const key = decodeKey(envName);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptText(payload, envName = 'APP_DATA_KEY') {
  const parts = String(payload).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('암호화 데이터 형식이 올바르지 않습니다.');
  const key = decodeKey(envName);
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function hmac(value, secretName) {
  const secret = process.env[secretName];
  if (!secret || secret.length < 32) throw new Error(`${secretName} must be at least 32 characters.`);
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

module.exports = { decodeKey, encryptText, decryptText, hmac };
