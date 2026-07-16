import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// A fixed valid hash to compare against when an account is absent or social-only, so
// every verify path pays the same bcrypt cost (defeats timing-based email enumeration).
export const DUMMY_HASH = bcrypt.hashSync('canary-timing-dummy', SALT_ROUNDS);

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false; // social-only account: no local password set
  return bcrypt.compare(plain, hash);
}
