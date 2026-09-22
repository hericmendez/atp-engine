import { describe, it, expect } from 'vitest';
import { hashAdminPassword, verifyAdminPassword, parseHash } from '../src/infrastructure/auth/admin-password.js';

describe('Admin Password Hash — F-001/F-002', () => {
  it('hash generation produces scrypt format with explicit params', async () => {
    const h = await hashAdminPassword('test-format-password');
    expect(h.startsWith('scrypt:16384:8:1:')).toBe(true);
    const parsed = parseHash(h);
    expect(parsed).not.toBeNull();
    expect(parsed!.N).toBe(16384);
    expect(parsed!.r).toBe(8);
    expect(parsed!.p).toBe(1);
    expect(parsed!.saltHex.length).toBe(32); // 16 bytes hex
    expect(parsed!.hashHex.length).toBe(128); // 64 bytes hex
  });

  it('two hashes of same password have different salts', async () => {
    const h1 = await hashAdminPassword('same-password');
    const h2 = await hashAdminPassword('same-password');
    expect(h1).not.toBe(h2);
    const p1 = parseHash(h1)!;
    const p2 = parseHash(h2)!;
    expect(p1.saltHex).not.toBe(p2.saltHex);
  });

  it('both hashes verify correctly', async () => {
    const h1 = await hashAdminPassword('same-password');
    const h2 = await hashAdminPassword('same-password');
    expect(await verifyAdminPassword('same-password', h1)).toBe(true);
    expect(await verifyAdminPassword('same-password', h2)).toBe(true);
  });

  it('wrong password fails', async () => {
    const h = await hashAdminPassword('correct');
    expect(await verifyAdminPassword('wrong', h)).toBe(false);
  });

  it('invalid hash returns false', async () => {
    expect(await verifyAdminPassword('any', 'not-a-valid-hash')).toBe(false);
    expect(await verifyAdminPassword('any', 'scrypt:bad:format')).toBe(false);
    expect(await verifyAdminPassword('any', 'scrypt:16384:8:1:zzzz:not-hex')).toBe(false);
  });

  it('parseHash rejects fixed salt format', async () => {
    // Old format was just hex without prefix
    expect(parseHash('abcdef123456')).toBeNull();
    expect(parseHash('atp-admin-salt')).toBeNull();
  });

  it('hash does not contain plaintext', async () => {
    const pwd = 'super-secret-123';
    const h = await hashAdminPassword(pwd);
    expect(h).not.toContain(pwd);
  });
});
