import crypto from 'crypto';

// Node's built-in scrypt KDF - no new dependency (crypto is already used
// elsewhere in this codebase, e.g. db/postgres.ts, server.ts).
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidateHash = crypto.scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hash, 'hex');
  if (candidateHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(candidateHash, storedHash);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
