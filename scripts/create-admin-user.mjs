#!/usr/bin/env node
/**
 * One-off: set or reset the password on the seeded admin user
 * so the admin panel at /admin is accessible via normal login.
 *
 * The row (id=1000, email=admin@onpitch.com.au) is already seeded
 * by server/db.mjs:994 with an unusable placeholder hash
 * ($2b$08$unusable_hash_admin). This script replaces that hash
 * with a real bcrypt hash.
 *
 * Usage:
 *   # Against local pitch.db (no env vars):
 *   node scripts/create-admin-user.mjs [password]
 *
 *   # Against production Turso:
 *   npx vercel env pull .env.production.local
 *   set -a; source .env.production.local; set +a
 *   node scripts/create-admin-user.mjs [password]
 *   rm .env.production.local
 *
 * If no password is passed as arg 1 and ADMIN_TEMP_PASSWORD is
 * not set, a 24-char cryptographically random password is
 * generated and printed. Record it immediately — it is not
 * stored anywhere else.
 *
 * Safety rail: if the admin row already has a real bcrypt hash
 * (i.e. someone already set a password), the script aborts
 * rather than overwriting. Use the forgot-password flow to reset
 * a known admin password.
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const ADMIN_EMAIL      = 'admin@onpitch.com.au';
const ADMIN_FIRST_NAME = 'Admin';
const ADMIN_LAST_NAME  = 'Pitch';
const PLACEHOLDER_HASH = '$2b$08$unusable_hash_admin';
const BCRYPT_ROUNDS    = 10;

// Import db AFTER env is in scope — db.mjs reads TURSO_* on load.
const { prepare, stmts } = await import('../server/db.mjs');

const password =
  process.argv[2] ||
  process.env.ADMIN_TEMP_PASSWORD ||
  randomBytes(18).toString('base64url'); // 24 url-safe chars

console.log(`[create-admin-user] Target DB: ${
  process.env.TURSO_DATABASE_URL ? 'Turso (production)' : 'local SQLite'
}`);

const existing = await stmts.getUserByEmail.get(ADMIN_EMAIL);

if (existing && existing.password_hash !== PLACEHOLDER_HASH) {
  console.error(
    `[create-admin-user] Admin user already has a real password ` +
    `(hash prefix ${existing.password_hash.slice(0, 7)}…). ` +
    `Refusing to overwrite. Use /forgot-password to reset.`
  );
  process.exit(1);
}

const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

if (existing) {
  await prepare(
    `UPDATE users
       SET password_hash  = ?,
           first_name     = ?,
           last_name      = ?,
           email_verified = 1,
           status         = 'active'
     WHERE email = ?`
  ).run(hash, ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL);
  console.log('[create-admin-user] Updated seeded admin row.');
} else {
  await prepare(
    `INSERT INTO users
       (id,email,password_hash,first_name,last_name,role,status,email_verified)
     VALUES (1000,?,?,?,?,'admin','active',1)`
  ).run(ADMIN_EMAIL, hash, ADMIN_FIRST_NAME, ADMIN_LAST_NAME);
  console.log('[create-admin-user] Inserted new admin row (id=1000).');
}

const verify = await stmts.getUserByEmail.get(ADMIN_EMAIL);
const match  = await bcrypt.compare(password, verify.password_hash);

console.log('\n[create-admin-user] Verification:');
console.log(`  id:             ${verify.id}`);
console.log(`  email:          ${verify.email}`);
console.log(`  role:           ${verify.role}`);
console.log(`  status:         ${verify.status}`);
console.log(`  email_verified: ${verify.email_verified}`);
console.log(`  first_name:     ${verify.first_name}`);
console.log(`  last_name:      ${verify.last_name}`);
console.log(`  bcrypt compare: ${match ? 'PASS' : 'FAIL'}`);

if (!match) {
  console.error('[create-admin-user] bcrypt verification FAILED. Abort.');
  process.exit(1);
}

console.log('\n========================================');
console.log('  ADMIN LOGIN CREDENTIALS');
console.log('========================================');
console.log(`  Email:    ${ADMIN_EMAIL}`);
console.log(`  Password: ${password}`);
console.log('========================================');
console.log('Record this password now. It is not stored anywhere else.\n');

process.exit(0);
