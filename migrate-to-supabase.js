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
        `INSERT INTO products (id, name, category, price, incremental_price_after_5_days, discount_min_days, stock, description, image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           price = EXCLUDED.price,
           incremental_price_after_5_days = EXCLUDED.incremental_price_after_5_days,
           discount_min_days = EXCLUDED.discount_min_days,
           stock = EXCLUDED.stock,
           description = EXCLUDED.description,
           image = EXCLUDED.image`,
        [
          prod.id,
          prod.name,
          prod.category,
          Number(prod.price),
          Number(prod.incrementalPriceAfter5Days || 0),
          Number(prod.discountMinDays ?? 5),
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
          `INSERT INTO orders (id, customer_name, customer_whatsapp, start_date, end_date, rent_duration, total_price, id_card_base64, status, created_at, late_days, late_fee)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
            Number(order.lateFee || 0)
          ]
        );
        console.log(`   - Order: ${order.id} by ${order.customerName} migrated.`);

        // 3. Insert Order Items
        for (const item of order.items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, price_per_day, incremental_price, discount_threshold_days)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              order.id,
              item.productId,
              item.productName,
              Number(item.quantity),
              Number(item.pricePerDay),
              Number(item.incrementalPrice || 0),
              Number(item.discountThresholdDays ?? 5)
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
