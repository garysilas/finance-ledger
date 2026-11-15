import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Scrypt password hashing for the single owner. The stored string carries
// the parameters, salt, and derived key so verification needs no extra
// columns. Kept free of server-only and aliases so the password script
// can import it directly.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEM = 128 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (
    !Number.isSafeInteger(n) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    n < 2 ||
    (n & (n - 1)) !== 0 ||
    r < 1 ||
    p < 1 ||
    salt.length === 0 ||
    expected.length === 0
  ) {
    return false;
  }
  try {
    const key = scryptSync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
