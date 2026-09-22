import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// Default scrypt params — explicit, Node defaults
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

export const ADMIN_PASSWORD_HASH_PREFIX = 'scrypt';

export interface ParsedHash {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly saltHex: string;
  readonly hashHex: string;
}

/**
 * Format: scrypt:<N>:<r>:<p>:<saltHex>:<hashHex>
 * Example: scrypt:16384:8:1:a1b2c3d4e5f6...:deadbeef...
 */
export function formatHash(N: number, r: number, p: number, saltHex: string, hashHex: string): string {
  return `${ADMIN_PASSWORD_HASH_PREFIX}:${N}:${r}:${p}:${saltHex}:${hashHex}`;
}

export function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split(':');
  if (parts.length !== 6) return null;
  const [prefix, nStr, rStr, pStr, saltHex, hashHex] = parts;
  if (prefix !== ADMIN_PASSWORD_HASH_PREFIX) return null;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N <= 0 || r <= 0 || p <= 0) return null;
  // salt/hash must be hex, even length, non-empty
  if (!/^[0-9a-fA-F]+$/.test(saltHex) || !/^[0-9a-fA-F]+$/.test(hashHex)) return null;
  if (saltHex.length % 2 !== 0 || hashHex.length % 2 !== 0) return null;
  return { N, r, p, saltHex, hashHex };
}

export async function hashAdminPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password must be non-empty string');
  }
  const salt = randomBytes(SALT_BYTES);
  const saltHex = salt.toString('hex');
  const derived = (await (scryptAsync as unknown as (p: string | Buffer, s: string | Buffer, k: number, o: { N: number; r: number; p: number }) => Promise<Buffer>)(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })) as Buffer;
  const hashHex = derived.toString('hex');
  return formatHash(SCRYPT_N, SCRYPT_R, SCRYPT_P, saltHex, hashHex);
}

export async function verifyAdminPassword(plain: string, storedHash: string): Promise<boolean> {
  const parsed = parseHash(storedHash);
  if (!parsed) return false;
  const { N, r, p, saltHex, hashHex } = parsed;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  let derived: Buffer;
  try {
    derived = (await (scryptAsync as unknown as (p: string | Buffer, s: string | Buffer, k: number, o: { N: number; r: number; p: number }) => Promise<Buffer>)(plain, salt, expected.length, { N, r, p })) as Buffer;
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// Helper for CLI/script generation
export function getScryptParams(): { N: number; r: number; p: number; keylen: number; saltBytes: number } {
  return { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, keylen: SCRYPT_KEYLEN, saltBytes: SALT_BYTES };
}
