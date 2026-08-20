import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { Product, Order, OrderItem, OrderStatus, PenaltyEntry, PublicOrder, OrderListItem, DashboardStats, StoreSettings, AppUser, PublicUser, UserRole, JobPriceListItem, JobEntry, JobType } from './src/types';
import { defaultProducts } from './db/defaultProducts';
import { defaultSettings } from './db/defaultSettings';
import { defaultUsers } from './db/defaultUsers';
import { defaultJobPriceList } from './db/defaultJobPriceList';
import { initPostgresPool, seedPostgresIfEmpty, readDBPostgres, writeDBPostgres, findUserByUsernamePostgres, findUserBySessionTokenPostgres, findUserByIdPostgres, updateUserAuthFieldsPostgres, readProductsPostgres, readOrdersPostgres, readSettingsPostgres, readUsersPostgres, readJobPriceListPostgres, readJobEntriesPostgres, writeOrdersPostgres } from './db/postgres';
import { calculateRentalCost, calculateLegacyRentalCost, getAmountPaid, getRemainingBalance, getPenaltyTotal } from './src/pricing';
import { hashPassword, verifyPassword, generateSessionToken } from './src/auth';
import { formatDateLabel, getTodayDateString } from './src/lib/date';

declare global {
  namespace Express {
    interface Request {
      currentUser?: AppUser;
    }
  }
}

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function getJobPrice(item: JobPriceListItem, jobType: JobType): number | undefined {
  if (jobType === 'CLEANING') return item.cleaningPrice;
  if (jobType === 'LAUNDRY') return item.laundryPrice;
  if (jobType === 'INVENTARIS') return item.inventarisPrice;
  return undefined;
}

function toPublicUser(user: AppUser): PublicUser {
  const { passwordHash, passwordSalt, sessionToken, ...publicUser } = user;
  return publicUser;
}

// True if at least one OTHER active owner besides `excludingUserId` exists -
// used to block any action (delete, deactivate, role change) that would leave
// the system with zero active owner accounts and nobody able to undo it.
function hasOtherActiveOwner(db: DbShape, excludingUserId: string): boolean {
  return db.users.some((u: AppUser) => u.id !== excludingUserId && u.role === 'owner' && u.active !== false);
}

// ---------------- TELEGRAM BOOKING NOTIFICATIONS ----------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_BOOKING_CHAT_ID = process.env.TELEGRAM_BOOKING_CHAT_ID;
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOOKING_CHAT_ID) {
  console.log('Telegram notifications disabled — set TELEGRAM_BOT_TOKEN/TELEGRAM_BOOKING_CHAT_ID to enable.');
}

// Fire-and-forget from the /api/orders call site - never blocks or delays a
// booking. Always resolves (even the unconfigured no-op path) so `.catch()`
// at the call site never blows up on `undefined`.
async function sendTelegramBookingNotification(order: Order): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOOKING_CHAT_ID) return;
  const itemLines = order.items.map(it => `- ${it.productName} (x${it.quantity})`).join('\n');
  const text = `Booking baru masuk!\n\nNama: ${order.customerName}\nWhatsApp: ${order.customerWhatsApp}\nPeriode: ${formatDateLabel(order.startDate)} s/d ${formatDateLabel(order.endDate)} (${order.rentDuration} Hari)\n\nPeralatan:\n${itemLines}\n\nTotal: Rp ${order.totalPrice.toLocaleString('id-ID')}`;
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_BOOKING_CHAT_ID, text }),
    signal: AbortSignal.timeout(5000),
  });
  // fetch only rejects on network-level failure, never on HTTP error status -
  // throw explicitly so a bad token/chat-id reaches the call site's catch.
  if (!res.ok) throw new Error(`Telegram API responded ${res.status}: ${await res.text().catch(() => '')}`);
}

// ---------------- PRODUCT IMAGE UPLOAD (SUPABASE STORAGE) ----------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRODUCT_IMAGE_BUCKET = 'bilbo-product-images';
const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('Product image upload disabled — set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY to enable.');
}

// ---------------- WUZZPAY PAYMENT GATEWAY ----------------
const WUZZPAY_API_KEY = process.env.WUZZPAY_API_KEY;
const WUZZPAY_MERCHANT_ID = process.env.WUZZPAY_MERCHANT_ID;
// Sandbox is the safe default when WUZZPAY_ENV is unset - mirrors the
// "missing config = the safe path" convention already used for Telegram/image
// upload above. Production is only ever used when explicitly opted into.
const WUZZPAY_BASE_URL = process.env.WUZZPAY_ENV === 'production'
  ? 'https://api.wuzzpay.com/v1'
  : 'https://api-gateway-devel.wuzzpay.com/v1';
if (!WUZZPAY_API_KEY || !WUZZPAY_MERCHANT_ID) {
  console.log('WuzzPay payment gateway disabled — set WUZZPAY_API_KEY/WUZZPAY_MERCHANT_ID to enable.');
}

// TEMPORARY internal testing gate (owner-requested, 2026-08-19): most WuzzPay
// channels are still broken or unprovisioned on their side (only 6/8 VA banks
// work, QRIS/e-wallet fail entirely - see live sandbox testing notes), so the
// real gateway flow must stay invisible to actual customers while it's being
// validated in production. An order only gets the real flow if the customer
// typed this exact string as their full name - anyone else transparently
// falls back to the legacy manual QRIS-mock/WhatsApp flow, both here (the
// charge route below refuses to activate) and client-side (OrderConfirmationPage.tsx).
// Remove this gate once the channel provisioning issues are resolved and the
// feature is ready for a real rollout.
const PAYMENT_GATEWAY_TEST_TRIGGER_NAME = 'TESTING_PAYMENT_ONLINE';

// Thin authenticated fetch wrapper for the WuzzPay API. Throws explicitly on
// a non-2xx response (same shape as sendTelegramBookingNotification above) so
// asyncHandler-wrapped call sites surface the failure instead of silently
// swallowing it. Never logs the outgoing request (which carries the API key
// in its headers) - only the response body, which is WuzzPay's own data.
async function wuzzpayRequest(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${WUZZPAY_API_KEY}`,
    'X-Wuzzpay-Merchant-Id': WUZZPAY_MERCHANT_ID!,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`${WUZZPAY_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`WuzzPay ${method} ${path} responded ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// Slow, network-only half of settlement verification - deliberately has NO
// DB access and takes NO lock, so it's safe to call before/outside withDbLock.
// Split out 2026-08-20 after a production incident: the combined
// fetch+read+write used to run entirely inside withDbLock (a single,
// process-wide, strictly-serialized mutex - see its definition below), and
// since the client polls payment-status every 5s without waiting for the
// previous poll to finish, a slow WuzzPay response (this call can take up to
// WUZZPAY_REQUEST_TIMEOUT_MS) let overlapping polls pile up in that one
// global queue, starving every OTHER write route (and GET /api/orders, which
// also takes the lock) for as long as the backlog took to drain. Returns the
// raw status string (or undefined on any failure - caller decides what "no
// answer" means, this never throws).
async function fetchWuzzpaySettlementStatus(wuzzpayTransactionId: string, orderId: string): Promise<string | undefined> {
  try {
    const data = await wuzzpayRequest('GET', `/transactions/${wuzzpayTransactionId}`);
    return data?.data?.status;
  } catch (err) {
    console.error(`WuzzPay transaction status check failed for order ${orderId}:`, err);
    return undefined;
  }
}

// Fast, DB-only half - call this INSIDE withDbLock, only after
// fetchWuzzpaySettlementStatus has already resolved outside the lock. Mutates
// `order` in place and returns whether anything actually changed, so the
// caller can skip a pointless writeDB() (a full 6-table transactional sync,
// per writeDBPostgres - not cheap) when a poll comes back with nothing new,
// which is the common case (most polls just re-confirm "still pending").
// Deliberately allows the transition from either Pending OR Expired (not just
// Pending) - see expireStaleOrders above for why a late-arriving confirmed
// settlement must still recover an order that auto-expired while a real
// payment was still in flight.
function applyWuzzpaySettlementStatus(order: Order, status: string | undefined): boolean {
  if (order.status === 'Approved/Paid' || order.status === 'Item Picked Up' || order.status === 'Item Returned/Completed') return false;
  let changed = false;
  if (typeof status === 'string' && status !== order.wuzzpayLastStatus) {
    order.wuzzpayLastStatus = status;
    changed = true;
  }
  // Exact "paid" status string isn't documented (only "pending" appears in
  // WuzzPay's own example response) - accept the plausible variants until
  // confirmed against a real sandbox response (see the payment gateway plan's
  // Stage 2).
  const settled = status === 'settled' || status === 'paid' || status === 'success';
  if (settled) {
    order.status = 'Approved/Paid';
    order.amountPaid = order.totalPrice;
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: 'Approved/Paid',
      changedAt: new Date().toISOString(),
      changedByUserId: 'system',
      changedByName: 'WuzzPay (Otomatis)',
    });
    changed = true;
  }
  return changed;
}

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'server_db.json');

// Middleware
app.use(express.json({ limit: '10mb' }));

// ---------------- DUAL-MODE PERSISTENCE ----------------
// If DATABASE_URL is set at boot, all reads/writes go through Postgres exclusively.
// Otherwise, falls back to the local server_db.json file (unchanged from before).
// This is an exclusive boot-time branch, never both at once.

type DbShape = {
  products: Product[];
  orders: Order[];
  settings: StoreSettings;
  users: AppUser[];
  jobPriceList: JobPriceListItem[];
  jobEntries: JobEntry[];
};

let readDB: () => Promise<DbShape>;
let writeDB: (data: DbShape) => Promise<void>;
// Narrow, single-row peers of readDB/writeDB for the session-token/password
// auth path - see db/postgres.ts's comment above findUserByUsernamePostgres
// for why this exists instead of routing auth through the full-dataset pair.
let findUserByUsername: (username: string) => Promise<AppUser | null>;
let findUserBySessionToken: (token: string) => Promise<AppUser | null>;
let findUserById: (userId: string) => Promise<AppUser | null>;
let updateUserAuthFields: (userId: string, fields: { sessionToken: string | null; passwordHash?: string; passwordSalt?: string }) => Promise<void>;
// Narrow, single-table peers of readDB/writeDB for the read-only GET routes
// that only ever need one table - see db/postgres.ts's comment above
// readProductsPostgres for why (fetchAdminData now fires all of these
// concurrently, and readDB()'s full 7-query fan-out multiplies badly under
// that concurrency against the connection pool's limit).
let readProducts: () => Promise<Product[]>;
let readOrders: () => Promise<Order[]>;
let readJobPriceList: () => Promise<JobPriceListItem[]>;
let readJobEntries: () => Promise<JobEntry[]>;
let readSettings: () => Promise<StoreSettings>;
let readUsers: () => Promise<AppUser[]>;
let writeOrders: (orders: Order[]) => Promise<void>;

function seedJsonFileIfMissing(): void {
  if (!fs.existsSync(DB_FILE)) {
    const dbData: DbShape = {
      products: defaultProducts,
      orders: [] as Order[],
      settings: defaultSettings,
      users: defaultUsers,
      jobPriceList: defaultJobPriceList,
      jobEntries: [] as JobEntry[],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
    console.log('Database seeded successfully at', DB_FILE);
  }
}

async function initDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    initPostgresPool(databaseUrl);
    await seedPostgresIfEmpty();
    readDB = readDBPostgres;
    writeDB = writeDBPostgres;
    findUserByUsername = findUserByUsernamePostgres;
    findUserBySessionToken = findUserBySessionTokenPostgres;
    findUserById = findUserByIdPostgres;
    updateUserAuthFields = updateUserAuthFieldsPostgres;
    readProducts = readProductsPostgres;
    readOrders = readOrdersPostgres;
    readJobPriceList = readJobPriceListPostgres;
    readJobEntries = readJobEntriesPostgres;
    readSettings = readSettingsPostgres;
    readUsers = readUsersPostgres;
    writeOrders = writeOrdersPostgres;
    console.log('Persistence: Postgres (DATABASE_URL detected).');
  } else {
    seedJsonFileIfMissing();
    readDB = async () => {
      try {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        // Old server_db.json files predate later features - never crash on a
        // missing key, just fall back to defaults until the next write persists them.
        if (!parsed.settings) parsed.settings = defaultSettings;
        if (!parsed.settings.footer) parsed.settings.footer = defaultSettings.footer;
        if (!parsed.settings.runningText) parsed.settings.runningText = defaultSettings.runningText;
        if (!parsed.settings.pendingExpiryHours) parsed.settings.pendingExpiryHours = defaultSettings.pendingExpiryHours;
        if (!parsed.users) parsed.users = defaultUsers;
        if (!parsed.jobPriceList) parsed.jobPriceList = defaultJobPriceList;
        if (!parsed.jobEntries) parsed.jobEntries = [];
        return parsed;
      } catch (error) {
        console.error('Error reading database file, re-initializing...', error);
        seedJsonFileIfMissing();
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(data);
      }
    };
    writeDB = async (data: any) => {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    };
    // Thin wrappers over the same readDB()/writeDB() - JSON mode is already
    // synchronous fs I/O, so there's no latency problem to solve here (and
    // per this session's local_testing_must_use_json_file_db rule, this path
    // never touches real production data anyway).
    findUserByUsername = async (username: string) => {
      const db = await readDB();
      return db.users.find((u: AppUser) => u.username === username) || null;
    };
    findUserBySessionToken = async (token: string) => {
      const db = await readDB();
      return db.users.find((u: AppUser) => u.sessionToken === token) || null;
    };
    findUserById = async (userId: string) => {
      const db = await readDB();
      return db.users.find((u: AppUser) => u.id === userId) || null;
    };
    updateUserAuthFields = async (userId: string, fields: { sessionToken: string | null; passwordHash?: string; passwordSalt?: string }) => {
      const db = await readDB();
      const user = db.users.find((u: AppUser) => u.id === userId);
      if (user) {
        user.sessionToken = fields.sessionToken ?? undefined;
        if (fields.passwordHash !== undefined) user.passwordHash = fields.passwordHash;
        if (fields.passwordSalt !== undefined) user.passwordSalt = fields.passwordSalt;
      }
      await writeDB(db);
    };
    readProducts = async () => (await readDB()).products;
    readOrders = async () => (await readDB()).orders;
    readJobPriceList = async () => (await readDB()).jobPriceList;
    readJobEntries = async () => (await readDB()).jobEntries;
    readSettings = async () => (await readDB()).settings;
    readUsers = async () => (await readDB()).users;
    writeOrders = async (orders: Order[]) => {
      const db = await readDB();
      db.orders = orders;
      await writeDB(db);
    };
    console.log('Persistence: local JSON file (server_db.json).');
  }
}

// Serializes the read-modify-write critical section of write operations within
// this process. Needed once readDB/writeDB do real async I/O (Postgres mode) -
// unlike the old fully-synchronous fs calls, a promise-based critical section can
// be interleaved by a concurrent request, which could otherwise silently drop one
// of two concurrent writes (writeDB does a full dataset sync, not a targeted patch).
let dbMutexTail: Promise<any> = Promise.resolve();
function withDbLock<T>(criticalSection: () => Promise<T>): Promise<T> {
  const run = dbMutexTail.then(criticalSection, criticalSection);
  dbMutexTail = run.then(() => undefined, () => undefined);
  return run;
}

// Wraps an async Express handler so a rejected promise reaches Express's error
// handling instead of crashing the process or hanging the client (Express 4 does
// not catch async rejections on its own).
function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Auth Helper Middleware - resolves the bearer token to a real user (any
// logged-in role). Async because it needs a DB lookup, unlike the old
// constant-comparison check, so it's wrapped the same way asyncHandler routes
// forward rejections to Express's error handling.
function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  findUserBySessionToken(token).then((user) => {
    // A deactivated account's still-valid session token must stop working
    // immediately, not just block future logins - otherwise "deactivate"
    // wouldn't actually revoke access until the token happened to change.
    if (!user || user.active === false) {
      return res.status(401).json({ error: 'Unauthorized. Session invalid or expired.' });
    }
    req.currentUser = user;
    next();
  }).catch(next);
}

// Stacks after authenticateUser - only lets the 'owner' role through.
function requireOwner(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.currentUser?.role !== 'owner') {
    return res.status(403).json({ error: 'Forbidden. Owner access required.' });
  }
  next();
}

// ---------------- API ENDPOINTS ----------------

// Staff Login
app.post('/api/auth/login', asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { username, password } = req.body;
    const user = await findUserByUsername(username);
    // Deliberately the same generic error for "no such user", "wrong
    // password", and "deactivated account" - a deactivated account's status
    // shouldn't be discoverable to whoever is attempting the login.
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash) || user.active === false) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }
    const sessionToken = generateSessionToken();
    await updateUserAuthFields(user.id, { sessionToken });
    res.json({ token: sessionToken, role: user.role, displayName: user.displayName });
  });
}));

// Staff Logout - invalidates the session token server-side
app.post('/api/auth/logout', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    await updateUserAuthFields(req.currentUser!.id, { sessionToken: null });
    res.json({ message: 'Logged out.' });
  });
}));

// Self-service password change (any role)
app.post('/api/auth/change-password', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    }
    // Deliberately re-read inside the lock rather than trusting req.currentUser
    // (a snapshot taken by authenticateUser before this request even queued for
    // the lock) - withDbLock is a single global queue shared by every write
    // endpoint, so a slow unrelated write ahead of this one can leave enough of
    // a gap for another change-password call to land first. Verifying against
    // a stale pre-lock hash here would let a second, now-outdated "current
    // password" still pass and silently overwrite the first change.
    const user = await findUserById(req.currentUser!.id);
    if (!user || !verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Password saat ini salah.' });
    }
    const { hash, salt } = hashPassword(newPassword);
    // Rotate the session token too - an attacker holding a previously-leaked
    // token for this account (the scenario a password change is meant to
    // recover from) must not stay authenticated after it. Mirrors how logout
    // clears sessionToken; here we issue a fresh one so this same request's
    // caller doesn't get logged out by their own password change.
    const sessionToken = generateSessionToken();
    await updateUserAuthFields(user.id, { sessionToken, passwordHash: hash, passwordSalt: salt });
    res.json({ message: 'Password berhasil diubah.', token: sessionToken });
  });
}));

// Owner-only: list users (public-safe projection, never sends hashes/tokens)
app.get('/api/users', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  const users = await readUsers();
  res.json(users.map(toPublicUser));
}));

// Owner-only: create a new user (owner or karyawan)
app.post('/api/users', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { username, password, role, displayName } = req.body;
    if (!username || !password || !role || !displayName) {
      return res.status(400).json({ error: 'Missing required user fields.' });
    }
    const validRoles: UserRole[] = ['owner', 'karyawan'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }
    const db = await readDB();
    if (db.users.some((u: AppUser) => u.username === username)) {
      return res.status(400).json({ error: 'Username sudah digunakan.' });
    }
    const { hash, salt } = hashPassword(password);
    const newUser: AppUser = {
      id: `user-${Date.now()}`,
      username,
      passwordHash: hash,
      passwordSalt: salt,
      role,
      displayName,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    await writeDB(db);
    res.status(201).json(toPublicUser(newUser));
  });
}));

// Owner-only: edit name/username/role, or toggle active - never password
// (that's exclusively self-service via /api/auth/change-password). Partial
// update: only the fields present in the body are changed.
app.put('/api/users/:id', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { displayName, username, role, active } = req.body;
    const db = await readDB();
    const idx = db.users.findIndex((u: AppUser) => u.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const existing = db.users[idx];

    if (role !== undefined) {
      const validRoles: UserRole[] = ['owner', 'karyawan'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role.' });
      }
    }
    // Every downstream check (session-clearing below, authenticateUser's own
    // active gate) uses a strict `=== false` comparison - a non-boolean truthy
    // value (e.g. a stray string) would silently persist without ever
    // tripping those checks, making a deactivation attempt quietly no-op.
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Invalid active value.' });
    }
    if (username !== undefined && db.users.some((u: AppUser) => u.id !== id && u.username === username)) {
      return res.status(400).json({ error: 'Username sudah digunakan.' });
    }

    const isSelf = req.currentUser!.id === id;
    const wasActiveOwner = existing.role === 'owner' && existing.active !== false;
    const losingOwnerStatus = wasActiveOwner && (
      (role !== undefined && role !== 'owner') ||
      (active !== undefined && active === false)
    );
    if (losingOwnerStatus) {
      if (isSelf && active === false) {
        return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun Anda sendiri.' });
      }
      if (!hasOtherActiveOwner(db, id)) {
        return res.status(400).json({ error: 'Tidak bisa menonaktifkan atau mengubah role owner terakhir yang masih aktif.' });
      }
    }

    db.users[idx] = {
      ...existing,
      displayName: displayName !== undefined ? displayName : existing.displayName,
      username: username !== undefined ? username : existing.username,
      role: role !== undefined ? role : existing.role,
      active: active !== undefined ? active : existing.active,
      // Deactivating revokes any existing session immediately, same as
      // logout/change-password - belt-and-suspenders alongside authenticateUser's
      // own active check, which already rejects a deactivated user's token.
      sessionToken: active === false ? undefined : existing.sessionToken,
    };
    await writeDB(db);
    res.json(toPublicUser(db.users[idx]));
  });
}));

// Owner-only: permanently remove a user account.
app.delete('/api/users/:id', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    if (req.currentUser!.id === id) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun Anda sendiri.' });
    }
    const db = await readDB();
    const target = db.users.find((u: AppUser) => u.id === id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (target.role === 'owner' && target.active !== false && !hasOtherActiveOwner(db, id)) {
      return res.status(400).json({ error: 'Tidak bisa menghapus owner terakhir yang masih aktif.' });
    }
    db.users = db.users.filter((u: AppUser) => u.id !== id);
    await writeDB(db);
    res.json({ message: 'User deleted successfully.' });
  });
}));

// Get Products (available to both clients and admins)
app.get('/api/products', asyncHandler(async (req, res) => {
  const products = await readProducts();
  res.json(products);
}));

// Admin CRUD: Create Product
app.post('/api/products', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { name, category, rates, readinessHours, stock, description, image, varian, size, color } = req.body;
    if (!name || !category || !rates || stock === undefined) {
      return res.status(400).json({ error: 'Missing required product fields.' });
    }

    const db = await readDB();
    const newProduct: Product = {
      id: `product-${Date.now()}`,
      name,
      category,
      rates: {
        day1Price: Number(rates.day1Price),
        day2Price: Number(rates.day2Price),
        day3Price: Number(rates.day3Price),
        day4Price: Number(rates.day4Price),
        day5Price: Number(rates.day5Price),
        extraDayRate: Number(rates.extraDayRate),
      },
      readinessHours: readinessHours !== undefined ? Number(readinessHours) : 0,
      stock: Number(stock),
      description: description || '',
      image: image || '',
      varian: varian || '',
      size: size || '',
      color: color || ''
    };

    db.products.push(newProduct);
    await writeDB(db);
    res.status(201).json(newProduct);
  });
}));

// Admin CRUD: Update Product
app.put('/api/products/:id', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { name, category, rates, readinessHours, stock, description, image, varian, size, color } = req.body;

    const db = await readDB();
    const productIndex = db.products.findIndex((p: Product) => p.id === id);
    if (productIndex === -1) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    db.products[productIndex] = {
      ...db.products[productIndex],
      name: name !== undefined ? name : db.products[productIndex].name,
      category: category !== undefined ? category : db.products[productIndex].category,
      rates: rates !== undefined ? {
        day1Price: Number(rates.day1Price),
        day2Price: Number(rates.day2Price),
        day3Price: Number(rates.day3Price),
        day4Price: Number(rates.day4Price),
        day5Price: Number(rates.day5Price),
        extraDayRate: Number(rates.extraDayRate),
      } : db.products[productIndex].rates,
      readinessHours: readinessHours !== undefined ? Number(readinessHours) : db.products[productIndex].readinessHours,
      stock: stock !== undefined ? Number(stock) : db.products[productIndex].stock,
      description: description !== undefined ? description : db.products[productIndex].description,
      image: image !== undefined ? image : db.products[productIndex].image,
      varian: varian !== undefined ? varian : db.products[productIndex].varian,
      size: size !== undefined ? size : db.products[productIndex].size,
      color: color !== undefined ? color : db.products[productIndex].color
    };

    await writeDB(db);
    res.json(db.products[productIndex]);
  });
}));

// Admin CRUD: Delete Product
app.delete('/api/products/:id', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const db = await readDB();
    const initialCount = db.products.length;
    db.products = db.products.filter((p: Product) => p.id !== id);

    if (db.products.length === initialCount) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await writeDB(db);
    res.json({ message: 'Product deleted successfully.' });
  });
}));

// Uploads a product photo to Supabase Storage and returns its public URL, for
// ProductFormModal's image field to auto-fill. Never touches readDB/writeDB -
// this is a pure pass-through to Storage, entirely outside the persistence seam.
app.post('/api/products/upload-image', authenticateUser, asyncHandler(async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(501).json({ error: 'Upload gambar belum dikonfigurasi. Gunakan URL manual.' });
  }

  // Client-side always requests WebP, but Safari's canvas can't encode WebP -
  // it silently substitutes PNG instead of throwing (per spec), so both are
  // accepted here rather than assuming every browser produced WebP.
  const { image } = req.body;
  const match = typeof image === 'string' && image.match(/^data:(image\/webp|image\/png);base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ error: 'Format gambar tidak valid.' });
  }
  const [, mimeType, base64Data] = match;
  const extension = mimeType === 'image/webp' ? 'webp' : 'png';

  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
    return res.status(413).json({ error: 'Ukuran gambar terlalu besar.' });
  }

  // Unique path per upload - sidesteps Storage's upsert semantics and the ~60s
  // Smart CDN cache-invalidation delay entirely, since every URL is brand new.
  const objectPath = `products/${crypto.randomUUID()}.${extension}`;
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${PRODUCT_IMAGE_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': mimeType,
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`Supabase Storage upload failed (${uploadRes.status}): ${await uploadRes.text().catch(() => '')}`);
  }

  res.status(201).json({ url: `${SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${objectPath}` });
}));

// Helper function to calculate overlapping stock usage for products
// Returns a map of productId -> maxAllocated quantity during the period
//
// Readiness time: a completed order still occupies its items' stock for
// `readinessHours` after the *actual* return (order.returnedAt), converted to
// whole blocked calendar days (Math.ceil) since dates elsewhere in this app have
// no time-of-day granularity - a short readiness window still blocks the entire
// next calendar day, not just part of it. A completed order with no returnedAt
// (placed before this feature existed) is excluded entirely, exactly as before -
// readiness is never applied retroactively. Active (not-yet-returned) orders are
// unaffected by readiness and block through their scheduled endDate only, same as
// before this feature.
function calculateAllocatedStock(orders: Order[], products: Product[], startDateStr: string, endDateStr: string, excludeOrderId?: string): Record<string, number> {
  const startReq = new Date(startDateStr);
  const endReq = new Date(endDateStr);

  const readinessDaysById = new Map(products.map(p => [p.id, Math.ceil((p.readinessHours || 0) / 24)]));

  const allocationMap: Record<string, number> = {};

  // Legacy completed orders (no returnedAt) are excluded entirely, same as before.
  // Expired orders never block stock either - by the time this runs, expireStaleOrders
  // has already persisted any stale Pending->Expired flip earlier in the same request.
  // excludeOrderId lets editing an order's own items/dates check availability
  // without that order's own current allocation counting against itself.
  const relevantOrders = orders.filter(o =>
    o.id !== excludeOrderId &&
    o.status !== 'Expired' &&
    (o.status !== 'Item Returned/Completed' || o.returnedAt)
  );

  // Let's iterate through each day of the requested range
  const tempDate = new Date(startReq);
  while (tempDate <= endReq) {
    const dayStr = tempDate.toISOString().split('T')[0];

    // For this specific day, sum up allocations for all relevant overlapping orders
    const dailyAllocation: Record<string, number> = {};

    relevantOrders.forEach(order => {
      const isCompleted = order.status === 'Item Returned/Completed';
      const orderStart = new Date(order.startDate);
      const currentDay = new Date(dayStr);

      order.items.forEach(item => {
        let effectiveStart: Date;
        let effectiveEnd: Date;
        if (isCompleted) {
          // Blocked range is anchored on the actual return date, not the original
          // orderStart - the historical rental days are moot once returned. Spans
          // exactly `readinessDays` calendar days starting on the return day itself.
          // When readinessDays is 0, effectiveEnd lands one day BEFORE effectiveStart,
          // making the range empty - i.e. no blocking at all, immediately available
          // even on the return day itself, matching the pre-readiness-feature default.
          effectiveStart = new Date(order.returnedAt!.split('T')[0]);
          effectiveEnd = new Date(order.returnedAt!.split('T')[0]);
          effectiveEnd.setDate(effectiveEnd.getDate() + (readinessDaysById.get(item.productId) || 0) - 1);
        } else {
          effectiveStart = orderStart;
          effectiveEnd = new Date(order.endDate);
        }

        if (currentDay >= effectiveStart && currentDay <= effectiveEnd) {
          dailyAllocation[item.productId] = (dailyAllocation[item.productId] || 0) + item.quantity;
        }
      });
    });

    // Update the maximum allocation found on any single day within the range
    Object.keys(dailyAllocation).forEach(pId => {
      allocationMap[pId] = Math.max(allocationMap[pId] || 0, dailyAllocation[pId]);
    });

    tempDate.setDate(tempDate.getDate() + 1);
  }

  return allocationMap;
}

// An order left Pending for more than settings.pendingExpiryHours (default 2,
// editable in Pengaturan -> Toleransi Keterlambatan) with no payment
// confirmation is treated as abandoned - it's flipped to Expired so it stops
// blocking stock and shows up distinctly in the admin order list. No
// cron/background worker exists in this app (single Express process, no
// scheduler infra); this mirrors the existing calculate-late lazy-computation
// pattern, but runs automatically at the top of every route that reads orders,
// rather than behind an explicit button click, so stock availability and the
// order list reflect expiry promptly. Each order flips at most once, so
// repeated calls are self-limiting. Staff can still manually approve payment
// on an Expired order afterwards (see PUT /api/orders/:id/status's
// validStatuses) - expiring never revokes stock, it just stops reserving it,
// and remains reversible.
// A Pending order with a live WuzzPay payment_instruction (see
// applyWuzzpaySettlementStatus) is never expired while that instruction's own
// expires_at is still in the future - don't kill an order while its real
// payment window is genuinely still open. Falls back to the pure
// createdAt-based rule for orders with no gateway charge yet, which covers
// legacy orders and the first few minutes of every order. Even if this guard
// is bypassed by a stale/missing expires_at, a late-arriving confirmed
// settlement still recovers an Expired order (applyWuzzpaySettlementStatus
// allows the Expired -> Approved/Paid transition too) - defense in depth, not
// a single point of failure.
function expireStaleOrders(orders: Order[], pendingExpiryHours: number): boolean {
  const now = Date.now();
  const expiryMs = (pendingExpiryHours ?? 2) * 60 * 60 * 1000;
  let changed = false;
  for (const order of orders) {
    const instructionExpiresAt = order.paymentInstruction?.expires_at;
    if (typeof instructionExpiresAt === 'string' && new Date(instructionExpiresAt).getTime() > now) {
      continue;
    }
    if (order.status === 'Pending' && now - new Date(order.createdAt).getTime() > expiryMs) {
      order.status = 'Expired';
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({
        status: 'Expired',
        changedAt: new Date().toISOString(),
        changedByUserId: 'system',
        changedByName: 'Sistem (Otomatis)',
      });
      changed = true;
    }
  }
  return changed;
}

// Check Availability (Available to clients and admins)
app.post('/api/check-availability', asyncHandler(async (req, res) => {
  const { startDate, endDate, items, excludeOrderId } = req.body; // items is optional array of { productId, quantity }; excludeOrderId lets an order being edited check availability without its own current allocation counting against itself
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing start date or end date.' });
  }

  await withDbLock(async () => {
    const db = await readDB();
    if (expireStaleOrders(db.orders, db.settings.pendingExpiryHours)) {
      await writeDB(db);
    }
    const allocatedMap = calculateAllocatedStock(db.orders, db.products, startDate, endDate, excludeOrderId);

    const availabilityDetails = db.products.map((prod: Product) => {
      const allocated = allocatedMap[prod.id] || 0;
      const remaining = Math.max(0, prod.stock - allocated);

      // If the request checked a specific quantity
      const requestedItem = items?.find((it: any) => it.productId === prod.id);
      const requestedQty = requestedItem ? Number(requestedItem.quantity) : 0;
      const isAvailable = remaining >= requestedQty;

      return {
        productId: prod.id,
        name: prod.name,
        category: prod.category,
        totalStock: prod.stock,
        allocated,
        remaining,
        requestedQty,
        isAvailable
      };
    });

    const overallAvailable = availabilityDetails.every((item: any) => item.requestedQty === 0 || item.isAvailable);

    res.json({
      available: overallAvailable,
      details: availabilityDetails
    });
  });
}));

// Submit Order (Clients)
app.post('/api/orders', asyncHandler(async (req, res) => {
  let createdOrder: Order | null = null;
  await withDbLock(async () => {
    const { customerName, customerWhatsApp, startDate, endDate, items, personalPhotoBase64 } = req.body;

    if (!customerName || !customerWhatsApp || !startDate || !endDate || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order fields.' });
    }

    const db = await readDB();
    if (expireStaleOrders(db.orders, db.settings.pendingExpiryHours)) {
      await writeDB(db);
    }

    // 1. Re-verify stock availability server-side to guarantee integrity
    const allocatedMap = calculateAllocatedStock(db.orders, db.products, startDate, endDate);

    for (const item of items) {
      const product = db.products.find((p: Product) => p.id === item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product with ID ${item.productId} not found.` });
      }
      const allocated = allocatedMap[product.id] || 0;
      const remaining = product.stock - allocated;
      if (item.quantity > remaining) {
        return res.status(400).json({
          error: `Maaf, stok item "${product.name}" tidak mencukupi untuk tanggal tersebut. Tersisa: ${remaining} unit, diminta: ${item.quantity} unit.`
        });
      }
    }

    // 2. Calculate Rent Duration
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    // Non-inclusive ("nights") day count: 16th -> 17th is 1 day, not 2. Floored
    // at 1 so a same-day pickup/return (startDate === endDate) still bills as a
    // minimum 1-day rental instead of 0.
    const rentDuration = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // 3. Calculate Item Costs and Total Price
    let totalPrice = 0;
    const orderItems = items.map((it: any) => {
      const prod = db.products.find((p: Product) => p.id === it.productId)!;

      const itemTotal = calculateRentalCost(prod.rates, rentDuration);
      const itemCost = itemTotal * it.quantity;
      totalPrice += itemCost;

      return {
        productId: prod.id,
        productName: prod.name,
        quantity: Number(it.quantity),
        ratesSnapshot: { ...prod.rates }
      };
    });

    // 4. Create Order Object
    const newOrder: Order = {
      id: `order-${Date.now()}`,
      confirmationToken: crypto.randomUUID(),
      customerName,
      customerWhatsApp,
      startDate,
      endDate,
      rentDuration,
      items: orderItems,
      totalPrice,
      personalPhotoBase64: personalPhotoBase64 || '',
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    db.orders.unshift(newOrder); // Add to beginning
    await writeDB(db);

    createdOrder = newOrder;
    res.status(201).json(newOrder);
  });
  if (createdOrder) {
    sendTelegramBookingNotification(createdOrder).catch(err => console.error('Telegram booking notification failed:', err));
  }
}));

// Get Order Confirmation (Public, by unguessable token - NOT by order.id)
app.get('/api/orders/confirm/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const db = await readDB();
  const order = db.orders.find((o: Order) => o.confirmationToken && o.confirmationToken === token);

  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const { personalPhotoBase64, statusHistory, penalties, wuzzpayTransactionId, wuzzpayLastStatus, ...safeOrder }: Order = order;
  const publicOrder: PublicOrder = safeOrder;
  res.json(publicOrder);
}));

// Admin: Get all orders - strips personalPhotoBase64 (see GET /api/orders/:id
// below for the single-order fetch that includes it) so this list payload
// doesn't grow with every order's photo forever.
app.get('/api/orders', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
    if (expireStaleOrders(orders, settings.pendingExpiryHours)) {
      await writeOrders(orders);
    }
    const orderList: OrderListItem[] = orders.map((o: Order) => {
      const { personalPhotoBase64, ...rest } = o;
      return rest;
    });
    res.json(orderList);
  });
}));

// Admin: Get a single order in full (including personalPhotoBase64) - used
// by OrderDetailPanel when opened, since the list above omits the photo.
app.get('/api/orders/:id', authenticateUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const orders = await readOrders();
  const order = orders.find((o: Order) => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  res.json(order);
}));

// Admin: edit a Pending order's items and/or rental dates - staff correcting
// a booking (add/remove/swap items, change quantities, reschedule) without
// cancelling and recreating it. Allowed up through Approved/Paid - once the
// item is physically handed over (Item Picked Up), items/dates are considered
// locked in. Sends the full replacement items array (not a delta), same shape
// as the client-side cart, so add/remove/swap/change-quantity are all covered
// by one save.
app.put('/api/orders/:id/edit', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { startDate, endDate, items } = req.body; // items: { productId: string; quantity: number }[]
    const db = await readDB();
    const orderIndex = db.orders.findIndex((o: Order) => o.id === id);
    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = db.orders[orderIndex];
    if (order.status !== 'Pending' && order.status !== 'Approved/Paid') {
      return res.status(400).json({ error: 'Pesanan hanya bisa diedit sebelum barang diambil (status Pending atau Approved/Paid).' });
    }
    if (!startDate || !endDate || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Tanggal dan minimal satu item wajib diisi.' });
    }

    // Same non-inclusive "nights" formula as order creation, floored at 1 day.
    const diffTime = Math.abs(new Date(endDate).getTime() - new Date(startDate).getTime());
    const rentDuration = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Stock check excluding this order's own current allocation, so
    // re-saving the same items/dates (or a smaller change) isn't rejected
    // for "conflicting" with itself.
    const allocatedMap = calculateAllocatedStock(db.orders, db.products, startDate, endDate, id);
    const newItems: OrderItem[] = [];
    let totalPrice = 0;
    for (const it of items) {
      const product = db.products.find((p: Product) => p.id === it.productId);
      if (!product) {
        return res.status(400).json({ error: 'Salah satu produk tidak ditemukan di katalog.' });
      }
      const qty = Number(it.quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Jumlah untuk ${product.name} tidak valid.` });
      }
      const remaining = product.stock - (allocatedMap[product.id] || 0);
      if (qty > remaining) {
        return res.status(400).json({ error: `Stok ${product.name} tidak cukup (tersisa ${remaining}).` });
      }
      totalPrice += calculateRentalCost(product.rates, rentDuration) * qty;
      newItems.push({ productId: product.id, productName: product.name, quantity: qty, ratesSnapshot: { ...product.rates } });
    }

    db.orders[orderIndex] = { ...order, startDate, endDate, rentDuration, items: newItems, totalPrice };
    db.orders[orderIndex].statusHistory = db.orders[orderIndex].statusHistory || [];
    db.orders[orderIndex].statusHistory.push({
      status: order.status,
      action: 'Item/Tanggal Diubah',
      changedAt: new Date().toISOString(),
      changedByUserId: req.currentUser!.id,
      changedByName: req.currentUser!.displayName,
    });
    await writeDB(db);
    res.json(db.orders[orderIndex]);
  });
}));

// Admin: Update order status
app.put('/api/orders/:id/status', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { status, pickupIdType, amountPaid } = req.body;

    const validStatuses: OrderStatus[] = ['Pending', 'Approved/Paid', 'Item Picked Up', 'Item Returned/Completed', 'Expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status.' });
    }

    const db = await readDB();
    const orderIndex = db.orders.findIndex((o: Order) => o.id === id);
    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const previousStatus = db.orders[orderIndex].status;
    db.orders[orderIndex].status = status;
    // Audit trail of who made this transition - skip no-op resends of the
    // same status so the history only records real changes.
    if (previousStatus !== status) {
      db.orders[orderIndex].statusHistory = db.orders[orderIndex].statusHistory || [];
      db.orders[orderIndex].statusHistory.push({
        status,
        changedAt: new Date().toISOString(),
        changedByUserId: req.currentUser!.id,
        changedByName: req.currentUser!.displayName,
      });
    }
    // Stamp the actual pickup time once, on the transition into Item Picked
    // Up - this is what calculate-late now anchors the late-fee deadline on
    // (pickedUpAt + rentDuration*24h), mirroring returnedAt's exact "set once"
    // pattern below. Kept separate from the pickupIdType capture just below,
    // which intentionally has no such guard (it can be resent/overwritten).
    if (status === 'Item Picked Up' && previousStatus !== 'Item Picked Up') {
      db.orders[orderIndex].pickedUpAt = new Date().toISOString();
    }
    // Record which physical ID card was left as collateral in person, on the
    // transition into Item Picked Up.
    if (status === 'Item Picked Up' && pickupIdType) {
      db.orders[orderIndex].pickupIdType = pickupIdType;
    }
    // First confirmation of payment - captures how much was actually collected
    // (a down payment or the full amount), defaulting to the full totalPrice
    // when the client sends nothing, so the common no-DP case is unchanged.
    // Late fee isn't known yet at this point, so the cap is just totalPrice.
    if (status === 'Approved/Paid' && previousStatus !== 'Approved/Paid') {
      const total = db.orders[orderIndex].totalPrice;
      if (amountPaid !== undefined) {
        const paid = Number(amountPaid);
        if (isNaN(paid) || paid < 0 || paid > total) {
          return res.status(400).json({ error: 'Jumlah pembayaran tidak valid.' });
        }
        db.orders[orderIndex].amountPaid = paid;
      } else {
        db.orders[orderIndex].amountPaid = total;
      }
    }
    // Stamp the actual return time once, on the transition into Completed - this
    // is what the readiness-time stock calculation anchors on (calculateAllocatedStock).
    // Also auto-settles the remaining balance (including any late fee and any
    // damage/loss penalties) here, matching the real-world flow: the renter
    // pays off the rest on return.
    if (status === 'Item Returned/Completed' && previousStatus !== 'Item Returned/Completed') {
      db.orders[orderIndex].returnedAt = new Date().toISOString();
      db.orders[orderIndex].amountPaid = db.orders[orderIndex].totalPrice + (db.orders[orderIndex].lateFee || 0) + getPenaltyTotal(db.orders[orderIndex]);
    }
    await writeDB(db);
    res.json(db.orders[orderIndex]);
  });
}));

// Admin: correct/top-up the amount collected on an order without changing its
// status - e.g. a partially-paying customer tops up before pickup. Capped at
// the current full invoice (totalPrice + lateFee + any penalties, if already calculated).
app.put('/api/orders/:id/payment', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { amountPaid } = req.body;
    const db = await readDB();
    const idx = db.orders.findIndex((o: Order) => o.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = db.orders[idx];
    const cap = order.totalPrice + (order.lateFee || 0) + getPenaltyTotal(order);
    const paid = Number(amountPaid);
    if (isNaN(paid) || paid < 0 || paid > cap) {
      return res.status(400).json({ error: 'Jumlah pembayaran tidak valid.' });
    }
    db.orders[idx].amountPaid = paid;
    await writeDB(db);
    res.json(db.orders[idx]);
  });
}));

// Admin: add a damage/loss penalty entry to an order - only while staff still
// has the item in front of them at return (Approved/Paid or Item Picked Up),
// matching where Kalkulator Denda itself is shown. Once Completed, the
// invoice is already settled (see the auto-settle above).
app.post('/api/orders/:id/penalties', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { type, productId, description, amount } = req.body;
    const db = await readDB();
    const order = db.orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.status !== 'Approved/Paid' && order.status !== 'Item Picked Up') {
      return res.status(400).json({ error: 'Denda hanya bisa ditambahkan sebelum pesanan diselesaikan.' });
    }
    if (type !== 'Kerusakan' && type !== 'Kehilangan') {
      return res.status(400).json({ error: 'Jenis denda tidak valid.' });
    }
    const item = order.items.find((i: OrderItem) => i.productId === productId);
    if (!item) {
      return res.status(400).json({ error: 'Item tidak ditemukan pada pesanan ini.' });
    }
    const trimmedDescription = String(description || '').trim();
    if (!trimmedDescription) {
      return res.status(400).json({ error: 'Deskripsi/alasan denda wajib diisi.' });
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ error: 'Jumlah denda tidak valid.' });
    }
    order.penalties = order.penalties || [];
    order.penalties.push({
      id: `penalty-${Date.now()}`,
      type,
      productId,
      productName: item.productName,
      description: trimmedDescription,
      amount: numAmount,
      createdAt: new Date().toISOString(),
    });
    await writeDB(db);
    res.json(order);
  });
}));

// Admin: remove a mistakenly-added penalty entry, same status guard as above.
app.delete('/api/orders/:id/penalties/:penaltyId', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id, penaltyId } = req.params;
    const db = await readDB();
    const order = db.orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    // Owner can override this restriction and remove a penalty at any time,
    // even after the order is completed - staff (karyawan) keep the
    // before-completion-only restriction.
    const isOwnerOverride = req.currentUser!.role === 'owner';
    if (!isOwnerOverride && order.status !== 'Approved/Paid' && order.status !== 'Item Picked Up') {
      return res.status(400).json({ error: 'Denda hanya bisa diubah sebelum pesanan diselesaikan.' });
    }
    order.penalties = (order.penalties || []).filter((p: PenaltyEntry) => p.id !== penaltyId);
    await writeDB(db);
    res.json(order);
  });
}));

// Admin (owner-only): permanently delete an order - e.g. an erroneous
// double-booking. Not allowed once Item Returned/Completed, so a settled
// order's revenue can never silently disappear from stats/reports. No
// Postgres-specific sync code needed - writeDBPostgres already prunes any
// order (and cascade-deletes its order_items) no longer present in the
// dataset on every write, same mechanism DELETE /api/products/:id relies on.
app.delete('/api/orders/:id', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const db = await readDB();
    const order = db.orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.status === 'Item Returned/Completed') {
      return res.status(400).json({ error: 'Pesanan yang sudah selesai tidak bisa dihapus.' });
    }
    db.orders = db.orders.filter((o: Order) => o.id !== id);
    await writeDB(db);
    res.json({ message: 'Order deleted successfully.' });
  });
}));

// Admin (owner-only): remove/reset an already-applied late fee (lateDays/lateFee
// back to 0), even after completion - symmetric to the penalty delete override
// above. Deliberately doesn't touch amountPaid; getRemainingBalance() already
// clamps to 0, so an order that's now "overpaid" relative to the lower invoice
// just shows as Lunas, same as how removing a penalty already behaves.
app.delete('/api/orders/:id/late-fee', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const db = await readDB();
    const order = db.orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    order.lateDays = 0;
    order.lateFee = 0;
    await writeDB(db);
    res.json(order);
  });
}));

// Admin: Calculate late returns and penalty fees
app.post('/api/orders/:id/calculate-late', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { returnDateTime } = req.body; // "YYYY-MM-DDTHH:mm" local string (defaults to now if not provided)

    const db = await readDB();
    const order = db.orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    // A late-return fee only makes sense once the item has actually been
    // handed over - calculating one before Item Picked Up (e.g. while still
    // Approved/Paid) would charge for lateness that can't have happened yet.
    if (order.status !== 'Item Picked Up') {
      return res.status(400).json({ error: 'Denda keterlambatan hanya bisa dihitung setelah barang diambil.' });
    }

    // actualReturn is parsed as a local-time literal (no 'Z' suffix) so it
    // compares correctly regardless of the server's timezone offset - same
    // class of UTC-vs-local mismatch this project has been bitten by before
    // with DATE columns (see db/postgres.ts's DATE-oid override comment).
    const actualReturn = returnDateTime ? new Date(returnDateTime) : new Date();

    // Deadline = actual pickup time + the full rented duration (owner's
    // requested rule: "a day" is 24 hours from hand-over, not a calendar
    // day) - not the booked endDate's closing time. pickedUpAt is a full UTC
    // ISO instant (.toISOString()), so .getTime() arithmetic here is
    // unambiguous, unlike endDate (a bare calendar-date string).
    let deadline: Date;
    if (order.pickedUpAt) {
      deadline = new Date(new Date(order.pickedUpAt).getTime() + order.rentDuration * 24 * 60 * 60 * 1000);
    } else {
      // Legacy fallback for an order that reached Item Picked Up before this
      // field existed - same "fall back gracefully" treatment already given
      // to returnedAt-less legacy orders elsewhere (calculateAllocatedStock).
      const endDateDow = new Date(`${order.endDate}T00:00:00`).getDay();
      const closeTime = db.settings.operatingHours[WEEKDAY_KEYS[endDateDow]].close;
      deadline = new Date(`${order.endDate}T${closeTime}:00`);
    }

    // Tolerance is a flat grace buffer added ONCE to the deadline - not
    // re-applied per elapsed day. Owner correction (2026-08-19): the previous
    // version only used lateToleranceHours to decide whether hoursLate counted
    // as zero days late; once past that window, lateDays was computed from
    // the raw pre-tolerance deadline, so the tolerance's benefit evaporated
    // entirely the moment it was exceeded instead of just shifting the whole
    // clock forward once (e.g. 24h05m past the raw deadline rounded up to 2
    // days late, even though that's only ~20h past the tolerance-adjusted
    // deadline). Also drops the previous "store must be physically open"
    // condition on the tolerance - that rule's rationale only made sense under
    // the old closing-time-anchored deadline (past closing = store obviously
    // shut); it doesn't carry over now that the deadline is pickup-time
    // anchored and can fall at any hour (owner confirmed via AskUserQuestion).
    const effectiveDeadline = new Date(deadline.getTime() + db.settings.lateToleranceHours * 60 * 60 * 1000);
    const hoursLate = Math.max(0, (actualReturn.getTime() - effectiveDeadline.getTime()) / (1000 * 60 * 60));
    const lateDays = hoursLate === 0 ? 0 : Math.ceil(hoursLate / 24);

    // Calculate late fee per item - skipped when on-time (lateFeeTotal/
    // breakdown just stay at their zero defaults below), but persistence
    // always runs regardless of lateDays, so a recalculation that comes back
    // on-time actually clears a previously-persisted non-zero fee instead of
    // leaving it silently out of sync with what this response says.
    // INVARIANT: this loop must only read order.items' snapshotted fields
    // (ratesSnapshot, or the legacy pricePerDay-equivalent fields), never
    // db.products. A later admin edit to the live product must NOT retroactively
    // change an already-placed order's late fee. If you ever need live product
    // data here for something else, do not let it touch these snapshotted fields.
    //
    // The late-day cost is the diff of cumulative totals - cost(rentDuration + lateDays)
    // minus cost(rentDuration) - which is exactly the marginal cost of the late
    // days regardless of where the day-5 breakpoint falls, so no per-day loop is
    // needed. Same trick works for legacy (pre-migration) OrderItems using the old
    // formula's own notion of cumulative cost.
    let lateFeeTotal = 0;
    let breakdown: { productName: string; quantity: number; dailyRateBreakdown: string; itemTotalLateCost: number }[] = [];
    if (lateDays > 0) {
      breakdown = order.items.map(item => {
        let itemLateCost: number;

        if (item.ratesSnapshot) {
          itemLateCost = calculateRentalCost(item.ratesSnapshot, order.rentDuration + lateDays)
            - calculateRentalCost(item.ratesSnapshot, order.rentDuration);
        } else {
          const basePrice = item.legacyPricePerDay!;
          const incremental = item.legacyIncrementalPrice ?? 0;
          const discountThresholdDays = item.legacyDiscountThresholdDays ?? 5;
          itemLateCost = calculateLegacyRentalCost(basePrice, incremental, discountThresholdDays, order.rentDuration + lateDays)
            - calculateLegacyRentalCost(basePrice, incremental, discountThresholdDays, order.rentDuration);
        }
        itemLateCost = Math.max(0, itemLateCost); // defensive: a mistyped (non-monotonic) rate table could otherwise produce a negative late fee

        const itemTotalLateCost = itemLateCost * item.quantity;
        lateFeeTotal += itemTotalLateCost;

        // Describes the days actually being charged (order.rentDuration+1 through
        // +lateDays), not a fixed "5 Hari" - the marginal per-day cost only equals
        // day5Price/extraDayRate when those late days actually fall past day 5; for
        // a short rental returned late, they don't, and the old hardcoded string
        // named the wrong tier entirely regardless of what was really charged.
        const perDayLateRate = Math.round(itemLateCost / lateDays);
        const dailyRateBreakdown = `Rp${perDayLateRate.toLocaleString('id-ID')}/hari x ${lateDays} hari telat`;

        return {
          productName: item.productName,
          quantity: item.quantity,
          dailyRateBreakdown,
          itemTotalLateCost
        };
      });
    }

    // Save the late fees back to order
    order.lateDays = lateDays;
    order.lateFee = lateFeeTotal;

    // Note: We don't save DB immediately, user can confirm returning, then status updates and saves,
    // but let's save these calculated values now so they stick to the order.
    const orderIndex = db.orders.findIndex((o: Order) => o.id === id);
    db.orders[orderIndex] = order;
    await writeDB(db);

    res.json({
      lateDays,
      lateFee: lateFeeTotal,
      breakdown,
      deadline: effectiveDeadline.toISOString() // the real no-penalty-before-this cutoff (tolerance already included)
    });
  });
}));

// Public: whether the WuzzPay gateway is configured - lets the client fall
// back to the legacy manual QRIS-mock/WhatsApp flow untouched when it isn't.
// Also doubles as the instant kill-switch in production: unsetting
// WUZZPAY_API_KEY reverts the client to the old flow immediately.
app.get('/api/payment-config', asyncHandler(async (req, res) => {
  res.json({ enabled: Boolean(WUZZPAY_API_KEY && WUZZPAY_MERCHANT_ID) });
}));

// Public, scoped by the same unguessable confirmationToken as GET
// /api/orders/confirm/:token (order.id itself is order-${Date.now()}, guessable,
// so the token is the only safe public key - see that route above). Triggers a
// real WuzzPay charge for the order's already-computed totalPrice; the amount
// is never taken from the request body.
app.post('/api/orders/confirm/:token/charge', asyncHandler(async (req, res) => {
  if (!WUZZPAY_API_KEY || !WUZZPAY_MERCHANT_ID) {
    return res.status(503).json({ error: 'Payment gateway belum dikonfigurasi.' });
  }
  const { productId, bankCode } = req.body;
  if (productId !== 'qris' && productId !== 'va' && productId !== 'emoney') {
    return res.status(400).json({ error: 'Metode pembayaran tidak valid.' });
  }
  // bankCode selects the sub-channel for va (bank) / emoney (wallet) - validated
  // against the same known-code lists the client's picker offers, so no
  // arbitrary string reaches WuzzPay's API unchecked (belt-and-suspenders on
  // top of productId's own enum check above). Numeric interbank codes, NOT
  // the letter codes ("BCA") shown on WuzzPay's own "Bank List" doc page -
  // confirmed empirically against the sandbox (Stage 2 of the payment gateway
  // plan): a letter code was rejected downstream by their provider (espay)
  // with "Data tidak ditemukan = Bank Code", while the numeric code from
  // their /v1/va/static example (014 = BCA) succeeded. Their own docs are
  // internally inconsistent here; this is what's actually correct.
  const VALID_BANK_CODES = ['014', '008', '002', '009', '022', '011', '013', '451']; // BCA, Mandiri, BRI, BNI, CIMB, Danamon, Permata, BSI
  const VALID_WALLET_CODES = ['ovo', 'dana', 'gopay'];
  if (productId === 'va' && !VALID_BANK_CODES.includes(bankCode)) {
    return res.status(400).json({ error: 'Kode bank tidak valid.' });
  }
  if (productId === 'emoney' && !VALID_WALLET_CODES.includes(bankCode)) {
    return res.status(400).json({ error: 'Kode e-wallet tidak valid.' });
  }

  const { token } = req.params;

  // Quick, lock-protected read + validation - a stale read past this point is
  // fine, since the actual charge call below is naturally idempotent
  // (deterministic Idempotency-Key = order.id), so a race against a
  // concurrent charge attempt is caught by WuzzPay itself (409 in-flight),
  // not by this check.
  const precheck = await withDbLock(async () => {
    const db = await readDB();
    const order = db.orders.find((o: Order) => o.confirmationToken && o.confirmationToken === token);
    if (!order) return { kind: 'not-found' as const };
    // Testing gate (see PAYMENT_GATEWAY_TEST_TRIGGER_NAME above) - responds
    // identically to "gateway not configured" so a non-test order can't
    // distinguish "feature hidden" from "feature doesn't exist yet".
    if (order.customerName !== PAYMENT_GATEWAY_TEST_TRIGGER_NAME) return { kind: 'not-configured' as const };
    // Only a still-Pending order can be charged - not Expired. Allowing a
    // fresh charge into an expired order could let a customer pay for stock
    // the system may have since re-allocated; a payment that was already
    // legitimately in flight before expiry is instead recovered by
    // applyWuzzpaySettlementStatus's separate Expired-transition path, which
    // only completes an existing transaction, never starts a new one.
    if (order.status !== 'Pending') return { kind: 'not-chargeable' as const };
    // Idempotent short-circuit: a still-live instruction (not yet expired) is
    // just returned as-is, so a page refresh/double-click doesn't re-charge.
    const existingExpiresAt = order.paymentInstruction?.expires_at;
    if (order.wuzzpayTransactionId && typeof existingExpiresAt === 'string' && new Date(existingExpiresAt).getTime() > Date.now()) {
      return {
        kind: 'already-live' as const,
        paymentMethod: order.paymentMethod,
        paymentInstruction: order.paymentInstruction,
        wuzzpayTransactionId: order.wuzzpayTransactionId,
      };
    }
    return { kind: 'ok' as const, orderId: order.id, totalPrice: order.totalPrice };
  });

  if (precheck.kind === 'not-found') return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  if (precheck.kind === 'not-configured') return res.status(503).json({ error: 'Payment gateway belum dikonfigurasi.' });
  if (precheck.kind === 'not-chargeable') return res.status(400).json({ error: 'Pesanan ini sudah tidak bisa dibuatkan pembayaran baru.' });
  if (precheck.kind === 'already-live') {
    return res.json({ paymentMethod: precheck.paymentMethod, paymentInstruction: precheck.paymentInstruction, wuzzpayTransactionId: precheck.wuzzpayTransactionId });
  }

  // SLOW outbound call - deliberately outside withDbLock (see
  // fetchWuzzpaySettlementStatus's comment above for why: this used to run
  // inside the lock and could starve every other write route for as long as
  // WuzzPay took to respond).
  let data: any;
  try {
    // Idempotency-Key is deterministic (order.id) so a raced/duplicated
    // request is deduped by WuzzPay itself (409 in-flight, replayed once
    // completed) - a second layer on top of the precheck short-circuit above.
    data = await wuzzpayRequest('POST', '/charge', {
      partner_reference: precheck.orderId,
      amount: { amount: precheck.totalPrice, currency: 'IDR' },
      product_id: productId,
      bank_code: bankCode,
    }, precheck.orderId);
  } catch (err) {
    console.error(`WuzzPay charge failed for order ${precheck.orderId}:`, err);
    return res.status(502).json({ error: 'Gagal membuat instruksi pembayaran. Silakan coba lagi.' });
  }

  // Transaction id is at data.transaction.ID - nested under a PascalCase
  // "transaction" object, confirmed empirically against the real sandbox
  // (Stage 2 of the payment gateway plan). WuzzPay's docs don't show this
  // shape at all (their VA example response has no "transaction" key and
  // no id field of any kind), so this was unknown until tested live. Still
  // falls back to the other plausible names defensively and logs loudly if
  // even those are absent, rather than silently trusting a guess.
  const transactionId = data?.data?.transaction?.ID ?? data?.data?.id ?? data?.data?.transaction_id ?? data?.data?.payment_instruction?.id;
  if (!transactionId) {
    console.error(`WuzzPay charge response for order ${precheck.orderId} has no recognizable transaction id - raw response:`, JSON.stringify(data));
  }

  // Quick, lock-protected persist - re-reads the order fresh (it may have
  // changed while the slow call above was in flight) rather than reusing the
  // precheck snapshot.
  const result = await withDbLock(async () => {
    const db = await readDB();
    const order = db.orders.find((o: Order) => o.id === precheck.orderId);
    if (!order) return null;
    order.paymentMethod = productId;
    order.paymentChannel = bankCode ?? undefined;
    order.paymentInstruction = data?.data?.payment_instruction ?? undefined;
    order.wuzzpayProvider = data?.data?.used_provider ?? undefined;
    order.wuzzpayTransactionId = transactionId ?? undefined;
    await writeDB(db);
    return {
      paymentMethod: order.paymentMethod,
      paymentInstruction: order.paymentInstruction,
      wuzzpayTransactionId: order.wuzzpayTransactionId,
    };
  });
  if (!result) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  res.json(result);
}));

// Public, same token boundary - the client polls this directly, so
// correctness never depends on the webhook (below) actually arriving. Always
// re-verifies against WuzzPay's own API before responding; never trusts
// anything client-supplied. The slow network call runs OUTSIDE withDbLock
// (see fetchWuzzpaySettlementStatus's comment) - critical here specifically,
// since the client polls this route every few seconds for as long as a
// payment tab stays open.
app.get('/api/orders/confirm/:token/payment-status', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const snapshot = await withDbLock(async () => {
    const db = await readDB();
    const order = db.orders.find((o: Order) => o.confirmationToken && o.confirmationToken === token);
    return order ? { wuzzpayTransactionId: order.wuzzpayTransactionId, status: order.status, wuzzpayLastStatus: order.wuzzpayLastStatus } : null;
  });
  if (!snapshot) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const wuzzpayStatus = snapshot.wuzzpayTransactionId
    ? await fetchWuzzpaySettlementStatus(snapshot.wuzzpayTransactionId, token)
    : undefined;

  const result = await withDbLock(async () => {
    const db = await readDB();
    const order = db.orders.find((o: Order) => o.confirmationToken && o.confirmationToken === token);
    if (!order) return null;
    // Only writes (a full 6-table transactional sync, per writeDBPostgres -
    // not cheap) when something actually changed, which most polls won't -
    // "still pending" is by far the common case.
    if (applyWuzzpaySettlementStatus(order, wuzzpayStatus)) {
      await writeDB(db);
    }
    return { status: order.status, wuzzpayLastStatus: order.wuzzpayLastStatus };
  });
  if (!result) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  res.json(result);
}));

// Public webhook receiver - no auth, since WuzzPay's own servers call this and
// its signing scheme isn't published anywhere in their docs (checked
// exhaustively - see the payment gateway plan's Context). Deliberately never
// trusts the body for anything beyond "which order to re-check": only
// partner_reference is read, purely to look up the order; the actual status
// change always comes from an authenticated GET back to WuzzPay, never from
// this payload. This makes the endpoint replay-safe and spoof-proof by
// construction - the worst a forged/garbage body can do is trigger a harmless
// extra re-verification of an order the caller can already see the token
// for. Always responds 200 quickly regardless of outcome, to avoid retry
// storms from WuzzPay on our own bugs. Same lock-scoping as payment-status
// above - the slow network call never runs inside withDbLock.
app.post('/api/webhooks/wuzzpay', asyncHandler(async (req, res) => {
  try {
    const partnerReference = req.body?.partner_reference ?? req.body?.data?.partner_reference;
    if (typeof partnerReference === 'string') {
      const snapshot = await withDbLock(async () => {
        const db = await readDB();
        const order = db.orders.find((o: Order) => o.id === partnerReference);
        return order ? { wuzzpayTransactionId: order.wuzzpayTransactionId } : null;
      });
      if (snapshot?.wuzzpayTransactionId) {
        const wuzzpayStatus = await fetchWuzzpaySettlementStatus(snapshot.wuzzpayTransactionId, partnerReference);
        await withDbLock(async () => {
          const db = await readDB();
          const order = db.orders.find((o: Order) => o.id === partnerReference);
          if (order && applyWuzzpaySettlementStatus(order, wuzzpayStatus)) {
            await writeDB(db);
          }
        });
      }
    }
  } catch (err) {
    console.error('WuzzPay webhook handling failed:', err);
  }
  res.status(200).json({ received: true });
}));

// Public: store info for the public site's footer/marquee - a curated subset of
// settings only, deliberately omitting lateToleranceHours (an internal admin
// config value with no public use), same minimal-surface care as GET /api/products.
//
// Falls back to the original default wording per-field whenever the owner has
// left something blank in Pengaturan (e.g. cleared a field by accident before
// saving) - the public site should never show a broken-looking empty paragraph
// or empty link text. This only affects what's served here, not what's stored:
// GET /api/settings (the admin's own Pengaturan view) still shows the raw saved
// value, blank or not, so the owner always sees exactly what they actually saved.
app.get('/api/store-info', asyncHandler(async (req, res) => {
  const db = await readDB();
  const savedFooter = db.settings.footer || defaultSettings.footer;
  const savedRunningText = db.settings.runningText;
  res.json({
    operatingHours: db.settings.operatingHours,
    footer: {
      description: savedFooter.description || defaultSettings.footer.description,
      address: savedFooter.address || defaultSettings.footer.address,
      instagramHandle: savedFooter.instagramHandle || defaultSettings.footer.instagramHandle,
      instagramUrl: savedFooter.instagramUrl || defaultSettings.footer.instagramUrl,
      whatsappText: savedFooter.whatsappText || defaultSettings.footer.whatsappText,
      copyrightText: savedFooter.copyrightText || defaultSettings.footer.copyrightText,
    },
    runningText: savedRunningText && savedRunningText.length > 0 ? savedRunningText : defaultSettings.runningText,
  });
}));

// Admin: Get/Update store settings (late-return tolerance, weekly operating hours,
// public footer text, marquee running text)
app.get('/api/settings', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  const settings = await readSettings();
  res.json(settings);
}));

app.put('/api/settings', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { lateToleranceHours, pendingExpiryHours, operatingHours, footer, runningText } = req.body;
    const db = await readDB();
    db.settings = { lateToleranceHours, pendingExpiryHours, operatingHours, footer, runningText };
    await writeDB(db);
    res.json(db.settings);
  });
}));

// Admin: Get Dashboard Stats
app.get('/api/stats', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
    if (expireStaleOrders(orders, settings.pendingExpiryHours)) {
      await writeOrders(orders);
    }

    const todayStr = getTodayDateString();

    // Active rentals = orders that have been approved or items picked up
    const activeRentalsCount = orders.filter(o => o.status === 'Approved/Paid' || o.status === 'Item Picked Up').length;

    // Total Revenue = cash actually collected (amountPaid), not the accrued
    // totalPrice+lateFee - a partially-paid order should only count what's
    // actually been received. (Expired orders were never paid, so they're
    // excluded alongside Pending.)
    const finishedOrPaidOrders = orders.filter(o => o.status !== 'Pending' && o.status !== 'Expired');
    const totalRevenue = finishedOrPaidOrders.reduce((sum, o) => {
      return sum + getAmountPaid(o);
    }, 0);

    // Piutang - total still owed across the same order set (0 for orders paid
    // in full; Completed orders auto-settle to 0 on return, see PUT .../status).
    const totalOutstanding = finishedOrPaidOrders.reduce((sum, o) => {
      return sum + getRemainingBalance(o);
    }, 0);

    // Items due for return today = Active orders with EndDate === todayStr or before today and not completed
    const dueTodayCount = orders.filter(o => {
      return (o.status === 'Item Picked Up' || o.status === 'Approved/Paid') && (o.endDate <= todayStr);
    }).length;

    res.json({
      activeRentalsCount,
      totalRevenue,
      totalOutstanding,
      dueTodayCount
    });
  });
}));

// Job price list: any logged-in user can read it (karyawan needs it to fill
// the Operational form); only owner manages it (from the Pengaturan tab).
app.get('/api/job-prices', authenticateUser, asyncHandler(async (req, res) => {
  const jobPriceList = await readJobPriceList();
  res.json(jobPriceList);
}));

app.post('/api/job-prices', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { itemName, cleaningPrice, laundryPrice, inventarisPrice, productIds } = req.body;
    if (!itemName) {
      return res.status(400).json({ error: 'Missing item name.' });
    }
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'Pilih minimal satu alat dari katalog rental.' });
    }
    const db = await readDB();
    const invalidId = productIds.find((pid: string) => !db.products.some((p: Product) => p.id === pid));
    if (invalidId) {
      return res.status(400).json({ error: `Product with ID ${invalidId} not found.` });
    }
    const newItem: JobPriceListItem = {
      id: `job-price-${Date.now()}`,
      itemName,
      cleaningPrice: cleaningPrice !== undefined && cleaningPrice !== '' ? Number(cleaningPrice) : undefined,
      laundryPrice: laundryPrice !== undefined && laundryPrice !== '' ? Number(laundryPrice) : undefined,
      inventarisPrice: inventarisPrice !== undefined && inventarisPrice !== '' ? Number(inventarisPrice) : undefined,
      active: true,
      productIds,
    };
    db.jobPriceList.push(newItem);
    await writeDB(db);
    res.status(201).json(newItem);
  });
}));

app.put('/api/job-prices/:id', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { itemName, cleaningPrice, laundryPrice, inventarisPrice, active, productIds } = req.body;
    const db = await readDB();
    const idx = db.jobPriceList.findIndex((j: JobPriceListItem) => j.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    const existing = db.jobPriceList[idx];
    db.jobPriceList[idx] = {
      ...existing,
      itemName: itemName !== undefined ? itemName : existing.itemName,
      cleaningPrice: cleaningPrice !== undefined ? (cleaningPrice === '' ? undefined : Number(cleaningPrice)) : existing.cleaningPrice,
      laundryPrice: laundryPrice !== undefined ? (laundryPrice === '' ? undefined : Number(laundryPrice)) : existing.laundryPrice,
      inventarisPrice: inventarisPrice !== undefined ? (inventarisPrice === '' ? undefined : Number(inventarisPrice)) : existing.inventarisPrice,
      active: active !== undefined ? active : existing.active,
      productIds: productIds !== undefined ? productIds : existing.productIds,
    };
    await writeDB(db);
    res.json(db.jobPriceList[idx]);
  });
}));

app.delete('/api/job-prices/:id', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const db = await readDB();
    const initialCount = db.jobPriceList.length;
    db.jobPriceList = db.jobPriceList.filter((j: JobPriceListItem) => j.id !== id);
    if (db.jobPriceList.length === initialCount) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    await writeDB(db);
    res.json({ message: 'Item deleted successfully.' });
  });
}));

// Job entries: owner sees everyone's, karyawan sees only their own.
app.get('/api/job-entries', authenticateUser, asyncHandler(async (req, res) => {
  const jobEntries = await readJobEntries();
  const entries = req.currentUser!.role === 'owner'
    ? jobEntries
    : jobEntries.filter((e: JobEntry) => e.employeeUserId === req.currentUser!.id);
  res.json(entries);
}));

app.post('/api/job-entries', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { entryDate, itemName, jobType, quantity } = req.body;
    const validJobTypes: JobType[] = ['CLEANING', 'LAUNDRY', 'INVENTARIS'];
    if (!entryDate || !itemName || !validJobTypes.includes(jobType) || !quantity) {
      return res.status(400).json({ error: 'Missing or invalid required job entry fields.' });
    }
    const db = await readDB();
    const priceItem = db.jobPriceList.find((j: JobPriceListItem) => j.itemName === itemName);
    const unitPrice = priceItem ? getJobPrice(priceItem, jobType) : undefined;
    if (unitPrice === undefined) {
      return res.status(400).json({ error: 'Jenis pekerjaan ini tidak berlaku untuk item tersebut.' });
    }
    const qty = Number(quantity);
    const newEntry: JobEntry = {
      id: `job-entry-${Date.now()}`,
      employeeUserId: req.currentUser!.id,
      employeeName: req.currentUser!.displayName,
      entryDate,
      itemName,
      jobType,
      unitPrice,
      quantity: qty,
      total: unitPrice * qty,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
    db.jobEntries.unshift(newEntry);
    await writeDB(db);
    res.status(201).json(newEntry);
  });
}));

// Bulk approve+pay - registered BEFORE the /:id route below so this literal
// path isn't swallowed by the :id wildcard.
app.put('/api/job-entries/approve-batch', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { ids, paymentDate } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !paymentDate) {
      return res.status(400).json({ error: 'Missing ids or payment date.' });
    }
    const db = await readDB();
    const idSet = new Set(ids);
    const updatedIds: string[] = [];
    db.jobEntries = db.jobEntries.map((e: JobEntry) => {
      if (idSet.has(e.id) && e.status === 'Pending') {
        updatedIds.push(e.id);
        return { ...e, status: 'Paid' as const, paymentDate };
      }
      return e;
    });
    await writeDB(db);
    // Returns exactly which ids were actually flipped to Paid (not just a
    // count) - the client needs the authoritative set, since its own
    // selectedIds/local status can be stale relative to a concurrent change
    // (e.g. another session rejected one of them a moment earlier).
    res.json({ updatedCount: updatedIds.length, updatedIds });
  });
}));

// Owner rejects a Pending entry with a reason (miss-input catch) - registered
// before the generic /:id route below, same reasoning as approve-batch.
app.put('/api/job-entries/:id/reject', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Alasan penolakan wajib diisi.' });
    }
    const db = await readDB();
    const idx = db.jobEntries.findIndex((e: JobEntry) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Job entry not found.' });
    }
    if (db.jobEntries[idx].status !== 'Pending') {
      return res.status(403).json({ error: 'Hanya pekerjaan Pending yang bisa ditolak.' });
    }
    db.jobEntries[idx] = {
      ...db.jobEntries[idx],
      status: 'Rejected',
      rejectionReason: reason.trim(),
      rejectedAt: new Date().toISOString(),
    };
    await writeDB(db);
    res.json(db.jobEntries[idx]);
  });
}));

// Edit own Pending/Rejected job entry (input mistakes only - once Paid, immutable).
// Editing a Rejected entry re-queues it as Pending and clears the rejection, same
// as if it were never rejected - this is how a karyawan fixes and resubmits.
app.put('/api/job-entries/:id', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { entryDate, itemName, jobType, quantity } = req.body;
    const db = await readDB();
    const idx = db.jobEntries.findIndex((e: JobEntry) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Job entry not found.' });
    }
    const entry = db.jobEntries[idx];
    if (entry.employeeUserId !== req.currentUser!.id) {
      return res.status(403).json({ error: 'Anda hanya bisa mengubah pekerjaan milik sendiri.' });
    }
    if (entry.status !== 'Pending' && entry.status !== 'Rejected') {
      return res.status(403).json({ error: 'Pekerjaan yang sudah dibayar tidak bisa diubah.' });
    }

    const nextItemName = itemName !== undefined ? itemName : entry.itemName;
    const nextJobType = jobType !== undefined ? jobType : entry.jobType;
    const priceItem = db.jobPriceList.find((j: JobPriceListItem) => j.itemName === nextItemName);
    const unitPrice = priceItem ? getJobPrice(priceItem, nextJobType) : undefined;
    if (unitPrice === undefined) {
      return res.status(400).json({ error: 'Jenis pekerjaan ini tidak berlaku untuk item tersebut.' });
    }
    const qty = quantity !== undefined ? Number(quantity) : entry.quantity;

    db.jobEntries[idx] = {
      ...entry,
      entryDate: entryDate !== undefined ? entryDate : entry.entryDate,
      itemName: nextItemName,
      jobType: nextJobType,
      unitPrice,
      quantity: qty,
      total: unitPrice * qty,
      status: 'Pending',
      rejectionReason: undefined,
      rejectedAt: undefined,
    };
    await writeDB(db);
    res.json(db.jobEntries[idx]);
  });
}));

// ---------------- VITE FRONTEND INTERPRETATION ----------------

async function startServer() {
  await initDatabase();

  if (process.env.NODE_ENV !== 'production') {
    // In development mode, Vite compiles frontend code on the fly
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // In production mode, serve compiled static files from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Final error-handling middleware - must be registered last. Catches anything
  // asyncHandler forwarded via next(err) so a DB/network failure returns a clean
  // JSON 500 instead of hanging the client or crashing the process.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API error:', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ error: 'Internal server error.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bilbo Outdoors Server running at http://localhost:${PORT}`);
  });
}

startServer();
