import { pbkdf2Sync, randomBytes, createCipheriv } from "node:crypto";

export const PBKDF2_ITERATIONS = 210000;

// AES-256-GCM with PBKDF2-SHA256. The output is decryptable by the browser's
// WebCrypto implementation in vendor/app.js.
export function encryptPayload(payload, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iter: PBKDF2_ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    data: Buffer.concat([ciphertext, tag]).toString("base64"),
  };
}
