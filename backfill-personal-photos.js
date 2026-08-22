// One-time, manually-invoked migration: moves each existing order's personal
// identity photo out of orders.id_card_base64 (raw base64 text, inline in
// Postgres) into the private bilbo-personal-photos Supabase Storage bucket,
// storing only the resulting object path in orders.personal_photo_path - the
// same scheme new orders already use going forward (see server.ts's
// PERSONAL_PHOTO_STORAGE_ENABLED and src/types.ts's Order.personalPhotoStoragePath
// comment). NOT part of the running app - run this manually, once, the same
// way migrate-to-supabase.js is:
//
//   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node backfill-personal-photos.js [--execute] [--limit=N]
//
// Safety defaults: runs as a DRY RUN (no uploads, no DB writes) unless
// --execute is passed. Use --limit=N to test against just the first N
// matching rows before running against everything.
//
// Ordering matters for crash-safety: for each row, upload succeeds, THEN
// personal_photo_path is written and verified, and ONLY THEN is
// id_card_base64 cleared. If the script is interrupted between those last two
// steps, the row is left with BOTH fields populated - harmless, since the
// app's readOrderPhoto() always prefers personal_photo_path when present, and
// the row is simply skipped (personal_photo_path already set) on the next
// run. The alternative order (clearing base64 before confirming the path
// landed) risks permanent data loss if interrupted at the wrong moment - never
// do that.
//
// Nulling id_card_base64 does not by itself shrink the table on disk or free
// up Postgres storage quota - Postgres just marks that space reusable, it
// doesn't return it to the OS until vacuumed. Run `VACUUM FULL orders;`
// once after a full successful migration to actually reclaim the space (this
// script prints a reminder at the end).

import pg from 'pg';
import dns from 'dns';
import crypto from 'crypto';

dns.setDefaultResultOrder('ipv4first');

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'bilbo-personal-photos';

const EXECUTE = process.argv.includes('--execute');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;

if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY must all be set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function uploadToSupabaseStorage(objectPath, buffer, contentType) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`Storage upload failed (${res.status}): ${await res.text().catch(() => '')}`);
  }
}

async function main() {
  console.log(EXECUTE ? 'Running LIVE - this will upload photos and modify the orders table.' : 'DRY RUN - no uploads or writes will be made. Pass --execute to actually run this.');
  if (LIMIT) console.log(`--limit=${LIMIT} set - only the first ${LIMIT} matching row(s) will be processed.`);
  console.log('');

  // Cheap ID-only query first, not the base64 data - pulling all matching
  // rows' full base64 (tens of MB combined) in one query risks a statement
  // timeout (confirmed empirically). Each row's base64 is fetched individually
  // right before it's needed, immediately below, and freed once processed.
  const { rows: idRows } = await pool.query(
    `SELECT id FROM orders
     WHERE id_card_base64 IS NOT NULL AND length(id_card_base64) > 0
       AND (personal_photo_path IS NULL OR personal_photo_path = '')
     ORDER BY created_at ASC`
  );
  console.log(`Found ${idRows.length} order(s) with a legacy inline photo still needing migration.`);

  const targets = LIMIT ? idRows.slice(0, LIMIT) : idRows;

  let migrated = 0;
  let skipped = 0;

  for (const { id: orderId } of targets) {
    let idCardBase64;
    try {
      const photoRes = await pool.query('SELECT id_card_base64 FROM orders WHERE id = $1', [orderId]);
      idCardBase64 = photoRes.rows[0]?.id_card_base64;
    } catch (err) {
      console.error(`  FAIL ${orderId}: could not fetch id_card_base64 - ${err.message}. Row left untouched, safe to retry later.`);
      skipped++;
      continue;
    }
    const row = { id: orderId, id_card_base64: idCardBase64 };
    const match = row.id_card_base64.match(/^data:(image\/webp|image\/png);base64,(.+)$/);
    if (!match) {
      console.error(`  SKIP ${row.id}: id_card_base64 doesn't match the expected image/webp or image/png data URL format - left untouched.`);
      skipped++;
      continue;
    }
    const [, mimeType, base64Data] = match;
    const extension = mimeType === 'image/webp' ? 'webp' : 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const objectPath = `personal-photos/${crypto.randomUUID()}.${extension}`;

    if (!EXECUTE) {
      console.log(`  [DRY RUN] would upload ${row.id} -> ${objectPath} (${buffer.length} bytes, ${mimeType})`);
      migrated++;
      continue;
    }

    try {
      await uploadToSupabaseStorage(objectPath, buffer, mimeType);
    } catch (err) {
      console.error(`  FAIL ${row.id}: Storage upload failed - ${err.message}. Row left untouched, safe to retry later.`);
      skipped++;
      continue;
    }

    // Write the path first, and verify it actually saved, before touching
    // id_card_base64 at all - see the file header comment for why this order
    // is the only crash-safe one.
    const updateRes = await pool.query(
      `UPDATE orders SET personal_photo_path = $1 WHERE id = $2 RETURNING personal_photo_path`,
      [objectPath, row.id]
    );
    if (updateRes.rows[0]?.personal_photo_path !== objectPath) {
      console.error(`  FAIL ${row.id}: personal_photo_path did not save as expected - id_card_base64 left intact, photo already uploaded to ${objectPath} (orphaned, safe to ignore or clean up manually).`);
      skipped++;
      continue;
    }

    await pool.query(`UPDATE orders SET id_card_base64 = '' WHERE id = $1`, [row.id]);
    console.log(`  OK ${row.id}: uploaded (${buffer.length} bytes) -> ${objectPath}`);
    migrated++;
  }

  console.log('');
  console.log(`Done. Migrated: ${migrated}, Skipped/failed: ${skipped}.`);
  if (!EXECUTE) {
    console.log('This was a dry run - nothing was uploaded or changed. Re-run with --execute (start with --limit=3 to test first) to actually migrate.');
  } else if (skipped === 0 && !LIMIT) {
    console.log('');
    console.log('All rows migrated with no failures. Run this once to actually reclaim the freed disk space against your Postgres storage quota:');
    console.log('  VACUUM FULL orders;');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Backfill script failed:', err);
  process.exit(1);
});
