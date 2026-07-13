import pg from 'pg';
import dns from 'dns';
import { Product, Order, OrderItem } from '../src/types';
import { defaultProducts } from './defaultProducts';

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
  if (count > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const params: any[] = [];
    defaultProducts.forEach((p) => {
      params.push(p.id, p.name, p.category, p.price, p.incrementalPriceAfter5Days || 0, p.discountMinDays ?? 5, p.stock, p.description || '', p.image || '');
    });
    await client.query(
      `INSERT INTO products (id, name, category, price, incremental_price_after_5_days, discount_min_days, stock, description, image)
       VALUES ${buildValuesClause(defaultProducts.length, 9)}
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

// node-postgres returns NUMERIC/DECIMAL columns as strings, not numbers, to avoid
// float precision loss. Every numeric column must be explicitly converted here,
// or downstream code (e.g. `prod.price + prod.incrementalPriceAfter5Days`) would
// silently do string concatenation instead of addition.
function rowToProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    incrementalPriceAfter5Days: Number(row.incremental_price_after_5_days),
    // ?? not || - 0 is a legitimate threshold value ("discounted from day 1"),
    // not just a fallback, unlike incrementalPriceAfter5Days where 0 safely means both.
    discountMinDays: Number(row.discount_min_days ?? 5),
    stock: Number(row.stock),
    description: row.description ?? '',
    image: row.image ?? '',
  };
}

function rowToOrderItem(row: any): OrderItem {
  return {
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    pricePerDay: Number(row.price_per_day),
    incrementalPrice: Number(row.incremental_price),
    discountThresholdDays: Number(row.discount_threshold_days ?? 5),
  };
}

function rowToOrder(row: any, items: OrderItem[]): Order {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerWhatsApp: row.customer_whatsapp,
    startDate: row.start_date,
    endDate: row.end_date,
    rentDuration: Number(row.rent_duration),
    items,
    totalPrice: Number(row.total_price),
    idCardBase64: row.id_card_base64 ?? '',
    status: row.status,
    createdAt: row.created_at,
    lateDays: Number(row.late_days || 0),
    lateFee: Number(row.late_fee || 0),
  };
}

export async function readDBPostgres(): Promise<{ products: Product[]; orders: Order[] }> {
  const productsRes = await pool.query('SELECT * FROM products ORDER BY category ASC, id ASC');
  const products = productsRes.rows.map(rowToProduct);

  const ordersRes = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  const itemsRes = await pool.query('SELECT * FROM order_items');

  const itemsByOrderId = new Map<string, OrderItem[]>();
  for (const itemRow of itemsRes.rows) {
    const list = itemsByOrderId.get(itemRow.order_id) || [];
    list.push(rowToOrderItem(itemRow));
    itemsByOrderId.set(itemRow.order_id, list);
  }

  const orders = ordersRes.rows.map((row) => rowToOrder(row, itemsByOrderId.get(row.id) || []));

  return { products, orders };
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

export async function writeDBPostgres(data: { products: Product[]; orders: Order[] }): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Products: batched upsert of everything present, then prune anything removed
    if (data.products.length > 0) {
      const params: any[] = [];
      data.products.forEach((p) => {
        params.push(p.id, p.name, p.category, Number(p.price), Number(p.incrementalPriceAfter5Days || 0), Number(p.discountMinDays ?? 5), Number(p.stock), p.description || '', p.image || '');
      });
      await client.query(
        `INSERT INTO products (id, name, category, price, incremental_price_after_5_days, discount_min_days, stock, description, image)
         VALUES ${buildValuesClause(data.products.length, 9)}
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           price = EXCLUDED.price,
           incremental_price_after_5_days = EXCLUDED.incremental_price_after_5_days,
           discount_min_days = EXCLUDED.discount_min_days,
           stock = EXCLUDED.stock,
           description = EXCLUDED.description,
           image = EXCLUDED.image`,
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
          o.idCardBase64 || '',
          o.status,
          o.createdAt,
          Number(o.lateDays || 0),
          Number(o.lateFee || 0)
        );
      });
      await client.query(
        `INSERT INTO orders (id, customer_name, customer_whatsapp, start_date, end_date, rent_duration, total_price, id_card_base64, status, created_at, late_days, late_fee)
         VALUES ${buildValuesClause(data.orders.length, 12)}
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
           late_fee = EXCLUDED.late_fee`,
        params
      );
    }

    // Order items: full-replace per present order (delete all, then batched re-insert),
    // in one round trip each rather than one delete+insert pair per order.
    const orderIds = data.orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await client.query('DELETE FROM order_items WHERE order_id = ANY($1::varchar[])', [orderIds]);
    }
    const flatItems = data.orders.flatMap((o) => o.items.map((item) => ({ orderId: o.id, item })));
    if (flatItems.length > 0) {
      const params: any[] = [];
      flatItems.forEach(({ orderId, item }) => {
        params.push(orderId, item.productId, item.productName, Number(item.quantity), Number(item.pricePerDay), Number(item.incrementalPrice || 0), Number(item.discountThresholdDays ?? 5));
      });
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price_per_day, incremental_price, discount_threshold_days)
         VALUES ${buildValuesClause(flatItems.length, 7)}`,
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
