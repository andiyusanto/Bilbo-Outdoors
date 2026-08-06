import pg from 'pg';
import dns from 'dns';
import { Product, Order, OrderItem, StoreSettings, AppUser, JobPriceListItem, JobEntry } from '../src/types';
import { defaultProducts } from './defaultProducts';
import { defaultSettings } from './defaultSettings';
import { defaultUsers } from './defaultUsers';
import { defaultJobPriceList } from './defaultJobPriceList';

let pool: pg.Pool;

export function initPostgresPool(connectionString: string): void {
  // Supabase's pooler host is dual-stack (A + AAAA). Prefer IPv4 so this doesn't
  // fail with ENETUNREACH on networks without a working IPv6 route.
  dns.setDefaultResultOrder('ipv4first');

  // node-postgres auto-parses the DATE oid into a JS Date constructed from local
  // calendar components, which then re-serializes via the *server's* local
  // timezone offset - silently shifting the calendar day whenever that offset
  // isn't zero. This app treats start_date/end_date as plain 'YYYY-MM-DD' text
  // (matching JSON-file mode and the schema's intent, even where the live table
  // is actually typed DATE rather than the VARCHAR the README documents), so
  // disable the auto-parse and keep the raw wire string. OID 1082 = date.
  pg.types.setTypeParser(1082, (val: string) => val);

  pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

  // Mandatory: an error on an idle pooled connection (e.g. Supabase dropping a
  // stale connection) throws unhandled and crashes the process otherwise.
  pool.on('error', (err) => {
    console.error('Unexpected idle Postgres pool error:', err);
  });
}

export async function seedPostgresIfEmpty(): Promise<void> {
  const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM products');
  const count = countRes.rows[0].count;
  if (count === 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const params: any[] = [];
      defaultProducts.forEach((p) => {
        params.push(p.id, p.name, p.category, p.rates.day1Price, p.rates.day2Price, p.rates.day3Price, p.rates.day4Price, p.rates.day5Price, p.rates.extraDayRate, p.readinessHours || 0, p.stock, p.description || '', p.image || '', p.varian || '', p.size || '', p.color || '');
      });
      await client.query(
        `INSERT INTO products (id, name, category, day1_price, day2_price, day3_price, day4_price, day5_price, extra_day_rate, readiness_hours, stock, description, image, varian, size, color)
         VALUES ${buildValuesClause(defaultProducts.length, 16)}
         ON CONFLICT (id) DO NOTHING`,
        params
      );
      await client.query('COMMIT');
      console.log('Postgres seeded successfully with default product catalog.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Independent of the products check above - an existing deployment (products
  // already seeded long ago) still needs its one settings row seeded the first
  // time this runs after the `settings` table migration lands.
  const settingsCountRes = await pool.query('SELECT COUNT(*)::int AS count FROM settings');
  if (settingsCountRes.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO settings (id, late_tolerance_hours, operating_hours, footer, running_text)
       VALUES (1, $1, $2::jsonb, $3::jsonb, $4)
       ON CONFLICT (id) DO NOTHING`,
      [defaultSettings.lateToleranceHours, JSON.stringify(defaultSettings.operatingHours), JSON.stringify(defaultSettings.footer), defaultSettings.runningText]
    );
    console.log('Postgres seeded successfully with default store settings.');
  }

  // Same independence: seed the default owner account once, whenever the
  // users table is first found empty (fresh deploy or post-migration).
  const usersCountRes = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (usersCountRes.rows[0].count === 0) {
    const params: any[] = [];
    defaultUsers.forEach((u) => {
      params.push(u.id, u.username, u.passwordHash, u.passwordSalt, u.role, u.displayName, u.active ?? true, u.sessionToken ?? null, u.createdAt);
    });
    await pool.query(
      `INSERT INTO users (id, username, password_hash, password_salt, role, display_name, active, session_token, created_at)
       VALUES ${buildValuesClause(defaultUsers.length, 9)}
       ON CONFLICT (id) DO NOTHING`,
      params
    );
    console.log('Postgres seeded successfully with default owner account.');
  }

  // Job price list: same independence, seeded once from the owner's master sheet.
  const jobPricesCountRes = await pool.query('SELECT COUNT(*)::int AS count FROM job_price_list');
  if (jobPricesCountRes.rows[0].count === 0) {
    const params: any[] = [];
    defaultJobPriceList.forEach((j) => {
      params.push(j.id, j.itemName, j.cleaningPrice ?? null, j.laundryPrice ?? null, j.inventarisPrice ?? null, j.active ?? true, j.productIds && j.productIds.length > 0 ? j.productIds : null);
    });
    await pool.query(
      `INSERT INTO job_price_list (id, item_name, cleaning_price, laundry_price, inventaris_price, active, product_ids)
       VALUES ${buildValuesClause(defaultJobPriceList.length, 7)}
       ON CONFLICT (id) DO NOTHING`,
      params
    );
    console.log('Postgres seeded successfully with default job price list.');
  }
}

// node-postgres returns NUMERIC/DECIMAL columns as strings, not numbers, to avoid
// float precision loss. Every numeric column must be explicitly converted here,
// or downstream code (e.g. `calculateRentalCost`'s arithmetic) would silently do
// string concatenation instead of addition.
//
// Schema note: this file, migrate-to-supabase.js, and README.md's documented DDL
// must all stay in sync with each other for the products/orders/order_items
// column lists - this project has already had to touch all 3 together twice
// (discount_min_days, confirmation_token), and a third time for this pricing
// schema migration (day*_price/extra_day_rate/readiness_hours/returned_at).
function rowToProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    rates: {
      day1Price: Number(row.day1_price),
      day2Price: Number(row.day2_price),
      day3Price: Number(row.day3_price),
      day4Price: Number(row.day4_price),
      day5Price: Number(row.day5_price),
      extraDayRate: Number(row.extra_day_rate),
    },
    readinessHours: Number(row.readiness_hours ?? 0),
    stock: Number(row.stock),
    description: row.description ?? '',
    image: row.image ?? '',
    varian: row.varian ?? '',
    size: row.size ?? '',
    color: row.color ?? '',
  };
}

function rowToOrderItem(row: any): OrderItem {
  const hasNewRates = row.day1_price !== null && row.day1_price !== undefined;
  return {
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    ratesSnapshot: hasNewRates ? {
      day1Price: Number(row.day1_price),
      day2Price: Number(row.day2_price),
      day3Price: Number(row.day3_price),
      day4Price: Number(row.day4_price),
      day5Price: Number(row.day5_price),
      extraDayRate: Number(row.extra_day_rate),
    } : undefined,
    legacyPricePerDay: row.price_per_day !== null && row.price_per_day !== undefined ? Number(row.price_per_day) : undefined,
    legacyIncrementalPrice: row.incremental_price !== null && row.incremental_price !== undefined ? Number(row.incremental_price) : undefined,
    legacyDiscountThresholdDays: row.discount_threshold_days !== null && row.discount_threshold_days !== undefined ? Number(row.discount_threshold_days) : undefined,
  };
}

function rowToOrder(row: any, items: OrderItem[]): Order {
  return {
    id: row.id,
    confirmationToken: row.confirmation_token ?? undefined,
    customerName: row.customer_name,
    customerWhatsApp: row.customer_whatsapp,
    startDate: row.start_date,
    endDate: row.end_date,
    rentDuration: Number(row.rent_duration),
    items,
    totalPrice: Number(row.total_price),
    personalPhotoBase64: row.id_card_base64 ?? '',
    status: row.status,
    createdAt: row.created_at,
    returnedAt: row.returned_at ?? undefined,
    pickupIdType: row.pickup_id_type ?? undefined,
    lateDays: Number(row.late_days || 0),
    lateFee: Number(row.late_fee || 0),
  };
}

function rowToSettings(row: any): StoreSettings {
  return {
    lateToleranceHours: Number(row.late_tolerance_hours),
    operatingHours: row.operating_hours, // JSONB - pg already parses this into a plain object
    footer: row.footer ?? defaultSettings.footer,
    runningText: row.running_text ?? defaultSettings.runningText,
  };
}

function rowToUser(row: any): AppUser {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    role: row.role,
    displayName: row.display_name,
    active: row.active !== null && row.active !== undefined ? Boolean(row.active) : true,
    sessionToken: row.session_token ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToJobPriceItem(row: any): JobPriceListItem {
  return {
    id: row.id,
    itemName: row.item_name,
    cleaningPrice: row.cleaning_price !== null && row.cleaning_price !== undefined ? Number(row.cleaning_price) : undefined,
    laundryPrice: row.laundry_price !== null && row.laundry_price !== undefined ? Number(row.laundry_price) : undefined,
    inventarisPrice: row.inventaris_price !== null && row.inventaris_price !== undefined ? Number(row.inventaris_price) : undefined,
    active: row.active !== null && row.active !== undefined ? Boolean(row.active) : true,
    productIds: row.product_ids && row.product_ids.length > 0 ? row.product_ids : undefined,
  };
}

function rowToJobEntry(row: any): JobEntry {
  return {
    id: row.id,
    employeeUserId: row.employee_user_id,
    employeeName: row.employee_name,
    entryDate: row.entry_date,
    itemName: row.item_name,
    jobType: row.job_type,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    total: Number(row.total),
    status: row.status,
    paymentDate: row.payment_date ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    createdAt: row.created_at,
  };
}

export async function readDBPostgres(): Promise<{ products: Product[]; orders: Order[]; settings: StoreSettings; users: AppUser[]; jobPriceList: JobPriceListItem[]; jobEntries: JobEntry[] }> {
  // These 7 queries don't depend on each other - run them concurrently rather
  // than sequentially. Each pool.query() round trip to the Supabase pooler
  // measured ~0.6-0.7s in this environment (see buildValuesClause below), so
  // awaiting them one at a time was paying that cost 7x on every single
  // readDB() call (e.g. GET /api/products, which only needs `products`).
  const [productsRes, ordersRes, itemsRes, settingsRes, usersRes, jobPriceListRes, jobEntriesRes] = await Promise.all([
    pool.query('SELECT * FROM products ORDER BY category ASC, id ASC'),
    pool.query('SELECT * FROM orders ORDER BY created_at DESC'),
    pool.query('SELECT * FROM order_items'),
    pool.query('SELECT * FROM settings WHERE id = 1'),
    pool.query('SELECT * FROM users ORDER BY created_at ASC'),
    pool.query('SELECT * FROM job_price_list ORDER BY item_name ASC'),
    pool.query('SELECT * FROM job_entries ORDER BY created_at DESC'),
  ]);

  const products = productsRes.rows.map(rowToProduct);

  const itemsByOrderId = new Map<string, OrderItem[]>();
  for (const itemRow of itemsRes.rows) {
    const list = itemsByOrderId.get(itemRow.order_id) || [];
    list.push(rowToOrderItem(itemRow));
    itemsByOrderId.set(itemRow.order_id, list);
  }

  const orders = ordersRes.rows.map((row) => rowToOrder(row, itemsByOrderId.get(row.id) || []));

  // Defensive fallback (never crash) if the settings row hasn't been seeded yet on
  // this connection - mirrors the same fallback the JSON-file mode does for an
  // old server_db.json predating this feature.
  const settings = settingsRes.rows[0] ? rowToSettings(settingsRes.rows[0]) : defaultSettings;

  const users = usersRes.rows.length > 0 ? usersRes.rows.map(rowToUser) : defaultUsers;

  const jobPriceList = jobPriceListRes.rows.length > 0 ? jobPriceListRes.rows.map(rowToJobPriceItem) : defaultJobPriceList;

  const jobEntries = jobEntriesRes.rows.map(rowToJobEntry);

  return { products, orders, settings, users, jobPriceList, jobEntries };
}

// Builds a `VALUES ($1,$2,...),($n+1,$n+2,...),...` clause plus the flattened
// params array for a multi-row INSERT, so a full-dataset sync costs a handful of
// round trips instead of one per row. On a connection with real network latency
// to Supabase (measured ~0.6-0.7s per round trip in this environment), looping
// row-by-row for ~30 products would take 20-30s per write - unacceptable for a
// single admin action like a stock adjustment - whereas one batched statement
// costs the same single round trip regardless of row count.
function buildValuesClause(rowCount: number, colsPerRow: number): string {
  const rows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const base = r * colsPerRow;
    const placeholders = Array.from({ length: colsPerRow }, (_, c) => `$${base + c + 1}`);
    rows.push(`(${placeholders.join(', ')})`);
  }
  return rows.join(', ');
}

export async function writeDBPostgres(data: { products: Product[]; orders: Order[]; settings: StoreSettings; users: AppUser[]; jobPriceList: JobPriceListItem[]; jobEntries: JobEntry[] }): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Settings: single-row upsert, no batching helper needed.
    await client.query(
      `INSERT INTO settings (id, late_tolerance_hours, operating_hours, footer, running_text)
       VALUES (1, $1, $2::jsonb, $3::jsonb, $4)
       ON CONFLICT (id) DO UPDATE SET
         late_tolerance_hours = EXCLUDED.late_tolerance_hours,
         operating_hours = EXCLUDED.operating_hours,
         footer = EXCLUDED.footer,
         running_text = EXCLUDED.running_text`,
      [Number(data.settings.lateToleranceHours), JSON.stringify(data.settings.operatingHours), JSON.stringify(data.settings.footer), data.settings.runningText]
    );

    // Users: batched upsert of everything present, then prune anything removed -
    // same list convention as products/orders. Users are pruned by a normal
    // write now too, via the Manajemen User tab's delete action, not just in
    // theory.
    if (data.users.length > 0) {
      const params: any[] = [];
      data.users.forEach((u) => {
        params.push(u.id, u.username, u.passwordHash, u.passwordSalt, u.role, u.displayName, u.active ?? true, u.sessionToken ?? null, u.createdAt);
      });
      await client.query(
        `INSERT INTO users (id, username, password_hash, password_salt, role, display_name, active, session_token, created_at)
         VALUES ${buildValuesClause(data.users.length, 9)}
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           password_salt = EXCLUDED.password_salt,
           role = EXCLUDED.role,
           display_name = EXCLUDED.display_name,
           active = EXCLUDED.active,
           session_token = EXCLUDED.session_token,
           created_at = EXCLUDED.created_at`,
        params
      );
    }
    const userIds = data.users.map((u) => u.id);
    await client.query(
      userIds.length > 0 ? 'DELETE FROM users WHERE id <> ALL($1::varchar[])' : 'DELETE FROM users',
      userIds.length > 0 ? [userIds] : []
    );

    // Job price list: same batched upsert+prune list convention.
    if (data.jobPriceList.length > 0) {
      const params: any[] = [];
      data.jobPriceList.forEach((j) => {
        params.push(j.id, j.itemName, j.cleaningPrice ?? null, j.laundryPrice ?? null, j.inventarisPrice ?? null, j.active !== undefined ? j.active : true, j.productIds && j.productIds.length > 0 ? j.productIds : null);
      });
      await client.query(
        `INSERT INTO job_price_list (id, item_name, cleaning_price, laundry_price, inventaris_price, active, product_ids)
         VALUES ${buildValuesClause(data.jobPriceList.length, 7)}
         ON CONFLICT (id) DO UPDATE SET
           item_name = EXCLUDED.item_name,
           cleaning_price = EXCLUDED.cleaning_price,
           laundry_price = EXCLUDED.laundry_price,
           inventaris_price = EXCLUDED.inventaris_price,
           active = EXCLUDED.active,
           product_ids = EXCLUDED.product_ids`,
        params
      );
    }
    const jobPriceIds = data.jobPriceList.map((j) => j.id);
    await client.query(
      jobPriceIds.length > 0 ? 'DELETE FROM job_price_list WHERE id <> ALL($1::varchar[])' : 'DELETE FROM job_price_list',
      jobPriceIds.length > 0 ? [jobPriceIds] : []
    );

    // Job entries: same batched upsert+prune list convention.
    if (data.jobEntries.length > 0) {
      const params: any[] = [];
      data.jobEntries.forEach((e) => {
        params.push(e.id, e.employeeUserId, e.employeeName, e.entryDate, e.itemName, e.jobType, Number(e.unitPrice), Number(e.quantity), Number(e.total), e.status, e.paymentDate ?? null, e.rejectionReason ?? null, e.rejectedAt ?? null, e.createdAt);
      });
      await client.query(
        `INSERT INTO job_entries (id, employee_user_id, employee_name, entry_date, item_name, job_type, unit_price, quantity, total, status, payment_date, rejection_reason, rejected_at, created_at)
         VALUES ${buildValuesClause(data.jobEntries.length, 14)}
         ON CONFLICT (id) DO UPDATE SET
           employee_user_id = EXCLUDED.employee_user_id,
           employee_name = EXCLUDED.employee_name,
           entry_date = EXCLUDED.entry_date,
           item_name = EXCLUDED.item_name,
           job_type = EXCLUDED.job_type,
           unit_price = EXCLUDED.unit_price,
           quantity = EXCLUDED.quantity,
           total = EXCLUDED.total,
           status = EXCLUDED.status,
           payment_date = EXCLUDED.payment_date,
           rejection_reason = EXCLUDED.rejection_reason,
           rejected_at = EXCLUDED.rejected_at,
           created_at = EXCLUDED.created_at`,
        params
      );
    }
    const jobEntryIds = data.jobEntries.map((e) => e.id);
    await client.query(
      jobEntryIds.length > 0 ? 'DELETE FROM job_entries WHERE id <> ALL($1::varchar[])' : 'DELETE FROM job_entries',
      jobEntryIds.length > 0 ? [jobEntryIds] : []
    );

    // Products: batched upsert of everything present, then prune anything removed
    if (data.products.length > 0) {
      const params: any[] = [];
      data.products.forEach((p) => {
        params.push(p.id, p.name, p.category, Number(p.rates.day1Price), Number(p.rates.day2Price), Number(p.rates.day3Price), Number(p.rates.day4Price), Number(p.rates.day5Price), Number(p.rates.extraDayRate), Number(p.readinessHours || 0), Number(p.stock), p.description || '', p.image || '', p.varian || '', p.size || '', p.color || '');
      });
      await client.query(
        `INSERT INTO products (id, name, category, day1_price, day2_price, day3_price, day4_price, day5_price, extra_day_rate, readiness_hours, stock, description, image, varian, size, color)
         VALUES ${buildValuesClause(data.products.length, 16)}
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           day1_price = EXCLUDED.day1_price,
           day2_price = EXCLUDED.day2_price,
           day3_price = EXCLUDED.day3_price,
           day4_price = EXCLUDED.day4_price,
           day5_price = EXCLUDED.day5_price,
           extra_day_rate = EXCLUDED.extra_day_rate,
           readiness_hours = EXCLUDED.readiness_hours,
           stock = EXCLUDED.stock,
           description = EXCLUDED.description,
           image = EXCLUDED.image,
           varian = EXCLUDED.varian,
           size = EXCLUDED.size,
           color = EXCLUDED.color`,
        params
      );
    }
    const productIds = data.products.map((p) => p.id);
    await client.query(
      productIds.length > 0 ? 'DELETE FROM products WHERE id <> ALL($1::varchar[])' : 'DELETE FROM products',
      productIds.length > 0 ? [productIds] : []
    );

    // Orders: batched upsert of everything present, then prune anything removed
    if (data.orders.length > 0) {
      const params: any[] = [];
      data.orders.forEach((o) => {
        params.push(
          o.id,
          o.customerName,
          o.customerWhatsApp,
          o.startDate,
          o.endDate,
          Number(o.rentDuration),
          Number(o.totalPrice),
          o.personalPhotoBase64 || '',
          o.status,
          o.createdAt,
          Number(o.lateDays || 0),
          Number(o.lateFee || 0),
          o.confirmationToken ?? null,
          o.returnedAt ?? null,
          o.pickupIdType ?? null
        );
      });
      await client.query(
        `INSERT INTO orders (id, customer_name, customer_whatsapp, start_date, end_date, rent_duration, total_price, id_card_base64, status, created_at, late_days, late_fee, confirmation_token, returned_at, pickup_id_type)
         VALUES ${buildValuesClause(data.orders.length, 15)}
         ON CONFLICT (id) DO UPDATE SET
           customer_name = EXCLUDED.customer_name,
           customer_whatsapp = EXCLUDED.customer_whatsapp,
           start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date,
           rent_duration = EXCLUDED.rent_duration,
           total_price = EXCLUDED.total_price,
           id_card_base64 = EXCLUDED.id_card_base64,
           status = EXCLUDED.status,
           created_at = EXCLUDED.created_at,
           late_days = EXCLUDED.late_days,
           late_fee = EXCLUDED.late_fee,
           confirmation_token = EXCLUDED.confirmation_token,
           returned_at = EXCLUDED.returned_at,
           pickup_id_type = EXCLUDED.pickup_id_type`,
        params
      );
    }

    // Order items: full-replace per present order (delete all, then batched re-insert),
    // in one round trip each rather than one delete+insert pair per order.
    const orderIds = data.orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await client.query('DELETE FROM order_items WHERE order_id = ANY($1::varchar[])', [orderIds]);
    }
    // Carries BOTH the new rate-table columns and the legacy pre-migration columns
    // on every row, regardless of which set a given item actually has - this is a
    // full delete+reinsert of ALL order_items on every write (see comment above),
    // so omitting either set here would permanently null out that data on the
    // very next unrelated write. Only one set is ever non-null per row in practice.
    const flatItems = data.orders.flatMap((o) => o.items.map((item) => ({ orderId: o.id, item })));
    if (flatItems.length > 0) {
      const params: any[] = [];
      flatItems.forEach(({ orderId, item }) => {
        params.push(
          orderId,
          item.productId,
          item.productName,
          Number(item.quantity),
          item.ratesSnapshot ? Number(item.ratesSnapshot.day1Price) : null,
          item.ratesSnapshot ? Number(item.ratesSnapshot.day2Price) : null,
          item.ratesSnapshot ? Number(item.ratesSnapshot.day3Price) : null,
          item.ratesSnapshot ? Number(item.ratesSnapshot.day4Price) : null,
          item.ratesSnapshot ? Number(item.ratesSnapshot.day5Price) : null,
          item.ratesSnapshot ? Number(item.ratesSnapshot.extraDayRate) : null,
          item.legacyPricePerDay !== undefined ? Number(item.legacyPricePerDay) : null,
          item.legacyIncrementalPrice !== undefined ? Number(item.legacyIncrementalPrice) : null,
          item.legacyDiscountThresholdDays !== undefined ? Number(item.legacyDiscountThresholdDays) : null,
        );
      });
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, day1_price, day2_price, day3_price, day4_price, day5_price, extra_day_rate, price_per_day, incremental_price, discount_threshold_days)
         VALUES ${buildValuesClause(flatItems.length, 13)}`,
        params
      );
    }

    // Prune orders no longer present (cascades their order_items via FK, though
    // those were already excluded above since they're not in data.orders)
    await client.query(
      orderIds.length > 0 ? 'DELETE FROM orders WHERE id <> ALL($1::varchar[])' : 'DELETE FROM orders',
      orderIds.length > 0 ? [orderIds] : []
    );

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}
