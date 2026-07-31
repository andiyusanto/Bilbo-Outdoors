import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { Product, Order, OrderStatus, DashboardStats, StoreSettings, AppUser, PublicUser, UserRole, JobPriceListItem, JobEntry, JobType } from './src/types';
import { defaultProducts } from './db/defaultProducts';
import { defaultSettings } from './db/defaultSettings';
import { defaultUsers } from './db/defaultUsers';
import { defaultJobPriceList } from './db/defaultJobPriceList';
import { initPostgresPool, seedPostgresIfEmpty, readDBPostgres, writeDBPostgres } from './db/postgres';
import { calculateRentalCost, calculateLegacyRentalCost } from './src/pricing';
import { hashPassword, verifyPassword, generateSessionToken } from './src/auth';
import { formatDateLabel } from './src/lib/date';

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

// Whether the store is physically open at the given moment, per its own
// weekday's operating hours (which may differ from the order's endDate weekday
// once a late return crosses into a new calendar day).
function isStoreOpenAt(dateTime: Date, operatingHours: StoreSettings['operatingHours']): boolean {
  const dayKey = WEEKDAY_KEYS[dateTime.getDay()];
  const hours = operatingHours[dayKey];
  const hhmm = `${String(dateTime.getHours()).padStart(2, '0')}:${String(dateTime.getMinutes()).padStart(2, '0')}`;
  return hhmm >= hours.open && hhmm < hours.close;
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
const PRODUCT_IMAGE_BUCKET = 'product-images';
const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('Product image upload disabled — set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY to enable.');
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
  readDB().then((db) => {
    const user = db.users.find((u: AppUser) => u.sessionToken === token);
    if (!user) {
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
    const db = await readDB();
    const user = db.users.find((u: AppUser) => u.username === username);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }
    user.sessionToken = generateSessionToken();
    await writeDB(db);
    res.json({ token: user.sessionToken, role: user.role, displayName: user.displayName });
  });
}));

// Staff Logout - invalidates the session token server-side
app.post('/api/auth/logout', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const db = await readDB();
    const user = db.users.find((u: AppUser) => u.id === req.currentUser!.id);
    if (user) user.sessionToken = undefined;
    await writeDB(db);
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
    const db = await readDB();
    const user = db.users.find((u: AppUser) => u.id === req.currentUser!.id);
    if (!user || !verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Password saat ini salah.' });
    }
    const { hash, salt } = hashPassword(newPassword);
    user.passwordHash = hash;
    user.passwordSalt = salt;
    // Rotate the session token too - an attacker holding a previously-leaked
    // token for this account (the scenario a password change is meant to
    // recover from) must not stay authenticated after it. Mirrors how logout
    // clears sessionToken; here we issue a fresh one so this same request's
    // caller doesn't get logged out by their own password change.
    user.sessionToken = generateSessionToken();
    await writeDB(db);
    res.json({ message: 'Password berhasil diubah.', token: user.sessionToken });
  });
}));

// Owner-only: list users (public-safe projection, never sends hashes/tokens)
app.get('/api/users', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  const db = await readDB();
  res.json(db.users.map(toPublicUser));
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
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    await writeDB(db);
    res.status(201).json(toPublicUser(newUser));
  });
}));

// Get Products (available to both clients and admins)
app.get('/api/products', asyncHandler(async (req, res) => {
  const db = await readDB();
  res.json(db.products);
}));

// Admin CRUD: Create Product
app.post('/api/products', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { name, category, rates, readinessHours, stock, description, image } = req.body;
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
      image: image || ''
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
    const { name, category, rates, readinessHours, stock, description, image } = req.body;

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
      image: image !== undefined ? image : db.products[productIndex].image
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
function calculateAllocatedStock(orders: Order[], products: Product[], startDateStr: string, endDateStr: string): Record<string, number> {
  const startReq = new Date(startDateStr);
  const endReq = new Date(endDateStr);

  const readinessDaysById = new Map(products.map(p => [p.id, Math.ceil((p.readinessHours || 0) / 24)]));

  const allocationMap: Record<string, number> = {};

  // Legacy completed orders (no returnedAt) are excluded entirely, same as before.
  // Expired orders never block stock either - by the time this runs, expireStaleOrders
  // has already persisted any stale Pending->Expired flip earlier in the same request.
  const relevantOrders = orders.filter(o =>
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

// An order left Pending for more than 2 hours with no payment confirmation is
// treated as abandoned - it's flipped to Expired so it stops blocking stock and
// shows up distinctly in the admin order list. No cron/background worker exists
// in this app (single Express process, no scheduler infra); this mirrors the
// existing calculate-late lazy-computation pattern, but runs automatically at
// the top of every route that reads orders, rather than behind an explicit
// button click, so stock availability and the order list reflect expiry
// promptly. Each order flips at most once, so repeated calls are self-limiting.
// Staff can still manually approve payment on an Expired order afterwards (see
// PUT /api/orders/:id/status's validStatuses) - expiring never revokes stock,
// it just stops reserving it, and remains reversible.
const PENDING_ORDER_EXPIRY_MS = 2 * 60 * 60 * 1000;

function expireStaleOrders(db: DbShape): boolean {
  const now = Date.now();
  let changed = false;
  for (const order of db.orders) {
    if (order.status === 'Pending' && now - new Date(order.createdAt).getTime() > PENDING_ORDER_EXPIRY_MS) {
      order.status = 'Expired';
      changed = true;
    }
  }
  return changed;
}

// Check Availability (Available to clients and admins)
app.post('/api/check-availability', asyncHandler(async (req, res) => {
  const { startDate, endDate, items } = req.body; // items is optional array of { productId, quantity }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing start date or end date.' });
  }

  await withDbLock(async () => {
    const db = await readDB();
    if (expireStaleOrders(db)) {
      await writeDB(db);
    }
    const allocatedMap = calculateAllocatedStock(db.orders, db.products, startDate, endDate);

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
    if (expireStaleOrders(db)) {
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
    const rentDuration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive rent days

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

  const { personalPhotoBase64, ...safeOrder } = order;
  res.json(safeOrder);
}));

// Admin: Get all orders
app.get('/api/orders', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const db = await readDB();
    if (expireStaleOrders(db)) {
      await writeDB(db);
    }
    res.json(db.orders);
  });
}));

// Admin: Update order status
app.put('/api/orders/:id/status', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { status, pickupIdType } = req.body;

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
    // Record which physical ID card was left as collateral in person, on the
    // transition into Item Picked Up.
    if (status === 'Item Picked Up' && pickupIdType) {
      db.orders[orderIndex].pickupIdType = pickupIdType;
    }
    // Stamp the actual return time once, on the transition into Completed - this
    // is what the readiness-time stock calculation anchors on (calculateAllocatedStock).
    if (status === 'Item Returned/Completed' && previousStatus !== 'Item Returned/Completed') {
      db.orders[orderIndex].returnedAt = new Date().toISOString();
    }
    await writeDB(db);
    res.json(db.orders[orderIndex]);
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

    // Both sides parsed as local-time literals (no 'Z' suffix) so they compare
    // correctly against each other regardless of the server's timezone offset -
    // same class of UTC-vs-local mismatch this project has been bitten by before
    // with DATE columns (see db/postgres.ts's DATE-oid override comment).
    const actualReturn = returnDateTime ? new Date(returnDateTime) : new Date();
    const endDateDow = new Date(`${order.endDate}T00:00:00`).getDay();
    const closeTime = db.settings.operatingHours[WEEKDAY_KEYS[endDateDow]].close;
    const deadline = new Date(`${order.endDate}T${closeTime}:00`);

    // Tolerance only forgives a return that both (a) happens within
    // `lateToleranceHours` of closing time, AND (b) happens while the store is
    // actually open at that moment. Once the return moment falls outside
    // operating hours, the customer can only physically return the item at the
    // store's next opening - which, for this store's schedule (close-to-reopen
    // gaps always longer than the tolerance), always means "tomorrow" and an
    // automatic penalty, regardless of how few hours have technically elapsed.
    const hoursLate = Math.max(0, (actualReturn.getTime() - deadline.getTime()) / (1000 * 60 * 60));
    const withinTolerance = hoursLate > 0
      && hoursLate <= db.settings.lateToleranceHours
      && isStoreOpenAt(actualReturn, db.settings.operatingHours);
    const lateDays = hoursLate === 0 || withinTolerance ? 0 : Math.ceil(hoursLate / 24);

    if (lateDays === 0) {
      return res.json({
        lateDays: 0,
        lateFee: 0,
        breakdown: [],
        deadline: deadline.toISOString()
      });
    }

    // Calculate late fee per item.
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
    const breakdown = order.items.map(item => {
      let itemLateCost: number;
      let dailyRateBreakdown: string;

      if (item.ratesSnapshot) {
        itemLateCost = calculateRentalCost(item.ratesSnapshot, order.rentDuration + lateDays)
          - calculateRentalCost(item.ratesSnapshot, order.rentDuration);
        dailyRateBreakdown = `5 Hari: Rp${item.ratesSnapshot.day5Price} (+Rp${item.ratesSnapshot.extraDayRate}/hari setelahnya)`;
      } else {
        const basePrice = item.legacyPricePerDay!;
        const incremental = item.legacyIncrementalPrice ?? 0;
        const discountThresholdDays = item.legacyDiscountThresholdDays ?? 5;
        itemLateCost = calculateLegacyRentalCost(basePrice, incremental, discountThresholdDays, order.rentDuration + lateDays)
          - calculateLegacyRentalCost(basePrice, incremental, discountThresholdDays, order.rentDuration);
        dailyRateBreakdown = incremental > 0 ? `Base: ${basePrice} (-${incremental} after ${discountThresholdDays}d)` : `Rate: ${basePrice}`;
      }
      itemLateCost = Math.max(0, itemLateCost); // defensive: a mistyped (non-monotonic) rate table could otherwise produce a negative late fee

      const itemTotalLateCost = itemLateCost * item.quantity;
      lateFeeTotal += itemTotalLateCost;

      return {
        productName: item.productName,
        quantity: item.quantity,
        dailyRateBreakdown,
        itemTotalLateCost
      };
    });

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
      deadline: deadline.toISOString()
    });
  });
}));

// Admin: Get/Update store settings (late-return tolerance + weekly operating hours)
app.get('/api/settings', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  const db = await readDB();
  res.json(db.settings);
}));

app.put('/api/settings', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { lateToleranceHours, operatingHours } = req.body;
    const db = await readDB();
    db.settings = { lateToleranceHours, operatingHours };
    await writeDB(db);
    res.json(db.settings);
  });
}));

// Admin: Get Dashboard Stats
app.get('/api/stats', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const db = await readDB();
    if (expireStaleOrders(db)) {
      await writeDB(db);
    }
    const orders: Order[] = db.orders;

    const todayStr = new Date().toISOString().split('T')[0];

    // Active rentals = orders that have been approved or items picked up
    const activeRentalsCount = orders.filter(o => o.status === 'Approved/Paid' || o.status === 'Item Picked Up').length;

    // Total Revenue = Sum of totalPrice of all Approved, Picked Up, and Completed orders, plus any late fees
    // (Expired orders were never paid, so they're excluded alongside Pending)
    const finishedOrPaidOrders = orders.filter(o => o.status !== 'Pending' && o.status !== 'Expired');
    const totalRevenue = finishedOrPaidOrders.reduce((sum, o) => {
      return sum + o.totalPrice + (o.lateFee || 0);
    }, 0);

    // Items due for return today = Active orders with EndDate === todayStr or before today and not completed
    const dueTodayCount = orders.filter(o => {
      return (o.status === 'Item Picked Up' || o.status === 'Approved/Paid') && (o.endDate <= todayStr);
    }).length;

    res.json({
      activeRentalsCount,
      totalRevenue,
      dueTodayCount
    });
  });
}));

// Job price list: any logged-in user can read it (karyawan needs it to fill
// the Operational form); only owner manages it (from the Pengaturan tab).
app.get('/api/job-prices', authenticateUser, asyncHandler(async (req, res) => {
  const db = await readDB();
  res.json(db.jobPriceList);
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
  const db = await readDB();
  const entries = req.currentUser!.role === 'owner'
    ? db.jobEntries
    : db.jobEntries.filter((e: JobEntry) => e.employeeUserId === req.currentUser!.id);
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
    let updatedCount = 0;
    db.jobEntries = db.jobEntries.map((e: JobEntry) => {
      if (idSet.has(e.id) && e.status === 'Pending') {
        updatedCount++;
        return { ...e, status: 'Paid' as const, paymentDate };
      }
      return e;
    });
    await writeDB(db);
    res.json({ updatedCount });
  });
}));

// Edit own Pending job entry (input mistakes only - once Paid, immutable)
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
    if (entry.status !== 'Pending') {
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
