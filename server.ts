import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { Product, Order, OrderStatus, DashboardStats, StoreSettings } from './src/types';
import { defaultProducts } from './db/defaultProducts';
import { defaultSettings } from './db/defaultSettings';
import { initPostgresPool, seedPostgresIfEmpty, readDBPostgres, writeDBPostgres } from './db/postgres';
import { calculateRentalCost, calculateLegacyRentalCost } from './src/pricing';

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'server_db.json');

// Middleware
app.use(express.json({ limit: '10mb' }));

// ---------------- DUAL-MODE PERSISTENCE ----------------
// If DATABASE_URL is set at boot, all reads/writes go through Postgres exclusively.
// Otherwise, falls back to the local server_db.json file (unchanged from before).
// This is an exclusive boot-time branch, never both at once.

let readDB: () => Promise<{ products: Product[]; orders: Order[]; settings: StoreSettings }>;
let writeDB: (data: { products: Product[]; orders: Order[]; settings: StoreSettings }) => Promise<void>;

function seedJsonFileIfMissing(): void {
  if (!fs.existsSync(DB_FILE)) {
    const dbData = {
      products: defaultProducts,
      orders: [] as Order[],
      settings: defaultSettings,
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
        // Old server_db.json files predate the settings feature - never crash on a
        // missing key, just fall back to defaults until the next write persists them.
        if (!parsed.settings) parsed.settings = defaultSettings;
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

// Auth Helper Middleware
function authenticateAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token === 'bilbo-outdoors-admin-token-2026') {
      return next();
    }
  }
  res.status(401).json({ error: 'Unauthorized. Admin credentials required.' });
}

// ---------------- API ENDPOINTS ----------------

// Staff Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'bilbooutdoor2026') {
    res.json({ token: 'bilbo-outdoors-admin-token-2026', username: 'Admin Staff' });
  } else {
    res.status(401).json({ error: 'Invalid username or password. Use: admin / bilbooutdoor2026' });
  }
});

// Get Products (available to both clients and admins)
app.get('/api/products', asyncHandler(async (req, res) => {
  const db = await readDB();
  res.json(db.products);
}));

// Admin CRUD: Create Product
app.post('/api/products', authenticateAdmin, asyncHandler(async (req, res) => {
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
app.put('/api/products/:id', authenticateAdmin, asyncHandler(async (req, res) => {
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
app.delete('/api/products/:id', authenticateAdmin, asyncHandler(async (req, res) => {
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
  const relevantOrders = orders.filter(o => o.status !== 'Item Returned/Completed' || o.returnedAt);

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

// Check Availability (Available to clients and admins)
app.post('/api/check-availability', asyncHandler(async (req, res) => {
  const { startDate, endDate, items } = req.body; // items is optional array of { productId, quantity }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing start date or end date.' });
  }

  const db = await readDB();
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
}));

// Submit Order (Clients)
app.post('/api/orders', asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { customerName, customerWhatsApp, startDate, endDate, items, personalPhotoBase64 } = req.body;

    if (!customerName || !customerWhatsApp || !startDate || !endDate || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order fields.' });
    }

    const db = await readDB();

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

    res.status(201).json(newOrder);
  });
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
app.get('/api/orders', authenticateAdmin, asyncHandler(async (req, res) => {
  const db = await readDB();
  res.json(db.orders);
}));

// Admin: Update order status
app.put('/api/orders/:id/status', authenticateAdmin, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { status, pickupIdType } = req.body;

    const validStatuses: OrderStatus[] = ['Pending', 'Approved/Paid', 'Item Picked Up', 'Item Returned/Completed'];
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
app.post('/api/orders/:id/calculate-late', authenticateAdmin, asyncHandler(async (req, res) => {
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

    // Strict wall-clock tolerance (does not pause for hours the store is closed):
    // the first `lateToleranceHours` past closing time are free, then the fee
    // escalates in 24-hour buckets counted from the deadline itself.
    const hoursLate = Math.max(0, (actualReturn.getTime() - deadline.getTime()) / (1000 * 60 * 60));
    const lateDays = hoursLate <= db.settings.lateToleranceHours ? 0 : Math.ceil(hoursLate / 24);

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
app.get('/api/settings', authenticateAdmin, asyncHandler(async (req, res) => {
  const db = await readDB();
  res.json(db.settings);
}));

app.put('/api/settings', authenticateAdmin, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { lateToleranceHours, operatingHours } = req.body;
    const db = await readDB();
    db.settings = { lateToleranceHours, operatingHours };
    await writeDB(db);
    res.json(db.settings);
  });
}));

// Admin: Get Dashboard Stats
app.get('/api/stats', authenticateAdmin, asyncHandler(async (req, res) => {
  const db = await readDB();
  const orders: Order[] = db.orders;

  const todayStr = new Date().toISOString().split('T')[0];

  // Active rentals = orders that have been approved or items picked up
  const activeRentalsCount = orders.filter(o => o.status === 'Approved/Paid' || o.status === 'Item Picked Up').length;

  // Total Revenue = Sum of totalPrice of all Approved, Picked Up, and Completed orders, plus any late fees
  const finishedOrPaidOrders = orders.filter(o => o.status !== 'Pending');
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
