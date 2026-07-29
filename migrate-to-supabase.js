import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dns from 'dns';

// Supabase pooler hosts are dual-stack (A + AAAA). Prefer IPv4 so this doesn't
// fail with ENETUNREACH on networks without a working IPv6 route.
dns.setDefaultResultOrder('ipv4first');

// Load connection string from environment variables
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL environment variable is not set.');
  console.error('Please run with DATABASE_URL=postgresql://user:pass@host:port/db node migrate-to-supabase.js');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Supabase SSL connections
  }
});

async function runMigration() {
  console.log('🔄 Connecting to Supabase PostgreSQL...');
  try {
    await client.connect();
    console.log('✅ Connected successfully!');

    // Read local database
    const dbFilePath = path.join(process.cwd(), 'server_db.json');
    if (!fs.existsSync(dbFilePath)) {
      console.error(`❌ Error: server_db.json not found at ${dbFilePath}`);
      process.exit(1);
    }

    const rawData = fs.readFileSync(dbFilePath, 'utf8');
    const dbData = JSON.parse(rawData);

    const { products = [], orders = [] } = dbData;
    console.log(`📦 Found ${products.length} products and ${orders.length} orders in server_db.json.`);

    // 1. Insert Products
    console.log('\n📥 Migrating Products...');
    for (const prod of products) {
      await client.query(
        `INSERT INTO products (id, name, category, day1_price, day2_price, day3_price, day4_price, day5_price, extra_day_rate, readiness_hours, stock, description, image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
           image = EXCLUDED.image`,
        [
          prod.id,
          prod.name,
          prod.category,
          Number(prod.rates.day1Price),
          Number(prod.rates.day2Price),
          Number(prod.rates.day3Price),
          Number(prod.rates.day4Price),
          Number(prod.rates.day5Price),
          Number(prod.rates.extraDayRate),
          Number(prod.readinessHours || 0),
          Number(prod.stock),
          prod.description || '',
          prod.image || ''
        ]
      );
      console.log(`   - Product: ${prod.name} (${prod.id}) migrated.`);
    }

    // 2. Insert Orders
    console.log('\n📥 Migrating Orders...');
    for (const order of orders) {
      // Avoid duplicate order insert if already exists
      const existing = await client.query('SELECT id FROM orders WHERE id = $1', [order.id]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO orders (id, customer_name, customer_whatsapp, start_date, end_date, rent_duration, total_price, id_card_base64, status, created_at, late_days, late_fee, confirmation_token, returned_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            order.id,
            order.customerName,
            order.customerWhatsApp,
            order.startDate,
            order.endDate,
            Number(order.rentDuration),
            Number(order.totalPrice),
            order.idCardBase64 || '',
            order.status,
            order.createdAt,
            Number(order.lateDays || 0),
            Number(order.lateFee || 0),
            order.confirmationToken ?? null,
            order.returnedAt ?? null
          ]
        );
        console.log(`   - Order: ${order.id} by ${order.customerName} migrated.`);

        // 3. Insert Order Items - carries both the new rate-table columns and the
        // legacy pre-migration columns, whichever the item actually has (see the
        // same pattern in db/postgres.ts's writeDBPostgres for why both are kept).
        for (const item of order.items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, day1_price, day2_price, day3_price, day4_price, day5_price, extra_day_rate, price_per_day, incremental_price, discount_threshold_days)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              order.id,
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
              item.legacyDiscountThresholdDays !== undefined ? Number(item.legacyDiscountThresholdDays) : null
            ]
          );
        }
      } else {
        console.log(`   - Order: ${order.id} already exists in Database. Skipping.`);
      }
    }

    console.log('\n🎉 Database migration complete! All products and orders successfully synced.');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
  } finally {
    await client.end();
    console.log('🔌 Disconnected from Database.');
  }
}

runMigration();
