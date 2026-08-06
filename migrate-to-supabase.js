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

    const { products = [], orders = [], settings, users, jobPriceList, jobEntries = [] } = dbData;
    console.log(`📦 Found ${products.length} products and ${orders.length} orders in server_db.json.`);

    // 1. Insert Products
    console.log('\n📥 Migrating Products...');
    for (const prod of products) {
      await client.query(
        `INSERT INTO products (id, name, category, day1_price, day2_price, day3_price, day4_price, day5_price, extra_day_rate, readiness_hours, stock, description, image, varian, size, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
          prod.image || '',
          prod.varian || '',
          prod.size || '',
          prod.color || ''
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
          `INSERT INTO orders (id, customer_name, customer_whatsapp, start_date, end_date, rent_duration, total_price, id_card_base64, status, created_at, late_days, late_fee, confirmation_token, returned_at, pickup_id_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            order.id,
            order.customerName,
            order.customerWhatsApp,
            order.startDate,
            order.endDate,
            Number(order.rentDuration),
            Number(order.totalPrice),
            order.personalPhotoBase64 || '',
            order.status,
            order.createdAt,
            Number(order.lateDays || 0),
            Number(order.lateFee || 0),
            order.confirmationToken ?? null,
            order.returnedAt ?? null,
            order.pickupIdType ?? null
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

    // 4. Insert Settings (single row, id = 1) - if the source server_db.json
    // predates this feature and has no settings key, skip it: seedPostgresIfEmpty
    // (db/postgres.ts) seeds the default row automatically on the app's next boot.
    if (settings) {
      console.log('\n📥 Migrating Settings...');
      await client.query(
        `INSERT INTO settings (id, late_tolerance_hours, operating_hours)
         VALUES (1, $1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           late_tolerance_hours = EXCLUDED.late_tolerance_hours,
           operating_hours = EXCLUDED.operating_hours`,
        [Number(settings.lateToleranceHours), JSON.stringify(settings.operatingHours)]
      );
      console.log('   - Settings migrated.');
    } else {
      console.log('\n⚠️  No settings found in server_db.json - defaults will be seeded on the app\'s next boot.');
    }

    // 5. Insert Users - if missing (predates this feature), skip: seedPostgresIfEmpty
    // seeds the default owner account automatically on the app's next boot.
    if (users) {
      console.log('\n📥 Migrating Users...');
      for (const user of users) {
        await client.query(
          `INSERT INTO users (id, username, password_hash, password_salt, role, display_name, session_token, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             password_hash = EXCLUDED.password_hash,
             password_salt = EXCLUDED.password_salt,
             role = EXCLUDED.role,
             display_name = EXCLUDED.display_name,
             session_token = EXCLUDED.session_token,
             created_at = EXCLUDED.created_at`,
          [user.id, user.username, user.passwordHash, user.passwordSalt, user.role, user.displayName, user.sessionToken ?? null, user.createdAt]
        );
        console.log(`   - User: ${user.username} (${user.role}) migrated.`);
      }
    } else {
      console.log('\n⚠️  No users found in server_db.json - the default owner account will be seeded on the app\'s next boot.');
    }

    // 6. Insert Job Price List - if missing, skip: seeded automatically on next boot.
    if (jobPriceList) {
      console.log('\n📥 Migrating Job Price List...');
      for (const item of jobPriceList) {
        await client.query(
          `INSERT INTO job_price_list (id, item_name, cleaning_price, laundry_price, inventaris_price, active, product_ids)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             item_name = EXCLUDED.item_name,
             cleaning_price = EXCLUDED.cleaning_price,
             laundry_price = EXCLUDED.laundry_price,
             inventaris_price = EXCLUDED.inventaris_price,
             active = EXCLUDED.active,
             product_ids = EXCLUDED.product_ids`,
          [item.id, item.itemName, item.cleaningPrice ?? null, item.laundryPrice ?? null, item.inventarisPrice ?? null, item.active ?? true, item.productIds && item.productIds.length > 0 ? item.productIds : null]
        );
      }
      console.log(`   - ${jobPriceList.length} job price list items migrated.`);
    } else {
      console.log('\n⚠️  No job price list found in server_db.json - defaults will be seeded on the app\'s next boot.');
    }

    // 7. Insert Job Entries
    if (jobEntries.length > 0) {
      console.log('\n📥 Migrating Job Entries...');
      for (const entry of jobEntries) {
        const existing = await client.query('SELECT id FROM job_entries WHERE id = $1', [entry.id]);
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO job_entries (id, employee_user_id, employee_name, entry_date, item_name, job_type, unit_price, quantity, total, status, payment_date, rejection_reason, rejected_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              entry.id,
              entry.employeeUserId,
              entry.employeeName,
              entry.entryDate,
              entry.itemName,
              entry.jobType,
              Number(entry.unitPrice),
              Number(entry.quantity),
              Number(entry.total),
              entry.status,
              entry.paymentDate ?? null,
              entry.rejectionReason ?? null,
              entry.rejectedAt ?? null,
              entry.createdAt
            ]
          );
        }
      }
      console.log(`   - ${jobEntries.length} job entries migrated.`);
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
