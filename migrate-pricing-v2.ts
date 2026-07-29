// One-off, manually-invoked data migration for the 2026 pricing-schema redesign.
// NOT part of the running app. Run once against the live Supabase DB, AFTER the
// additive ALTER TABLE migration in README.md has been applied (this script only
// UPDATEs/INSERTs data - it does not create columns).
//
// Usage: DATABASE_URL="postgresql://..." npx tsx migrate-pricing-v2.ts
//
// For each product in db/defaultProducts.ts (the single source of truth for the
// new price-list numbers - see that file for how it maps to the owner's flyer):
//   - If the id already exists (one of the pre-migration catalog's 31 products):
//     UPDATE only its pricing-related columns (category, rates, readinessHours).
//     Deliberately never touches name/stock/description/image - live stock may
//     have drifted from any seed default via admin adjustments, and must not be
//     silently reset by a pricing migration.
//   - If the id doesn't exist yet (one of the 8 brand-new products): full INSERT.
import 'dotenv/config';
import dns from 'dns';
import pg from 'pg';
import { defaultProducts } from './db/defaultProducts';

dns.setDefaultResultOrder('ipv4first');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Error: DATABASE_URL environment variable is not set.');
  console.error('Usage: DATABASE_URL="postgresql://..." npx tsx migrate-pricing-v2.ts');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false } // Required for Supabase SSL connections
});

async function run() {
  console.log('🔄 Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('✅ Connected successfully!');

  for (const p of defaultProducts) {
    const updateRes = await client.query(
      `UPDATE products SET
         category = $2,
         day1_price = $3, day2_price = $4, day3_price = $5, day4_price = $6, day5_price = $7,
         extra_day_rate = $8, readiness_hours = $9
       WHERE id = $1`,
      [p.id, p.category, p.rates.day1Price, p.rates.day2Price, p.rates.day3Price, p.rates.day4Price, p.rates.day5Price, p.rates.extraDayRate, p.readinessHours || 0]
    );

    if (updateRes.rowCount === 0) {
      await client.query(
        `INSERT INTO products (id, name, category, day1_price, day2_price, day3_price, day4_price, day5_price, extra_day_rate, readiness_hours, stock, description, image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [p.id, p.name, p.category, p.rates.day1Price, p.rates.day2Price, p.rates.day3Price, p.rates.day4Price, p.rates.day5Price, p.rates.extraDayRate, p.readinessHours || 0, p.stock, p.description || '', p.image || '']
      );
      console.log(`   + Inserted NEW product: ${p.name} (${p.id})`);
    } else {
      console.log(`   - Updated pricing for: ${p.name} (${p.id})`);
    }
  }

  console.log('\n🎉 Pricing schema data migration complete.');
  await client.end();
  console.log('🔌 Disconnected from Database.');
}

run().catch((err) => {
  console.error('❌ Pricing migration failed:', err);
  process.exit(1);
});
