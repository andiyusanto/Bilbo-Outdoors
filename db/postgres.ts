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
    // Now that reads are narrowed to single-table queries (see
    // readProductsPostgres et al.), peak concurrent query count is ~11 (7
    // login-time GET routes, 2 of which - orders/stats - fan out into 2-3
    // queries each) rather than the ~49 a single readDB() call used to cause
    // under concurrent requests.
    //
    // CORRECTED (2026-08-20, after a production outage): this was previously
    // set to 15, reasoning that Supabase's free tier "allows 200 pooler
    // client connections" - that number is real but is the pooler's
    // client-facing capacity, a different layer from the actual constraint.
    // Session-mode pooling (which this app uses, per the Session Pooler
    // connection string CLAUDE.md documents) caps concurrent backend
    // connections at the project's own "Pool Size" setting (Supabase
    // dashboard -> Database -> Connection Pooling) - which was ALSO 15 for
    // this project, confirmed by the literal error this outage produced:
    // "(EMAXCONNSESSION) max clients reached in session mode - max clients
    // are limited to pool_size: 15". Setting our own max to exactly match
    // left zero headroom - a rolling Render deploy briefly runs the old and
    // new instance simultaneously, each with its own pool, so two instances
    // at max:15 could demand 30 connections against a 15-connection ceiling.
    // Lowered to 7 so even two overlapping instances (14 total) stay safely
    // under it, while still comfortably covering the ~11-query peak above.
    max: 7,
    // node-postgres's default (10s) was closing pooled connections between
    // distinct admin logins/actions, forcing the next request to eat a fresh
    // TCP+TLS+Postgres-auth handshake before its query even ran - a flat tax
    // that dominates the fast single-table routes' actual query time far
    // more than it does orders/stats's already-slower ones (observed as the
    // fast routes randomly jumping from ~300ms to ~800-900ms between one
    // production reload and the next, while orders/stats stayed flat).
    // 60s matches the orders-list background poll (useAdminData.ts), so at
    // least that connection stays warm continuously during an open session.
    idleTimeoutMillis: 60000,
    // TCP keepalive so a longer-lived idle connection doesn't get silently
    // dropped by a NAT/firewall in between Supabase and this box, which would
    // otherwise surface as a hidden query failure instead of a clean reconnect.
    keepAlive: true,
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
      `INSERT INTO settings (id, late_tolerance_hours, pending_expiry_hours, operating_hours, footer, running_text)
       VALUES (1, $1, $2, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (id) DO NOTHING`,
      [defaultSettings.lateToleranceHours, defaultSettings.pendingExpiryHours, JSON.stringify(defaultSettings.operatingHours), JSON.stringify(defaultSettings.footer), defaultSettings.runningText]
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
    pickedUpAt: row.picked_up_at ?? undefined,
    pickupIdType: row.pickup_id_type ?? undefined,
    lateDays: Number(row.late_days || 0),
    lateFee: Number(row.late_fee || 0),
    amountPaid: row.amount_paid !== null && row.amount_paid !== undefined ? Number(row.amount_paid) : undefined,
    statusHistory: row.status_history ?? [],
    penalties: row.penalties ?? [],
    paymentMethod: row.payment_method ?? undefined,
    paymentChannel: row.payment_channel ?? undefined,
    paymentInstruction: row.payment_instruction ?? undefined, // JSONB - pg already parses this into a plain object
    wuzzpayTransactionId: row.wuzzpay_transaction_id ?? undefined,
    wuzzpayProvider: row.wuzzpay_provider ?? undefined,
    wuzzpayLastStatus: row.wuzzpay_last_status ?? undefined,
  };
}

function rowToSettings(row: any): StoreSettings {
  return {
    lateToleranceHours: Number(row.late_tolerance_hours),
    pendingExpiryHours: row.pending_expiry_hours !== null && row.pending_expiry_hours !== undefined ? Number(row.pending_expiry_hours) : defaultSettings.pendingExpiryHours,
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

// Narrow, single-table reads - used by the read-only GET routes that only
// ever need one table (server.ts's GET /api/products, /api/settings, etc.)
// instead of readDB()'s full 7-query fan-out. Same rationale as the auth
// accessors above: once the frontend fires several of these GET routes
// concurrently (see useAdminData.ts's fetchAdminData), each one calling the
// full readDB() multiplies into far more simultaneous queries than
// initPostgresPool's max:5 connections can serve at once, turning a handful
// of sub-KB responses into multi-second waits from pool queueing alone.
export async function readProductsPostgres(): Promise<Product[]> {
  const res = await pool.query('SELECT * FROM products ORDER BY category ASC, id ASC');
  return res.rows.map(rowToProduct);
}

// Explicit column list, NOT `SELECT *` - deliberately excludes id_card_base64
// (legacy inline base64 photo text/TOAST) and personal_photo_path (the newer
// Supabase Storage object path - see server.ts's PERSONAL_PHOTO_STORAGE_ENABLED).
// Confirmed 2026-08-22 against production: only 71 orders, but 47MB of raw
// photo text (up to ~3MB each) - readOrdersPostgres runs on nearly every route
// in this app (including the payment-status poll, hit every 5s per open
// customer payment tab), so pulling that into Node's memory on every single
// call was a real, measured contributor to a Render OOM crash. Even though
// personal_photo_path itself is tiny (just a string), it's excluded here too,
// for defense in depth - photo access (whichever storage form backs it)
// should only ever be resolved on-demand by the one route that needs it, not
// scattered across every route's in-memory order objects. rowToOrder's
// `row.id_card_base64 ?? ''` already defaults personalPhotoBase64 to '' when
// the column isn't selected - safe as long as nothing re-persists this
// now-empty value over a real stored photo (see writeOrdersWithClient's ON
// CONFLICT clause, which deliberately excludes both photo columns from its
// SET list for the same reason - both are only ever set once at order
// creation, never modified afterward, so the bulk upsert never needs to touch
// them again). The one place that needs the real photo (GET /api/orders/:id)
// fetches it separately via readOrderPhotoPostgres.
const ORDER_COLUMNS_NO_PHOTO = `id, customer_name, customer_whatsapp, start_date, end_date, rent_duration,
  total_price, status, created_at, late_days, late_fee, confirmation_token, returned_at, picked_up_at,
  pickup_id_type, amount_paid, status_history, penalties, payment_method, payment_channel,
  payment_instruction, wuzzpay_transaction_id, wuzzpay_provider, wuzzpay_last_status`;

export async function readOrdersPostgres(): Promise<Order[]> {
  const [ordersRes, itemsRes] = await Promise.all([
    pool.query(`SELECT ${ORDER_COLUMNS_NO_PHOTO} FROM orders ORDER BY created_at DESC`),
    pool.query('SELECT * FROM order_items'),
  ]);
  const itemsByOrderId = new Map<string, OrderItem[]>();
  for (const itemRow of itemsRes.rows) {
    const list = itemsByOrderId.get(itemRow.order_id) || [];
    list.push(rowToOrderItem(itemRow));
    itemsByOrderId.set(itemRow.order_id, list);
  }
  return ordersRes.rows.map((row) => rowToOrder(row, itemsByOrderId.get(row.id) || []));
}

// Narrow fetch for the one place that needs the real photo (GET
// /api/orders/:id, per readOrdersPostgres's own comment) - a targeted
// single-row SELECT, not a burden on the frequently-called full orders read.
// Returns the raw row data for BOTH possible photo storage forms rather than
// resolving which one "wins" here - turning a storagePath into an actual
// usable URL means calling Supabase's Storage REST API, which is an HTTP
// concern that belongs in server.ts, not this Postgres-only module.
export async function readOrderPhotoPostgres(orderId: string): Promise<{ base64: string; storagePath: string | null }> {
  const res = await pool.query('SELECT id_card_base64, personal_photo_path FROM orders WHERE id = $1', [orderId]);
  const row = res.rows[0];
  return { base64: row?.id_card_base64 ?? '', storagePath: row?.personal_photo_path ?? null };
}

export async function readSettingsPostgres(): Promise<StoreSettings> {
  const res = await pool.query('SELECT * FROM settings WHERE id = 1');
  // Defensive fallback (never crash) if the settings row hasn't been seeded yet on
  // this connection - mirrors the same fallback the JSON-file mode does for an
  // old server_db.json predating this feature.
  return res.rows[0] ? rowToSettings(res.rows[0]) : defaultSettings;
}

export async function readUsersPostgres(): Promise<AppUser[]> {
  const res = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
  return res.rows.length > 0 ? res.rows.map(rowToUser) : defaultUsers;
}

export async function readJobPriceListPostgres(): Promise<JobPriceListItem[]> {
  const res = await pool.query('SELECT * FROM job_price_list ORDER BY item_name ASC');
  return res.rows.length > 0 ? res.rows.map(rowToJobPriceItem) : defaultJobPriceList;
}

export async function readJobEntriesPostgres(): Promise<JobEntry[]> {
  const res = await pool.query('SELECT * FROM job_entries ORDER BY created_at DESC');
  return res.rows.map(rowToJobEntry);
}

export async function readDBPostgres(): Promise<{ products: Product[]; orders: Order[]; settings: StoreSettings; users: AppUser[]; jobPriceList: JobPriceListItem[]; jobEntries: JobEntry[] }> {
  // These don't depend on each other - run them concurrently rather than
  // sequentially. Composed from the narrow readers above so the full-dataset
  // contract (fetchAdminData, and every write handler's readDB() call) stays
  // byte-for-byte identical to before this was split apart.
  const [products, orders, settings, users, jobPriceList, jobEntries] = await Promise.all([
    readProductsPostgres(),
    readOrdersPostgres(),
    readSettingsPostgres(),
    readUsersPostgres(),
    readJobPriceListPostgres(),
    readJobEntriesPostgres(),
  ]);

  return { products, orders, settings, users, jobPriceList, jobEntries };
}

// Narrow, single-row auth operations - used by authenticateUser and the
// login/logout/change-password routes instead of the full readDB()/writeDB()
// round trip. authenticateUser runs on every authenticated request, and
// readDB() reads all 7 tables (even parallelized, that's a full round trip
// for a query that only needs one users row); writeDB() is worse, since its
// ~12+ upsert/prune statements across every table run sequentially (unlike
// readDBPostgres's Promise.all above), so a login/logout/password-change was
// paying that entire cost just to touch 1-3 columns on one row.
//
// This is a deliberate, narrow exception to CLAUDE.md's "don't add a second
// abstraction layer on top of readDB/writeDB - extend the existing one"
// rule: that rule protects the coarse product/order contract (pricing/
// late-fee correctness depends on every handler seeing the same shape of
// data), which none of this touches - it's a single-table, single-row
// accessor for the users table only, justified by a measured perf problem
// the original seam can't solve without breaking its own "full dataset"
// semantics. If this pattern needs to grow beyond auth, revisit whether it
// should become the general seam instead of a carve-out.
function findUserByColumn(column: 'username' | 'session_token' | 'id') {
  return async (value: string): Promise<AppUser | null> => {
    const res = await pool.query(`SELECT * FROM users WHERE ${column} = $1 LIMIT 1`, [value]);
    return res.rows[0] ? rowToUser(res.rows[0]) : null;
  };
}

export const findUserByUsernamePostgres = findUserByColumn('username');
export const findUserBySessionTokenPostgres = findUserByColumn('session_token');
export const findUserByIdPostgres = findUserByColumn('id');

export async function updateUserAuthFieldsPostgres(
  userId: string,
  fields: { sessionToken: string | null; passwordHash?: string; passwordSalt?: string }
): Promise<void> {
  const sets = ['session_token = $1'];
  const params: any[] = [fields.sessionToken];
  if (fields.passwordHash !== undefined) {
    params.push(fields.passwordHash);
    sets.push(`password_hash = $${params.length}`);
  }
  if (fields.passwordSalt !== undefined) {
    params.push(fields.passwordSalt);
    sets.push(`password_salt = $${params.length}`);
  }
  params.push(userId);
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
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

// Orders + order_items batched upsert/prune, sharing an already-open
// transaction client - factored out so both the full writeDBPostgres below
// and the narrow writeOrdersPostgres (used by GET /api/orders and GET
// /api/stats's expire-stale-orders path, so they don't need to write every
// other table just to persist an Expired status flip) run the identical SQL.
async function writeOrdersWithClient(client: pg.PoolClient, orders: Order[]): Promise<void> {
  if (orders.length > 0) {
    const params: any[] = [];
    orders.forEach((o) => {
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
        o.pickedUpAt ?? null,
        o.pickupIdType ?? null,
        o.amountPaid ?? null,
        JSON.stringify(o.statusHistory ?? []),
        JSON.stringify(o.penalties ?? []),
        o.paymentMethod ?? null,
        o.paymentChannel ?? null,
        o.paymentInstruction ? JSON.stringify(o.paymentInstruction) : null,
        o.wuzzpayTransactionId ?? null,
        o.wuzzpayProvider ?? null,
        o.wuzzpayLastStatus ?? null,
        o.personalPhotoStoragePath ?? null
      );
    });
    await client.query(
      `INSERT INTO orders (id, customer_name, customer_whatsapp, start_date, end_date, rent_duration, total_price, id_card_base64, status, created_at, late_days, late_fee, confirmation_token, returned_at, picked_up_at, pickup_id_type, amount_paid, status_history, penalties, payment_method, payment_channel, payment_instruction, wuzzpay_transaction_id, wuzzpay_provider, wuzzpay_last_status, personal_photo_path)
       VALUES ${buildValuesClause(orders.length, 26)}
       ON CONFLICT (id) DO UPDATE SET
         customer_name = EXCLUDED.customer_name,
         customer_whatsapp = EXCLUDED.customer_whatsapp,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         rent_duration = EXCLUDED.rent_duration,
         total_price = EXCLUDED.total_price,
         -- id_card_base64 AND personal_photo_path are BOTH deliberately
         -- excluded from the update - each is only ever set once at order
         -- creation (POST /api/orders), never modified afterward by any
         -- route. Re-setting either here on every write would (a) risk
         -- wiping the real stored value with ''/null whenever the in-memory
         -- order came from readOrdersPostgres's photo-excluding SELECT (see
         -- its own comment), and (b) for id_card_base64 specifically,
         -- re-TOAST an unchanged multi-hundred-KB value on every single order
         -- write - confirmed 2026-08-22 as real production churn (1.79M
         -- TOAST insert/delete cycles against only 71 orders, driven by
         -- frequent writes like the 5s payment-status poll). The INSERT
         -- branch above still saves a new order's photo correctly either
         -- way; only re-upserts of an EXISTING row skip both columns.
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at,
         late_days = EXCLUDED.late_days,
         late_fee = EXCLUDED.late_fee,
         confirmation_token = EXCLUDED.confirmation_token,
         returned_at = EXCLUDED.returned_at,
         picked_up_at = EXCLUDED.picked_up_at,
         pickup_id_type = EXCLUDED.pickup_id_type,
         amount_paid = EXCLUDED.amount_paid,
         status_history = EXCLUDED.status_history,
         penalties = EXCLUDED.penalties,
         payment_method = EXCLUDED.payment_method,
         payment_channel = EXCLUDED.payment_channel,
         payment_instruction = EXCLUDED.payment_instruction,
         wuzzpay_transaction_id = EXCLUDED.wuzzpay_transaction_id,
         wuzzpay_provider = EXCLUDED.wuzzpay_provider,
         wuzzpay_last_status = EXCLUDED.wuzzpay_last_status`,
      params
    );
  }

  // Order items: full-replace per present order (delete all, then batched re-insert),
  // in one round trip each rather than one delete+insert pair per order.
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length > 0) {
    await client.query('DELETE FROM order_items WHERE order_id = ANY($1::varchar[])', [orderIds]);
  }
  // Carries BOTH the new rate-table columns and the legacy pre-migration columns
  // on every row, regardless of which set a given item actually has - this is a
  // full delete+reinsert of ALL order_items on every write (see comment above),
  // so omitting either set here would permanently null out that data on the
  // very next unrelated write. Only one set is ever non-null per row in practice.
  const flatItems = orders.flatMap((o) => o.items.map((item) => ({ orderId: o.id, item })));
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
}

export async function writeOrdersPostgres(orders: Order[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await writeOrdersWithClient(client, orders);
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

export async function writeDBPostgres(data: { products: Product[]; orders: Order[]; settings: StoreSettings; users: AppUser[]; jobPriceList: JobPriceListItem[]; jobEntries: JobEntry[] }): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Settings: single-row upsert, no batching helper needed.
    await client.query(
      `INSERT INTO settings (id, late_tolerance_hours, pending_expiry_hours, operating_hours, footer, running_text)
       VALUES (1, $1, $2, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (id) DO UPDATE SET
         late_tolerance_hours = EXCLUDED.late_tolerance_hours,
         pending_expiry_hours = EXCLUDED.pending_expiry_hours,
         operating_hours = EXCLUDED.operating_hours,
         footer = EXCLUDED.footer,
         running_text = EXCLUDED.running_text`,
      [Number(data.settings.lateToleranceHours), Number(data.settings.pendingExpiryHours), JSON.stringify(data.settings.operatingHours), JSON.stringify(data.settings.footer), data.settings.runningText]
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

    await writeOrdersWithClient(client, data.orders);

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
