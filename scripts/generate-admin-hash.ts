#!/usr/bin/env tsx
/**
 * Generate ADMIN_PASSWORD_HASH for ATP Engine admin login.
 * Usage:
 *   pnpm --filter atp-engine exec tsx scripts/generate-admin-hash.ts <password>
 *   node --loader tsx scripts/generate-admin-hash.ts mySecretPassword
 * Outputs: scrypt:<N>:<r>:<p>:<saltHex>:<hashHex>
 * Copy the output to .env as ADMIN_PASSWORD_HASH
 */
import { hashAdminPassword } from '../src/infrastructure/auth/admin-password.js';

const password = process.argv[2];
if (!password) {
  console.error('Usage: tsx scripts/generate-admin-hash.ts <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.warn('Warning: password is short (<8 chars). Use a strong password.');
}
hashAdminPassword(password)
  .then((hash) => {
    console.log(hash);
  })
  .catch((err) => {
    console.error('Failed to generate hash:', err);
    process.exit(1);
  });
