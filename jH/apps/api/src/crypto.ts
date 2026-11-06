import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
function dataKey(): Buffer {
  const raw = process.env.APP_DATA_KEY || "";
  if (/^[a-fA-F0-9]{64}$/.test(raw)) return Buffer.from(raw, "hex");

  // Render's generateValue creates a canonical base64-encoded 32-byte secret.
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32 && decoded.toString("base64") === raw) return decoded;

  throw new Error("APP_DATA_KEY must be a 32-byte key encoded as 64 hex characters or canonical base64");
}
export function encryptSensitive(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
export function decryptSensitive(value: string): string {
  if (!value.startsWith("enc:v1:")) return value; // allows controlled migration of legacy rows
  const parts = value.split(":");
  if (parts.length !== 5) throw new Error("Encrypted field format is invalid");
  const [, , ivText, tagText, encryptedText] = parts;
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}
