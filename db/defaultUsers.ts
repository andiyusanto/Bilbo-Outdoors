import { AppUser } from '../src/types';
import { hashPassword } from '../src/auth';

// Seeded once on first run (JSON mode) / when the users table is empty
// (Postgres mode) - carries over the previous single hardcoded admin login
// as the first real owner account. Salt/hash computed at module load since
// this only ever runs at seed time, not on every boot.
const { hash, salt } = hashPassword('bilbooutdoor2026');

export const defaultUsers: AppUser[] = [
  {
    id: 'user-owner-1',
    username: 'bilboadmin',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'owner',
    displayName: 'Admin Staff',
    createdAt: new Date().toISOString(),
  },
];
