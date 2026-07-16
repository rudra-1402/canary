import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// Fixed hash to compare against when no real hash exists, so every verify path costs the
// same bcrypt time (defeats timing-based enumeration).
export const DUMMY_HASH = bcrypt.hashSync('canary-timing-dummy', SALT_ROUNDS);

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false; // social-only account: no local password set
  return bcrypt.compare(plain, hash);
}
