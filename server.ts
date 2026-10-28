import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import { createServer as createViteServer } from 'vite';
import { Product, Order, OrderItem, OrderStatus, PenaltyEntry, PublicOrder, OrderListItem, DashboardStats, StoreSettings, AppUser, PublicUser, UserRole, JobPriceListItem, JobEntry, JobType, WuzzpayAttempt } from './src/types';
import { defaultProducts } from './db/defaultProducts';
import { defaultSettings } from './db/defaultSettings';
import { defaultUsers } from './db/defaultUsers';
import { defaultJobPriceList } from './db/defaultJobPriceList';
import { initPostgresPool, seedPostgresIfEmpty, readDBPostgres, writeDBPostgres, findUserByUsernamePostgres, findUserBySessionTokenPostgres, findUserByIdPostgres, updateUserAuthFieldsPostgres, readProductsPostgres, readOrdersPostgres, readSettingsPostgres, readUsersPostgres, readJobPriceListPostgres, readJobEntriesPostgres, writeOrdersPostgres, readOrderPhotoPostgres, updateOrderPersonalPhotoPostgres } from './db/postgres';
import { calculateRentalCost, calculateLegacyRentalCost, getAmountPaid, getRemainingBalance, getPenaltyTotal } from './src/pricing';
import { hashPassword, verifyPassword, generateSessionToken } from './src/auth';
import { formatDateLabel, getTodayDateString } from './src/lib/date';

// Several outbound calls this server makes (Telegram, WuzzPay, Supabase
// Storage/pooler) target dual-stack hosts. Node's Happy Eyeballs
// (autoSelectFamily, on by default since Node 18.13) races BOTH the IPv4 and
// IPv6 address in parallel on every connection - if this network's IPv6
// route is broken (packets silently dropped rather than cleanly rejected),
// that race can time out even though IPv4 alone would have connected
// instantly. Confirmed 2026-08-24 against a real production failure:
// "Telegram booking notification failed: AggregateError [ETIMEDOUT]" with
// two sub-errors, api.telegram.org resolving to both an A and AAAA record.
// dns.setDefaultResultOrder('ipv4first') alone (previously only set inside
// initPostgresPool, Postgres-mode only) doesn't prevent this - it only
// affects which address is tried first, not whether the second, hanging one
// is also raced. Disabling autoSelectFamily entirely is what actually stops
// that second attempt. Applied unconditionally here (not inside Postgres
// init) so it also protects Telegram/WuzzPay/Supabase Storage calls in
// JSON-file/local-dev mode, not just Postgres mode.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

declare global {
  namespace Express {
    interface Request {
      currentUser?: AppUser;
      // Raw request bytes, stashed by express.json()'s verify callback below -
      // needed by the WuzzPay webhook route to check x-wuzzpay-signature (an
      // HMAC over the raw body, which can differ from the re-serialized JS
      // object in key order/whitespace).
      rawBody?: Buffer;
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

// True if at least one OTHER active owner besides `excludingUserId` exists -
// used to block any action (delete, deactivate, role change) that would leave
// the system with zero active owner accounts and nobody able to undo it.
function hasOtherActiveOwner(db: DbShape, excludingUserId: string): boolean {
  return db.users.some((u: AppUser) => u.id !== excludingUserId && u.role === 'owner' && u.active !== false);
}

// ---------------- TELEGRAM BOOKING NOTIFICATIONS ----------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_BOOKING_CHAT_ID = process.env.TELEGRAM_BOOKING_CHAT_ID;
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOOKING_CHAT_ID) {
  console.log('Telegram notifications disabled — set TELEGRAM_BOT_TOKEN/TELEGRAM_BOOKING_CHAT_ID to enable.');
}
// Hardcoded to match the same production domain already hardcoded in
// index.html/robots.txt/llms.txt (canonical URL, sitemap, etc.) - this is a
// single-domain site with no existing env-configurable base URL, so this
// follows the established convention rather than introducing a new one.
const SITE_URL = 'https://www.bilbooutdoors.com';

// Shared low-level sender - fetch only rejects on network-level failure,
// never on HTTP error status, so throw explicitly here so a bad token/chat-id
// reaches each call site's own `.catch()`.
//
// Retries up to 3 total attempts with a short backoff (1s, then 2s) on ANY
// failure - both a network-level throw (e.g. the dual-stack ETIMEDOUT race,
// see the autoSelectFamily fix above) and a non-2xx response. Safe to retry
// blindly here since every call site is fire-and-forget (never blocks a
// booking/payment) - the only cost of a full 3-attempt exhaustion is a few
// extra seconds before the error is logged, not a delayed customer response.
// A permanently bad token/chat-id will still retry 3x pointlessly before
// failing, but that's a one-time setup mistake, not a recurring cost.
async function sendTelegramMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOOKING_CHAT_ID) return;
  const RETRY_DELAYS_MS = [1000, 2000]; // between attempts 1->2 and 2->3 only
  let lastError: unknown;
  for (let attempt = 0; attempt < 1 + RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_BOOKING_CHAT_ID, text }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Telegram API responded ${res.status}: ${await res.text().catch(() => '')}`);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastError;
}

// Fire-and-forget from the /api/orders call site - never blocks or delays a
// booking. Always resolves (even the unconfigured no-op path) so `.catch()`
// at the call site never blows up on `undefined`.
async function sendTelegramBookingNotification(order: Order): Promise<void> {
  const itemLines = order.items.map(it => `- ${it.productName} (x${it.quantity})`).join('\n');
  const text = `Booking baru masuk!\n\nID Pesanan: ${order.id}\nNama: ${order.customerName}\nWhatsApp: ${order.customerWhatsApp}\nPeriode: ${formatDateLabel(order.startDate)} s/d ${formatDateLabel(order.endDate)} (${order.rentDuration} Hari)\n\nPeralatan:\n${itemLines}\n\nTotal: Rp ${order.totalPrice.toLocaleString('id-ID')}\n\nLink Konfirmasi: ${SITE_URL}/pesanan/${order.confirmationToken}`;
  await sendTelegramMessage(text);
}

// ---------------- SUPABASE STORAGE (PRODUCT IMAGES + PERSONAL PHOTOS) ----------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRODUCT_IMAGE_BUCKET = 'bilbo-product-images';
const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('Product image upload disabled — set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY to enable.');
}

// Unlike product images (bilbo-product-images, a PUBLIC bucket - anyone with
// a URL can view them, which is fine, they're storefront photos), the
// customer's personal identity photo is PII/rental-guarantee documentation -
// this bucket MUST be created as PRIVATE in the Supabase dashboard (Public
// bucket: OFF). Access is only ever via a short-lived signed URL minted
// server-side (see createSignedPersonalPhotoUrl), never a permanent public
// link. Confirmed 2026-08-22: 71 orders but 147MB on disk (47MB of it raw
// base64 photo text) - this moves NEW orders' photos out of Postgres
// entirely; legacy orders keep their base64 in id_card_base64 unchanged (see
// src/types.ts's Order.personalPhotoStoragePath comment for the full split).
const PERSONAL_PHOTO_BUCKET = 'bilbo-personal-photos';
const MAX_PERSONAL_PHOTO_BYTES = 5 * 1024 * 1024; // headroom above the ~3.17MB max observed pre-fix
const SIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes - enough for an admin to open OrderDetailPanel
// Storage is only ever engaged in Postgres mode - JSON-file mode (local dev
// only, per this project's own convention, never production) keeps the
// unconditional inline-base64 behavior regardless of whether these Supabase
// vars happen to also be set in a local .env.
const PERSONAL_PHOTO_STORAGE_ENABLED = Boolean(process.env.DATABASE_URL && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// Shared by both the product-image upload route and personal-photo upload
// (inside POST /api/orders) - both do the identical "POST a buffer to a
// Supabase Storage bucket with the service-role key" call.
async function uploadToSupabaseStorage(bucket: string, objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`Supabase Storage upload failed (${uploadRes.status}): ${await uploadRes.text().catch(() => '')}`);
  }
}

// Mints a short-lived signed URL for a private-bucket object - distinct from
// the product-image route's `/object/public/...` URL, which works forever
// with no auth since that bucket is public. Only ever called for the
// personal-photo bucket, so it's not parameterized by bucket name.
async function createSignedPersonalPhotoUrl(objectPath: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${PERSONAL_PHOTO_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
  });
  if (!res.ok) {
    throw new Error(`Supabase Storage sign failed (${res.status}): ${await res.text().catch(() => '')}`);
  }
  const { signedURL } = await res.json() as { signedURL: string };
  // Supabase's documented shape returns a RELATIVE path here
  // ("/object/sign/<bucket>/<path>?token=..."), not a full URL like the
  // public-object endpoint - confirmed against a real call before this went
  // live (see the plan's Stage 2 verification).
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

// Shared by both POST /api/orders (customer checkout) and
// POST /api/orders/:id/personal-photo (staff retroactively adding a photo the
// customer never uploaded) - both need the identical "validate, upload to
// Storage if enabled, gracefully fall back to inline base64 otherwise or on
// failure" behavior. Returns the two possible stored forms (mutually
// exclusive - exactly one is ever non-empty/non-null) for the caller to
// persist, or an error response to return as-is.
async function processPersonalPhotoUpload(dataUrl: unknown): Promise<{ base64: string; storagePath: string | null } | { error: string; status: number }> {
  if (typeof dataUrl !== 'string' || !dataUrl) {
    return { base64: '', storagePath: null };
  }
  const match = dataUrl.match(/^data:(image\/webp|image\/png);base64,(.+)$/);
  if (!match) {
    // Unrecognized format - fall back to legacy behavior (store as-is, no
    // validation) rather than rejecting outright, same as before Storage
    // support existed.
    return { base64: dataUrl, storagePath: null };
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_PERSONAL_PHOTO_BYTES) {
    return { error: 'Ukuran foto terlalu besar. Gunakan foto lain.', status: 413 };
  }
  if (!PERSONAL_PHOTO_STORAGE_ENABLED) {
    return { base64: dataUrl, storagePath: null };
  }
  try {
    const objectPath = `personal-photos/${crypto.randomUUID()}.${mimeType === 'image/webp' ? 'webp' : 'png'}`;
    await uploadToSupabaseStorage(PERSONAL_PHOTO_BUCKET, objectPath, buffer, mimeType);
    return { base64: '', storagePath: objectPath };
  } catch (err) {
    console.error('Personal photo Storage upload failed, falling back to inline base64:', err);
    return { base64: dataUrl, storagePath: null };
  }
}

// ---------------- WUZZPAY PAYMENT GATEWAY ----------------
const WUZZPAY_API_KEY = process.env.WUZZPAY_API_KEY;
const WUZZPAY_MERCHANT_ID = process.env.WUZZPAY_MERCHANT_ID;
// Confirmed 2026-08-22 against a real webhook.test delivery (WuzzPay's docs
// never published this - see the payment gateway plan's Context): the
// signature is hex(HMAC-SHA256(secret, `${x-wuzzpay-timestamp}.${rawBody}`)),
// same scheme Stripe uses. Webhook verification is skipped (not rejected) if
// this is unset, same "missing config = fall back" convention as elsewhere -
// fetchWuzzpaySettlementStatus/applyWuzzpaySettlementStatus's own re-check
// against WuzzPay's API remains the authoritative source of truth regardless,
// so this is defense in depth, not the only guard.
const WUZZPAY_WEBHOOK_SECRET = process.env.WUZZPAY_WEBHOOK_SECRET;
// Sandbox is the safe default when WUZZPAY_ENV is unset - mirrors the
// "missing config = the safe path" convention already used for Telegram/image
// upload above. Production is only ever used when explicitly opted into.
//
// Production host corrected 2026-10-25: docs.wuzzpay.com's base-url page
// says api.wuzzpay.com, but that host consistently returned a Cloudflare
// origin_bad_gateway error (their own origin server, not ours - confirmed
// via a live production test and its Render log). api-gateway.wuzzpay.com -
// the same "api-gateway" naming the sandbox host already uses, just without
// "-devel" - is confirmed alive and responding correctly at the application
// layer (a clean GWY001 "invalid or missing api key" JSON error, not an
// infrastructure-level 502) when hit directly.
const WUZZPAY_BASE_URL = process.env.WUZZPAY_ENV === 'production'
  ? 'https://api-gateway.wuzzpay.com/v1'
  : 'https://api-gateway-devel.wuzzpay.com/v1';
if (!WUZZPAY_API_KEY || !WUZZPAY_MERCHANT_ID) {
  console.log('WuzzPay payment gateway disabled — set WUZZPAY_API_KEY/WUZZPAY_MERCHANT_ID to enable.');
}

// TEMPORARY internal testing gate (owner-requested, 2026-08-19): most WuzzPay
// channels are still broken or unprovisioned on their side (only 6/8 VA banks
// work, QRIS/e-wallet fail entirely - see live sandbox testing notes), so the
// real gateway flow must stay invisible to actual customers while it's being
// validated in production. An order only gets the real flow if the customer
// typed this exact string as their full name - anyone else transparently
// falls back to the legacy manual QRIS-mock/WhatsApp flow, both here (the
// charge route below refuses to activate) and client-side (OrderConfirmationPage.tsx).
// Remove this gate once the channel provisioning issues are resolved and the
// feature is ready for a real rollout.
const PAYMENT_GATEWAY_TEST_TRIGGER_NAME = 'TESTING_PAYMENT';

// Thrown by wuzzpayRequest on a non-2xx response - carries the real HTTP
// status and WuzzPay's own error code so callers can distinguish failure
// types (e.g. a permanently-stuck reference vs. a transient hiccup) without
// string-parsing an error message.
class WuzzpayApiError extends Error {
  status: number;
  wuzzpayCode?: string;
  constructor(message: string, status: number, wuzzpayCode?: string) {
    super(message);
    this.status = status;
    this.wuzzpayCode = wuzzpayCode;
  }
}

// Thin authenticated fetch wrapper for the WuzzPay API. Throws explicitly on
// a non-2xx response (same shape as sendTelegramBookingNotification above) so
// asyncHandler-wrapped call sites surface the failure instead of silently
// swallowing it. Never logs the outgoing request (which carries the API key
// in its headers) - only the response body, which is WuzzPay's own data.
async function wuzzpayRequest(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${WUZZPAY_API_KEY}`,
    'X-Wuzzpay-Merchant-Id': WUZZPAY_MERCHANT_ID!,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`${WUZZPAY_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new WuzzpayApiError(`WuzzPay ${method} ${path} responded ${res.status}: ${JSON.stringify(data)}`, res.status, data?.code);
  }
  return data;
}

// Slow, network-only half of settlement verification - deliberately has NO
// DB access and takes NO lock, so it's safe to call before/outside withDbLock.
// Split out 2026-08-20 after a production incident: the combined
// fetch+read+write used to run entirely inside withDbLock (a single,
// process-wide, strictly-serialized mutex - see its definition below), and
// since the client polls payment-status every 5s without waiting for the
// previous poll to finish, a slow WuzzPay response (this call can take up to
// WUZZPAY_REQUEST_TIMEOUT_MS) let overlapping polls pile up in that one
// global queue, starving every OTHER write route (and GET /api/orders, which
// also takes the lock) for as long as the backlog took to drain. Returns the
// raw status string (or undefined on any failure - caller decides what "no
// answer" means, this never throws).
async function fetchWuzzpaySettlementStatus(wuzzpayTransactionId: string, orderId: string): Promise<string | undefined> {
  try {
    const data = await wuzzpayRequest('GET', `/transactions/${wuzzpayTransactionId}`);
    return data?.data?.status;
  } catch (err) {
    console.error(`WuzzPay transaction status check failed for order ${orderId}:`, err);
    return undefined;
  }
}

// Fast, DB-only half - call this INSIDE withDbLock, only after
// fetchWuzzpaySettlementStatus has already resolved outside the lock. Mutates
// `order` in place and returns whether anything actually changed, so the
// caller can skip a pointless writeDB() (a full 6-table transactional sync,
// per writeDBPostgres - not cheap) when a poll comes back with nothing new,
// which is the common case (most polls just re-confirm "still pending").
// Deliberately allows the transition from either Pending OR Expired (not just
// Pending) - see expireStaleOrders above for why a late-arriving confirmed
// settlement must still recover an order that auto-expired while a real
// payment was still in flight.
// Return shape distinguishes "something changed" (any write worth persisting,
// including a bare wuzzpayLastStatus update) from "a settlement just landed"
// (justSettled) - callers use the latter to fire a one-time payment
// notification without re-notifying on every subsequent poll that just
// reconfirms the same already-Approved/Paid order (this function returns
// early with both false once status is no longer Pending/Expired).
// Every channel attempted on an order, oldest first - the real
// order.wuzzpayAttempts array if present, else a single-entry fallback
// synthesized from the legacy singular fields, for an order created before
// this array existed (2026-10-26). Shared by the /charge precheck,
// pollAndSettleOrderAttempts, and the admin manual-verify route, so "what
// counts as an attempt" stays defined in exactly one place.
function getOrderAttempts(order: Order): WuzzpayAttempt[] {
  if (order.wuzzpayAttempts && order.wuzzpayAttempts.length > 0) return order.wuzzpayAttempts;
  if (order.wuzzpayTransactionId && order.paymentInstruction && order.paymentMethod && order.paymentMethod !== 'cash') {
    return [{
      productId: order.paymentMethod,
      bankCode: order.paymentChannel,
      transactionId: order.wuzzpayTransactionId,
      paymentInstruction: order.paymentInstruction,
      chargedAmount: order.wuzzpayChargedAmount ?? order.totalPrice,
      provider: order.wuzzpayProvider,
      lastStatus: order.wuzzpayLastStatus,
      chargedAt: order.createdAt,
    }];
  }
  return [];
}

// Applies a freshly-checked status for ONE specific attempt to its order.
// Mutates `order`/`attempt` in place (attempt must be the actual array
// element from order.wuzzpayAttempts, not a copy, so attempt.lastStatus
// persists through writeOrders) and returns what changed.
//
// Multi-channel orders (2026-10-26) can have more than one live attempt at
// once - WuzzPay has no cancel/void endpoint (confirmed against their full
// documented API surface), so an older attempt can still genuinely get paid
// even after the order already settled via a different channel. That's a
// real double payment, not a bug: flagged into wuzzpayDuplicatePayment for
// manual refund reconciliation rather than silently discarded.
function applyWuzzpaySettlementStatus(order: Order, attempt: WuzzpayAttempt, status: string | undefined): { changed: boolean; justSettled: boolean; duplicateDetected: boolean } {
  // "success" confirmed 2026-08-22 against a real webhook.test delivery;
  // "settled"/"paid" kept as plausible variants for other event types until
  // confirmed too (see the payment gateway plan's Stage 2).
  const settled = status === 'settled' || status === 'paid' || status === 'success';

  if (order.status === 'Approved/Paid' || order.status === 'Item Picked Up' || order.status === 'Item Returned/Completed') {
    if (settled && attempt.transactionId && attempt.transactionId !== order.wuzzpayTransactionId) {
      order.wuzzpayDuplicatePayment = order.wuzzpayDuplicatePayment || [];
      if (!order.wuzzpayDuplicatePayment.some(d => d.transactionId === attempt.transactionId)) {
        order.wuzzpayDuplicatePayment.push({ transactionId: attempt.transactionId, productId: attempt.productId, detectedAt: new Date().toISOString() });
        return { changed: true, justSettled: false, duplicateDetected: true };
      }
    }
    return { changed: false, justSettled: false, duplicateDetected: false };
  }

  let changed = false;
  if (typeof status === 'string' && status !== attempt.lastStatus) {
    attempt.lastStatus = status;
    changed = true;
  }
  if (settled) {
    order.status = 'Approved/Paid';
    order.paymentMethod = attempt.productId;
    order.paymentChannel = attempt.bankCode;
    order.paymentInstruction = attempt.paymentInstruction;
    order.wuzzpayChargedAmount = attempt.chargedAmount;
    order.wuzzpayTransactionId = attempt.transactionId;
    order.wuzzpayProvider = attempt.provider;
    order.wuzzpayLastStatus = status;
    // Credits exactly what was requested at charge time (wuzzpayChargedAmount) -
    // may be a partial DP (minimum 50%, see the /charge route), not always the
    // full total_price. Falls back to totalPrice for any order that predates
    // this field, preserving the previous full-payment-assumed behavior.
    order.amountPaid = attempt.chargedAmount ?? order.totalPrice;
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: 'Approved/Paid',
      changedAt: new Date().toISOString(),
      changedByUserId: 'system',
      changedByName: 'WuzzPay (Otomatis)',
    });
    changed = true;
  }
  return { changed, justSettled: settled, duplicateDetected: false };
}

// Shared by /payment-status and the admin manual-verify route: checks every
// still-unexpired attempt on an order's live WuzzPay status, one at a time,
// applying each through applyWuzzpaySettlementStatus. Each status check is a
// SLOW outbound call, deliberately sequential and done OUTSIDE withDbLock
// (same reasoning as fetchWuzzpaySettlementStatus's own comment - holding
// the process-wide lock across a slow external call starves every other
// write route). Stops early the moment one attempt settles - no need to
// keep checking once the order is paid - but a duplicate-settlement found
// along the way (point 3 of the multi-channel plan) is still surfaced to
// the caller, not swallowed, since that needs its own alert regardless of
// whether this particular call also found a fresh settlement.
async function pollAndSettleOrderAttempts(findOrder: (orders: Order[]) => Order | undefined, contextLabel: string): Promise<{ notifyOrder: Order | null; duplicateOrder: Order | null }> {
  const snapshot = await withDbLock(async () => {
    const orders = await readOrders();
    const order = findOrder(orders);
    if (!order) return null;
    return { status: order.status, attempts: getOrderAttempts(order) };
  });
  if (!snapshot) return { notifyOrder: null, duplicateOrder: null };
  if (snapshot.status !== 'Pending' && snapshot.status !== 'Expired') return { notifyOrder: null, duplicateOrder: null };

  let notifyOrder: Order | null = null;
  let duplicateOrder: Order | null = null;
  const now = Date.now();
  for (const attempt of snapshot.attempts) {
    if (!attempt.transactionId) continue;
    const expiresAt = (attempt.paymentInstruction as any)?.expires_at;
    if (typeof expiresAt === 'string' && new Date(expiresAt).getTime() < now) continue; // don't bother checking a dead instruction
    const wuzzpayStatus = await fetchWuzzpaySettlementStatus(attempt.transactionId, contextLabel);
    const result = await withDbLock(async () => {
      const orders = await readOrders();
      const order = findOrder(orders);
      if (!order) return null;
      const liveAttempt = getOrderAttempts(order).find(a => a.transactionId === attempt.transactionId) ?? attempt;
      const outcome = applyWuzzpaySettlementStatus(order, liveAttempt, wuzzpayStatus);
      if (outcome.changed) await writeOrders(orders);
      return { order, ...outcome };
    });
    if (!result) continue;
    if (result.justSettled) { notifyOrder = result.order; break; }
    if (result.duplicateDetected) duplicateOrder = result.order;
  }
  return { notifyOrder, duplicateOrder };
}

// Fire-and-forget, same pattern as sendTelegramBookingNotification - callers
// must invoke this AFTER releasing withDbLock, never from inside it (see the
// 2026-08-20 lock-contention incident: a slow outbound call held inside the
// lock starved every other write route app-wide for as long as it took).
async function sendTelegramPaymentNotification(order: Order): Promise<void> {
  const methodLabel = order.paymentMethod === 'va' ? `Virtual Account${order.paymentChannel ? ` (${order.paymentChannel})` : ''}`
    : order.paymentMethod === 'qris' ? 'QRIS'
    : order.paymentMethod === 'emoney' ? `E-Wallet${order.paymentChannel ? ` (${order.paymentChannel})` : ''}`
    : order.paymentMethod ?? 'WuzzPay';
  const text = `Pembayaran diterima!\n\nID Pesanan: ${order.id}\nNama: ${order.customerName}\nWhatsApp: ${order.customerWhatsApp}\nMetode: ${methodLabel}\nTotal: Rp ${order.totalPrice.toLocaleString('id-ID')}\n\nLink Konfirmasi: ${SITE_URL}/pesanan/${order.confirmationToken}`;
  await sendTelegramMessage(text);
}

// Fire-and-forget, same placement discipline as sendTelegramPaymentNotification
// (always called AFTER withDbLock releases, never from inside it). Fires when
// pollAndSettleOrderAttempts/the webhook detects a DIFFERENT channel than the
// one that already settled an order also reports settled - a real double
// payment, since WuzzPay has no way for us to cancel the other channel's
// instruction early. This needs a human to check and refund, not an
// automatic fix - deliberately a separate, more urgent-looking message than
// sendTelegramPaymentNotification, not a variant of it.
async function sendTelegramDuplicatePaymentAlert(order: Order): Promise<void> {
  const latest = order.wuzzpayDuplicatePayment?.[order.wuzzpayDuplicatePayment.length - 1];
  const text = `⚠️ KEMUNGKINAN PEMBAYARAN GANDA\n\nID Pesanan: ${order.id}\nNama: ${order.customerName}\nWhatsApp: ${order.customerWhatsApp}\n\nPesanan ini sudah lunas via ${order.paymentMethod ?? 'metode lain'}, tapi channel ${latest?.productId ?? '(lain)'} JUGA terdeteksi lunas (transaksi ${latest?.transactionId ?? '?'}).\n\nCek Manajemen Order dan proses refund jika pelanggan benar-benar membayar dua kali.\n\nLink Konfirmasi: ${SITE_URL}/pesanan/${order.confirmationToken}`;
  await sendTelegramMessage(text);
}

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'server_db.json');

// Middleware
// The webhook route needs req.rawBody (the exact raw bytes, not the
// re-serialized JS object, which could differ in key order/whitespace from
// what WuzzPay actually signed) to check x-wuzzpay-signature. Scoped to just
// that path with its own express.json({ verify }) instance, registered
// BEFORE the site-wide parser below - body-parser skips re-parsing a request
// it's already consumed, so this doesn't double-parse. Deliberately NOT
// applied globally: retaining a full raw Buffer *and* the parsed object for
// every JSON request (checkout included, which is public/unauthenticated)
// roughly doubles peak per-request memory against the 10mb limit for routes
// that never needed raw-body capture at all - a real, avoidable memory-usage
// increase, not just a style preference.
app.use('/api/webhooks/wuzzpay', express.json({
  limit: '10mb',
  verify: (req: express.Request, _res, buf) => {
    req.rawBody = buf;
  },
}));
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
// Narrow, single-row peers of readDB/writeDB for the session-token/password
// auth path - see db/postgres.ts's comment above findUserByUsernamePostgres
// for why this exists instead of routing auth through the full-dataset pair.
let findUserByUsername: (username: string) => Promise<AppUser | null>;
let findUserBySessionToken: (token: string) => Promise<AppUser | null>;
let findUserById: (userId: string) => Promise<AppUser | null>;
let updateUserAuthFields: (userId: string, fields: { sessionToken: string | null; passwordHash?: string; passwordSalt?: string }) => Promise<void>;
// Narrow, single-table peers of readDB/writeDB for the read-only GET routes
// that only ever need one table - see db/postgres.ts's comment above
// readProductsPostgres for why (fetchAdminData now fires all of these
// concurrently, and readDB()'s full 7-query fan-out multiplies badly under
// that concurrency against the connection pool's limit).
let readProducts: () => Promise<Product[]>;
let readOrders: () => Promise<Order[]>;
let readJobPriceList: () => Promise<JobPriceListItem[]>;
let readJobEntries: () => Promise<JobEntry[]>;
let readSettings: () => Promise<StoreSettings>;
let readUsers: () => Promise<AppUser[]>;
let writeOrders: (orders: Order[]) => Promise<void>;
// readOrders() deliberately omits both photo columns in Postgres mode (see
// readOrdersPostgres's comment) - this is the per-mode raw accessor for the
// one route that needs the real value. Resolving whichever storage form is
// present (legacy base64 vs. a Storage path needing a signed URL) happens
// once, in the shared readOrderPhoto() below - never duplicated per mode.
let readOrderPhotoRaw: (orderId: string) => Promise<{ base64: string; storagePath: string | null }>;
// Narrow, deliberate exception to the "photo columns are write-once" rule
// (see writeOrdersWithClient's ON CONFLICT comment in db/postgres.ts) - the
// one legitimate case where a photo genuinely changes after creation: staff
// retroactively adding one via POST /api/orders/:id/personal-photo.
let updateOrderPersonalPhoto: (orderId: string, base64: string, storagePath: string | null) => Promise<void>;

// Single choke point for "give me a directly-usable photo display value for
// this order," whichever of the two storage forms actually backs it (see
// src/types.ts's Order.personalPhotoStoragePath comment for the full split).
// A signing failure is allowed to throw here rather than being swallowed to
// '' - see POST /api/orders' upload try/catch for why creation-time failures
// degrade gracefully but read-time ones must not: a customer who never
// uploaded a photo and an admin who can no longer retrieve a real one must
// never look the same to staff reviewing a rental-guarantee document.
async function readOrderPhoto(orderId: string): Promise<string> {
  const { base64, storagePath } = await readOrderPhotoRaw(orderId);
  if (storagePath) {
    return await createSignedPersonalPhotoUrl(storagePath);
  }
  return base64 || '';
}

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
    findUserByUsername = findUserByUsernamePostgres;
    findUserBySessionToken = findUserBySessionTokenPostgres;
    findUserById = findUserByIdPostgres;
    updateUserAuthFields = updateUserAuthFieldsPostgres;
    readProducts = readProductsPostgres;
    readOrders = readOrdersPostgres;
    readJobPriceList = readJobPriceListPostgres;
    readJobEntries = readJobEntriesPostgres;
    readSettings = readSettingsPostgres;
    readUsers = readUsersPostgres;
    writeOrders = writeOrdersPostgres;
    readOrderPhotoRaw = readOrderPhotoPostgres;
    updateOrderPersonalPhoto = updateOrderPersonalPhotoPostgres;
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
        if (!parsed.settings.footer) parsed.settings.footer = defaultSettings.footer;
        if (!parsed.settings.runningText) parsed.settings.runningText = defaultSettings.runningText;
        if (!parsed.settings.pendingExpiryHours) parsed.settings.pendingExpiryHours = defaultSettings.pendingExpiryHours;
        if (!parsed.settings.termsAndConditions) parsed.settings.termsAndConditions = defaultSettings.termsAndConditions;
        if (!parsed.settings.paymentChannels) parsed.settings.paymentChannels = defaultSettings.paymentChannels;
        else parsed.settings.paymentChannels.vaBanks = { ...defaultSettings.paymentChannels.vaBanks, ...parsed.settings.paymentChannels.vaBanks };
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
    // Thin wrappers over the same readDB()/writeDB() - JSON mode is already
    // synchronous fs I/O, so there's no latency problem to solve here (and
    // per this session's local_testing_must_use_json_file_db rule, this path
    // never touches real production data anyway).
    findUserByUsername = async (username: string) => {
      const db = await readDB();
      return db.users.find((u: AppUser) => u.username === username) || null;
    };
    findUserBySessionToken = async (token: string) => {
      const db = await readDB();
      return db.users.find((u: AppUser) => u.sessionToken === token) || null;
    };
    findUserById = async (userId: string) => {
      const db = await readDB();
      return db.users.find((u: AppUser) => u.id === userId) || null;
    };
    updateUserAuthFields = async (userId: string, fields: { sessionToken: string | null; passwordHash?: string; passwordSalt?: string }) => {
      const db = await readDB();
      const user = db.users.find((u: AppUser) => u.id === userId);
      if (user) {
        user.sessionToken = fields.sessionToken ?? undefined;
        if (fields.passwordHash !== undefined) user.passwordHash = fields.passwordHash;
        if (fields.passwordSalt !== undefined) user.passwordSalt = fields.passwordSalt;
      }
      await writeDB(db);
    };
    readProducts = async () => (await readDB()).products;
    readOrders = async () => (await readDB()).orders;
    readJobPriceList = async () => (await readDB()).jobPriceList;
    readJobEntries = async () => (await readDB()).jobEntries;
    readSettings = async () => (await readDB()).settings;
    readUsers = async () => (await readDB()).users;
    writeOrders = async (orders: Order[]) => {
      const db = await readDB();
      db.orders = orders;
      await writeDB(db);
    };
    // JSON mode's readOrders() already returns the real photo (the whole file
    // is loaded into memory regardless of column selection) - this only
    // exists so both persistence modes share the same call site. storagePath
    // is always null here: JSON-mode order creation never engages Supabase
    // Storage (PERSONAL_PHOTO_STORAGE_ENABLED is gated on DATABASE_URL too),
    // so local dev/testing never touches real Storage regardless of what
    // Supabase vars happen to be present in .env.
    readOrderPhotoRaw = async (orderId: string) => {
      const orders = await readOrders();
      const base64 = orders.find((o: Order) => o.id === orderId)?.personalPhotoBase64 ?? '';
      return { base64, storagePath: null };
    };
    updateOrderPersonalPhoto = async (orderId: string, base64: string, storagePath: string | null) => {
      const orders = await readOrders();
      const order = orders.find((o: Order) => o.id === orderId);
      if (order) {
        order.personalPhotoBase64 = base64;
        order.personalPhotoStoragePath = storagePath ?? undefined;
        await writeOrders(orders);
      }
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
  findUserBySessionToken(token).then((user) => {
    // A deactivated account's still-valid session token must stop working
    // immediately, not just block future logins - otherwise "deactivate"
    // wouldn't actually revoke access until the token happened to change.
    if (!user || user.active === false) {
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
    const user = await findUserByUsername(username);
    // Deliberately the same generic error for "no such user", "wrong
    // password", and "deactivated account" - a deactivated account's status
    // shouldn't be discoverable to whoever is attempting the login.
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash) || user.active === false) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }
    const sessionToken = generateSessionToken();
    await updateUserAuthFields(user.id, { sessionToken });
    res.json({ token: sessionToken, role: user.role, displayName: user.displayName });
  });
}));

// Staff Logout - invalidates the session token server-side
app.post('/api/auth/logout', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    await updateUserAuthFields(req.currentUser!.id, { sessionToken: null });
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
    // Deliberately re-read inside the lock rather than trusting req.currentUser
    // (a snapshot taken by authenticateUser before this request even queued for
    // the lock) - withDbLock is a single global queue shared by every write
    // endpoint, so a slow unrelated write ahead of this one can leave enough of
    // a gap for another change-password call to land first. Verifying against
    // a stale pre-lock hash here would let a second, now-outdated "current
    // password" still pass and silently overwrite the first change.
    const user = await findUserById(req.currentUser!.id);
    if (!user || !verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Password saat ini salah.' });
    }
    const { hash, salt } = hashPassword(newPassword);
    // Rotate the session token too - an attacker holding a previously-leaked
    // token for this account (the scenario a password change is meant to
    // recover from) must not stay authenticated after it. Mirrors how logout
    // clears sessionToken; here we issue a fresh one so this same request's
    // caller doesn't get logged out by their own password change.
    const sessionToken = generateSessionToken();
    await updateUserAuthFields(user.id, { sessionToken, passwordHash: hash, passwordSalt: salt });
    res.json({ message: 'Password berhasil diubah.', token: sessionToken });
  });
}));

// Owner-only: list users (public-safe projection, never sends hashes/tokens)
app.get('/api/users', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  const users = await readUsers();
  res.json(users.map(toPublicUser));
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
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    await writeDB(db);
    res.status(201).json(toPublicUser(newUser));
  });
}));

// Owner-only: edit name/username/role, or toggle active - never password
// (that's exclusively self-service via /api/auth/change-password). Partial
// update: only the fields present in the body are changed.
app.put('/api/users/:id', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { displayName, username, role, active } = req.body;
    const db = await readDB();
    const idx = db.users.findIndex((u: AppUser) => u.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const existing = db.users[idx];

    if (role !== undefined) {
      const validRoles: UserRole[] = ['owner', 'karyawan'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role.' });
      }
    }
    // Every downstream check (session-clearing below, authenticateUser's own
    // active gate) uses a strict `=== false` comparison - a non-boolean truthy
    // value (e.g. a stray string) would silently persist without ever
    // tripping those checks, making a deactivation attempt quietly no-op.
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Invalid active value.' });
    }
    if (username !== undefined && db.users.some((u: AppUser) => u.id !== id && u.username === username)) {
      return res.status(400).json({ error: 'Username sudah digunakan.' });
    }

    const isSelf = req.currentUser!.id === id;
    const wasActiveOwner = existing.role === 'owner' && existing.active !== false;
    const losingOwnerStatus = wasActiveOwner && (
      (role !== undefined && role !== 'owner') ||
      (active !== undefined && active === false)
    );
    if (losingOwnerStatus) {
      if (isSelf && active === false) {
        return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun Anda sendiri.' });
      }
      if (!hasOtherActiveOwner(db, id)) {
        return res.status(400).json({ error: 'Tidak bisa menonaktifkan atau mengubah role owner terakhir yang masih aktif.' });
      }
    }

    db.users[idx] = {
      ...existing,
      displayName: displayName !== undefined ? displayName : existing.displayName,
      username: username !== undefined ? username : existing.username,
      role: role !== undefined ? role : existing.role,
      active: active !== undefined ? active : existing.active,
      // Deactivating revokes any existing session immediately, same as
      // logout/change-password - belt-and-suspenders alongside authenticateUser's
      // own active check, which already rejects a deactivated user's token.
      sessionToken: active === false ? undefined : existing.sessionToken,
    };
    await writeDB(db);
    res.json(toPublicUser(db.users[idx]));
  });
}));

// Owner-only: permanently remove a user account.
app.delete('/api/users/:id', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    if (req.currentUser!.id === id) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun Anda sendiri.' });
    }
    const db = await readDB();
    const target = db.users.find((u: AppUser) => u.id === id);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (target.role === 'owner' && target.active !== false && !hasOtherActiveOwner(db, id)) {
      return res.status(400).json({ error: 'Tidak bisa menghapus owner terakhir yang masih aktif.' });
    }
    db.users = db.users.filter((u: AppUser) => u.id !== id);
    await writeDB(db);
    res.json({ message: 'User deleted successfully.' });
  });
}));

// Get Products (available to both clients and admins)
app.get('/api/products', asyncHandler(async (req, res) => {
  const products = await readProducts();
  res.json(products);
}));

// Admin CRUD: Create Product
app.post('/api/products', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { name, category, rates, readinessHours, stock, description, image, varian, size, color } = req.body;
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
      image: image || '',
      varian: varian || '',
      size: size || '',
      color: color || ''
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
    const { name, category, rates, readinessHours, stock, description, image, varian, size, color } = req.body;

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
      image: image !== undefined ? image : db.products[productIndex].image,
      varian: varian !== undefined ? varian : db.products[productIndex].varian,
      size: size !== undefined ? size : db.products[productIndex].size,
      color: color !== undefined ? color : db.products[productIndex].color
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
  await uploadToSupabaseStorage(PRODUCT_IMAGE_BUCKET, objectPath, buffer, mimeType);

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
// readiness is never applied retroactively.
//
// Active (not-yet-marked-returned) orders get readiness protection too, but
// the exact treatment depends on whether the item is confirmed to have
// physically left the shop - marking an order Item Returned/Completed is a
// manual staff click (Tanpa Denda / Terapkan Denda & Selesaikan Sewa), so
// neither status alone proves the item is actually back:
//   - Item Picked Up (pickedUpAt is set) - blocks INDEFINITELY, no upper
//     bound, until actually marked returned (owner decision, 2026-09-02: a
//     fixed buffer past endDate, tried first, still reopened a double-booking
//     window whenever a late renter's return AND a staff processing delay
//     both outlasted the assumed buffer - see this session's memory for the
//     incident this closes).
//   - Pending / Approved-Paid (never confirmed picked up) - fixed buffer past
//     the scheduled endDate only, same as a completed order's math but
//     anchored on endDate instead of returnedAt. Deliberately NOT indefinite
//     here: Approved/Paid has no auto-expiry the way Pending does (see
//     expireStaleOrders), so blocking these forever on top of an unconfirmed
//     pickup would risk permanently locking stock for a genuine no-show with
//     no recovery path.
// Either way, the moment an order actually gets marked returned, it switches
// to the isCompleted branch below using the real returnedAt, which can only
// ever move the window earlier (an early return frees stock sooner,
// unchanged pre-existing behavior) never later.
//
// order.returnedAt is a real UTC instant (.toISOString()); its calendar day
// must be read in Asia/Jakarta, not the server process's own ambient
// timezone (same reasoning as the pickedUpAt/returnDateTime fix above - don't
// let a future host with a different ambient TZ, e.g. a cloud container
// defaulting to UTC, silently misreport the day) and not a plain string split
// on the raw ISO text either (that grabs the UTC day, which is a calendar day
// early for any return between local midnight and 07:00 WIB - it would start,
// and therefore end, the readiness-blocked window one day too soon).
function jakartaDateString(instant: string): string {
  return new Date(new Date(instant).getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function calculateAllocatedStock(orders: Order[], products: Product[], startDateStr: string, endDateStr: string, excludeOrderId?: string): Record<string, number> {
  const startReq = new Date(startDateStr);
  const endReq = new Date(endDateStr);

  const readinessDaysById = new Map(products.map(p => [p.id, Math.ceil((p.readinessHours || 0) / 24)]));

  const allocationMap: Record<string, number> = {};

  // Legacy completed orders (no returnedAt) are excluded entirely, same as before.
  // Expired orders never block stock either - by the time this runs, expireStaleOrders
  // has already persisted any stale Pending->Expired flip earlier in the same request.
  // excludeOrderId lets editing an order's own items/dates check availability
  // without that order's own current allocation counting against itself.
  const relevantOrders = orders.filter(o =>
    o.id !== excludeOrderId &&
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
        let effectiveEnd: Date | null; // null = no upper bound, blocks every future day
        if (isCompleted) {
          // Blocked range is anchored on the actual return date, not the original
          // orderStart - the historical rental days are moot once returned. Spans
          // exactly `readinessDays` calendar days starting on the return day itself.
          // When readinessDays is 0, effectiveEnd lands one day BEFORE effectiveStart,
          // making the range empty - i.e. no blocking at all, immediately available
          // even on the return day itself, matching the pre-readiness-feature default.
          effectiveStart = new Date(jakartaDateString(order.returnedAt!));
          effectiveEnd = new Date(jakartaDateString(order.returnedAt!));
          effectiveEnd.setDate(effectiveEnd.getDate() + (readinessDaysById.get(item.productId) || 0) - 1);
        } else if (order.status === 'Item Picked Up') {
          // Confirmed physically out (pickedUpAt is only ever set on this
          // exact transition, in PUT /api/orders/:id/status), not yet
          // confirmed back - block every day from here on, no matter how far
          // in the future, until the order is actually marked returned.
          // Owner decision (2026-09-02): a fixed buffer past the scheduled
          // endDate (the old rule below, previously applied here too) still
          // reopened a double-booking window whenever the renter returned
          // late AND staff was slow to process it - a late return plus a
          // processing delay could both outlast the assumed buffer. Accepting
          // "stock looks unavailable a bit longer than strictly necessary if
          // staff is slow to click 'returned'" as the safer failure mode than
          // "double-booked" here. The moment it's marked Completed, the
          // isCompleted branch above takes over using the real returnedAt,
          // which can only ever free stock sooner than this, never later.
          effectiveStart = orderStart;
          effectiveEnd = null;
        } else {
          // Pending / Approved-Paid, never confirmed picked up - fixed buffer
          // past the scheduled endDate, NOT indefinite. Unlike Item Picked Up,
          // this status was never confirmed to have physically left the shop,
          // and Approved/Paid has no auto-expiry the way Pending does (see
          // expireStaleOrders) - blocking these indefinitely on top of an
          // unconfirmed pickup would risk permanently locking stock for a
          // genuine no-show with no recovery path, a worse failure mode than
          // the one this exists to close. endDate itself is already blocked
          // by the rental occupancy alone, readiness or not; readinessDays is
          // added ON TOP of endDate (not endDate + readinessDays - 1, which
          // would wrongly shrink the window for the common readinessDays=0
          // case - caught before shipping the original fix: that formula
          // moves effectiveEnd a day EARLIER than endDate itself when there's
          // no readiness configured).
          //
          // effectiveStart is likewise pulled BACKWARD by readinessDays
          // (owner-reported bug, 2026-09-13): readiness is the gap needed
          // between one rental's return and the next one's pickup, and that
          // gap has to be enforced from whichever side of it already exists
          // in the system. The forward extension above only protects a NEW
          // booking from starting too soon after THIS order's end - it does
          // nothing to stop a NEW booking from ending too close BEFORE this
          // order's own start (e.g. a tent already booked from Sept 14 with
          // 48h readiness still let a new booking run through Sept 13, only
          // 24h of clearance). Pulling effectiveStart back the same way
          // effectiveEnd is pushed forward makes the buffer symmetric, so it
          // catches the conflict regardless of which order was booked first.
          effectiveStart = new Date(order.startDate);
          effectiveStart.setDate(effectiveStart.getDate() - (readinessDaysById.get(item.productId) || 0));
          effectiveEnd = new Date(order.endDate);
          effectiveEnd.setDate(effectiveEnd.getDate() + (readinessDaysById.get(item.productId) || 0));
        }

        if (currentDay >= effectiveStart && (effectiveEnd === null || currentDay <= effectiveEnd)) {
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

// An order left Pending for more than settings.pendingExpiryHours (default 2,
// editable in Pengaturan -> Toleransi Keterlambatan) with no payment
// confirmation is treated as abandoned - it's flipped to Expired so it stops
// blocking stock and shows up distinctly in the admin order list. No
// cron/background worker exists in this app (single Express process, no
// scheduler infra); this mirrors the existing calculate-late lazy-computation
// pattern, but runs automatically at the top of every route that reads orders,
// rather than behind an explicit button click, so stock availability and the
// order list reflect expiry promptly. Each order flips at most once, so
// repeated calls are self-limiting. Staff can still manually approve payment
// on an Expired order afterwards (see PUT /api/orders/:id/status's
// validStatuses) - expiring never revokes stock, it just stops reserving it,
// and remains reversible.
// A Pending order with a live WuzzPay payment_instruction (see
// applyWuzzpaySettlementStatus) is never expired while that instruction's own
// expires_at is still in the future - don't kill an order while its real
// payment window is genuinely still open. Falls back to the pure
// createdAt-based rule for orders with no gateway charge yet, which covers
// legacy orders and the first few minutes of every order. Even if this guard
// is bypassed by a stale/missing expires_at, a late-arriving confirmed
// settlement still recovers an Expired order (applyWuzzpaySettlementStatus
// allows the Expired -> Approved/Paid transition too) - defense in depth, not
// a single point of failure.
function expireStaleOrders(orders: Order[], pendingExpiryHours: number): boolean {
  const now = Date.now();
  const expiryMs = (pendingExpiryHours ?? 2) * 60 * 60 * 1000;
  let changed = false;
  for (const order of orders) {
    const instructionExpiresAt = order.paymentInstruction?.expires_at;
    if (typeof instructionExpiresAt === 'string' && new Date(instructionExpiresAt).getTime() > now) {
      continue;
    }
    if (order.status === 'Pending' && now - new Date(order.createdAt).getTime() > expiryMs) {
      order.status = 'Expired';
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({
        status: 'Expired',
        changedAt: new Date().toISOString(),
        changedByUserId: 'system',
        changedByName: 'Sistem (Otomatis)',
      });
      changed = true;
    }
  }
  return changed;
}

// Check Availability (Available to clients and admins)
app.post('/api/check-availability', asyncHandler(async (req, res) => {
  const { startDate, endDate, items, excludeOrderId } = req.body; // items is optional array of { productId, quantity }; excludeOrderId lets an order being edited check availability without its own current allocation counting against itself
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing start date or end date.' });
  }

  await withDbLock(async () => {
    // Narrow readers, not the full readDB - this route never touches
    // users/jobPriceList/jobEntries, only writes orders (the occasional
    // expiry flip), and it's hit constantly while a customer browses/adjusts
    // their cart, so the full 6-table sync a readDB()/writeDB() round trip
    // pulls in Postgres mode was pure waste on the app's hottest read path.
    const [orders, products, settings] = await Promise.all([readOrders(), readProducts(), readSettings()]);
    if (expireStaleOrders(orders, settings.pendingExpiryHours)) {
      await writeOrders(orders);
    }
    const allocatedMap = calculateAllocatedStock(orders, products, startDate, endDate, excludeOrderId);

    const availabilityDetails = products.map((prod: Product) => {
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
    // Same-day pickup/return isn't a bookable option (owner decision,
    // 2026-08-30) - the client's own date picker already prevents selecting
    // it (DateRangePicker's endDate `min`), this is the real enforcement.
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      return res.status(400).json({ error: 'Tanggal selesai sewa harus setelah tanggal mulai sewa.' });
    }

    // Narrow readers, not the full readDB - this route only ever needs
    // orders/products/settings, never touches users/jobPriceList/jobEntries,
    // and only ever writes orders (see writeOrders below). The full
    // readDB/writeDB round trip does an unconditional 6-table sync (measured
    // multiple seconds against production Supabase) that this checkout path
    // was silently paying on every single booking for no reason.
    const [orders, products, settings] = await Promise.all([readOrders(), readProducts(), readSettings()]);
    if (expireStaleOrders(orders, settings.pendingExpiryHours)) {
      await writeOrders(orders);
    }

    // 1. Re-verify stock availability server-side to guarantee integrity
    const allocatedMap = calculateAllocatedStock(orders, products, startDate, endDate);

    for (const item of items) {
      const product = products.find((p: Product) => p.id === item.productId);
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
    // Non-inclusive ("nights") day count: 16th -> 17th is 1 day, not 2. The
    // validation above already guarantees endDate > startDate, so
    // Math.max(1, ...) is now just a defensive floor, not doing real work.
    const rentDuration = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // 3. Calculate Item Costs and Total Price
    let totalPrice = 0;
    const orderItems = items.map((it: any) => {
      const prod = products.find((p: Product) => p.id === it.productId)!;

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

    // 4. Upload the personal photo to Supabase Storage instead of storing it
    // inline, when Storage is configured - see PERSONAL_PHOTO_STORAGE_ENABLED
    // and src/types.ts's Order.personalPhotoStoragePath comment for the full
    // rationale (this replaced storing raw base64 directly in Postgres, which
    // measurably bloated the orders table and caused real memory pressure).
    // Failure here degrades gracefully to the original inline-base64 behavior
    // rather than ever blocking a booking - unlike a read-time signing
    // failure (see readOrderPhoto), a create-time upload failure has an
    // obvious, harmless fallback: just keep what we already have in hand.
    const photoResult = await processPersonalPhotoUpload(personalPhotoBase64);
    if ('error' in photoResult) {
      return res.status(photoResult.status).json({ error: photoResult.error });
    }

    // 5. Create Order Object
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
      personalPhotoBase64: photoResult.base64,
      personalPhotoStoragePath: photoResult.storagePath ?? undefined,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    orders.unshift(newOrder); // Add to beginning
    await writeOrders(orders);

    createdOrder = newOrder;
    // personalPhotoStoragePath is internal bookkeeping only (see its type
    // comment) - the client only ever reads confirmationToken from this
    // response (confirmed via useOrderSubmission.ts), but strip it anyway,
    // same minimal-projection care as every other admin/internal-only field.
    const { personalPhotoStoragePath: _personalPhotoStoragePath, ...responseOrder } = newOrder;
    res.status(201).json(responseOrder);
  });
  if (createdOrder) {
    sendTelegramBookingNotification(createdOrder).catch(err => console.error('Telegram booking notification failed:', err));
  }
}));

// Get Order Confirmation (Public, by unguessable token - NOT by order.id)
app.get('/api/orders/confirm/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  // Narrow readOrders, not the full readDB - public route, hit on every
  // order-confirmation page load/reload/poll.
  const orders = await readOrders();
  const order = orders.find((o: Order) => o.confirmationToken && o.confirmationToken === token);

  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  }

  const { personalPhotoBase64, personalPhotoStoragePath, statusHistory, penalties, wuzzpayTransactionId, wuzzpayLastStatus, wuzzpayDuplicatePayment, ...safeOrder }: Order = order;
  const publicOrder: PublicOrder = safeOrder;
  res.json(publicOrder);
}));

// Admin: Get all orders - strips personalPhotoBase64 (see GET /api/orders/:id
// below for the single-order fetch that includes it) so this list payload
// doesn't grow with every order's photo forever.
app.get('/api/orders', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
    if (expireStaleOrders(orders, settings.pendingExpiryHours)) {
      await writeOrders(orders);
    }
    const orderList: OrderListItem[] = orders.map((o: Order) => {
      const { personalPhotoBase64, personalPhotoStoragePath, ...rest } = o;
      return rest;
    });
    res.json(orderList);
  });
}));

// Admin: Get a single order in full (including personalPhotoBase64) - used
// by OrderDetailPanel when opened, since the list above omits the photo.
// readOrders() itself no longer carries the real photo in Postgres mode (see
// readOrdersPostgres's comment) - fetched separately here via readOrderPhoto,
// the one place in the app that actually needs it.
app.get('/api/orders/:id', authenticateUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const orders = await readOrders();
  const order = orders.find((o: Order) => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  order.personalPhotoBase64 = await readOrderPhoto(id);
  res.json(order);
}));

// Admin: retroactively attach a personal photo to an order that has none -
// e.g. the customer skipped it on the booking form and staff verified their
// ID in person instead, but later want a photo on file after all. Optional by
// design: an order is allowed to have no photo forever (see OrderDetailPanel's
// "Tidak ada foto diunggah" placeholder) - this route exists purely so staff
// *can* add one, never to require it. Same authenticateUser gate as viewing
// the photo (GET /api/orders/:id) - not a new privilege boundary.
app.post('/api/orders/:id/personal-photo', authenticateUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { photo } = req.body;
  if (!photo || typeof photo !== 'string') {
    return res.status(400).json({ error: 'Foto wajib disertakan.' });
  }

  const orders = await readOrders();
  const order = orders.find((o: Order) => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  // Enforce "attach only when there is none" server-side, not just as a UI
  // convention (OrderDetailPanel only renders the upload UI when
  // personalPhotoBase64 is already empty, but that alone doesn't stop a
  // direct API call). readOrders() excludes both photo columns from its
  // query in Postgres mode (see readOrdersPostgres's comment), so `order`
  // here can't be trusted to reflect the real state - check via
  // readOrderPhotoRaw instead, which does. Any staff account with
  // authenticateUser can reach this route; without this check, one could
  // silently overwrite a real customer's identity photo on any order,
  // including an already-completed one, with no confirmation or trace - this
  // route exists only to fill in a missing photo, never to replace one.
  const existing = await readOrderPhotoRaw(id);
  if (existing.base64 || existing.storagePath) {
    return res.status(409).json({ error: 'Pesanan ini sudah memiliki foto - tidak bisa diganti lewat sini.' });
  }

  // Slow network call - deliberately outside withDbLock, same reasoning as
  // fetchWuzzpaySettlementStatus (never hold the process-wide lock across an
  // outbound network call).
  const result = await processPersonalPhotoUpload(photo);
  if ('error' in result) {
    return res.status(result.status).json({ error: result.error });
  }

  await withDbLock(async () => {
    await updateOrderPersonalPhoto(id, result.base64, result.storagePath);
  });

  order.personalPhotoBase64 = await readOrderPhoto(id);
  res.json(order);
}));

// Admin: edit a Pending order's items and/or rental dates - staff correcting
// a booking (add/remove/swap items, change quantities, reschedule) without
// cancelling and recreating it. Allowed up through Approved/Paid - once the
// item is physically handed over (Item Picked Up), items/dates are considered
// locked in. Sends the full replacement items array (not a delta), same shape
// as the client-side cart, so add/remove/swap/change-quantity are all covered
// by one save.
app.put('/api/orders/:id/edit', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { startDate, endDate, items } = req.body; // items: { productId: string; quantity: number }[]
    // Narrow readers, not the full readDB - only ever mutates orders (see
    // writeOrders below); products is only ever read here, for pricing/stock.
    const [orders, products] = await Promise.all([readOrders(), readProducts()]);
    const orderIndex = orders.findIndex((o: Order) => o.id === id);
    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = orders[orderIndex];
    if (order.status !== 'Pending' && order.status !== 'Approved/Paid') {
      return res.status(400).json({ error: 'Pesanan hanya bisa diedit sebelum barang diambil (status Pending atau Approved/Paid).' });
    }
    if (!startDate || !endDate || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Tanggal dan minimal satu item wajib diisi.' });
    }
    // Same rule as order creation - same-day pickup/return isn't bookable.
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      return res.status(400).json({ error: 'Tanggal selesai sewa harus setelah tanggal mulai sewa.' });
    }

    // Same non-inclusive "nights" formula as order creation. The Math.max(1, ...)
    // floor is now just defensive (the check above already guarantees at
    // least one day) rather than doing real work.
    const diffTime = Math.abs(new Date(endDate).getTime() - new Date(startDate).getTime());
    const rentDuration = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Stock check excluding this order's own current allocation, so
    // re-saving the same items/dates (or a smaller change) isn't rejected
    // for "conflicting" with itself.
    const allocatedMap = calculateAllocatedStock(orders, products, startDate, endDate, id);
    const newItems: OrderItem[] = [];
    let totalPrice = 0;
    for (const it of items) {
      const product = products.find((p: Product) => p.id === it.productId);
      if (!product) {
        return res.status(400).json({ error: 'Salah satu produk tidak ditemukan di katalog.' });
      }
      const qty = Number(it.quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Jumlah untuk ${product.name} tidak valid.` });
      }
      const remaining = product.stock - (allocatedMap[product.id] || 0);
      if (qty > remaining) {
        return res.status(400).json({ error: `Stok ${product.name} tidak cukup (tersisa ${remaining}).` });
      }
      totalPrice += calculateRentalCost(product.rates, rentDuration) * qty;
      newItems.push({ productId: product.id, productName: product.name, quantity: qty, ratesSnapshot: { ...product.rates } });
    }

    orders[orderIndex] = { ...order, startDate, endDate, rentDuration, items: newItems, totalPrice };
    orders[orderIndex].statusHistory = orders[orderIndex].statusHistory || [];
    orders[orderIndex].statusHistory.push({
      status: order.status,
      action: 'Item/Tanggal Diubah',
      changedAt: new Date().toISOString(),
      changedByUserId: req.currentUser!.id,
      changedByName: req.currentUser!.displayName,
    });
    await writeOrders(orders);
    res.json(orders[orderIndex]);
  });
}));

// Admin: Update order status
app.put('/api/orders/:id/status', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { status, pickupIdType, amountPaid } = req.body;

    const validStatuses: OrderStatus[] = ['Pending', 'Approved/Paid', 'Item Picked Up', 'Item Returned/Completed', 'Expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status.' });
    }

    // Narrow readers/writer, not the full readDB/writeDB - this route only
    // ever touches a single order.
    const orders = await readOrders();
    const orderIndex = orders.findIndex((o: Order) => o.id === id);
    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const previousStatus = orders[orderIndex].status;
    orders[orderIndex].status = status;
    // Audit trail of who made this transition - skip no-op resends of the
    // same status so the history only records real changes.
    if (previousStatus !== status) {
      orders[orderIndex].statusHistory = orders[orderIndex].statusHistory || [];
      orders[orderIndex].statusHistory.push({
        status,
        changedAt: new Date().toISOString(),
        changedByUserId: req.currentUser!.id,
        changedByName: req.currentUser!.displayName,
      });
    }
    // Stamp the actual pickup time once, on the transition into Item Picked
    // Up - this is what calculate-late now anchors the late-fee deadline on
    // (pickedUpAt + rentDuration*24h), mirroring returnedAt's exact "set once"
    // pattern below. Kept separate from the pickupIdType capture just below,
    // which intentionally has no such guard (it can be resent/overwritten).
    if (status === 'Item Picked Up' && previousStatus !== 'Item Picked Up') {
      orders[orderIndex].pickedUpAt = new Date().toISOString();
    }
    // Record which physical ID card was left as collateral in person, on the
    // transition into Item Picked Up.
    if (status === 'Item Picked Up' && pickupIdType) {
      orders[orderIndex].pickupIdType = pickupIdType;
    }
    // First confirmation of payment - captures how much was actually collected
    // (a down payment or the full amount), defaulting to the full totalPrice
    // when the client sends nothing, so the common no-DP case is unchanged.
    // Late fee isn't known yet at this point, so the cap is just totalPrice.
    if (status === 'Approved/Paid' && previousStatus !== 'Approved/Paid') {
      const total = orders[orderIndex].totalPrice;
      if (amountPaid !== undefined) {
        const paid = Number(amountPaid);
        if (isNaN(paid) || paid < 0 || paid > total) {
          return res.status(400).json({ error: 'Jumlah pembayaran tidak valid.' });
        }
        orders[orderIndex].amountPaid = paid;
      } else {
        orders[orderIndex].amountPaid = total;
      }
    }
    // Stamp the actual return time once, on the transition into Completed - this
    // is what the readiness-time stock calculation anchors on (calculateAllocatedStock).
    // Also auto-settles the remaining balance (including any late fee and any
    // damage/loss penalties) here, matching the real-world flow: the renter
    // pays off the rest on return.
    if (status === 'Item Returned/Completed' && previousStatus !== 'Item Returned/Completed') {
      orders[orderIndex].returnedAt = new Date().toISOString();
      orders[orderIndex].amountPaid = orders[orderIndex].totalPrice + (orders[orderIndex].lateFee || 0) + getPenaltyTotal(orders[orderIndex]);
    }
    await writeOrders(orders);
    res.json(orders[orderIndex]);
  });
}));

// Admin: manually ask WuzzPay for this order's real transaction status, on
// demand - rather than waiting for the webhook or the customer's own open
// payment page to catch a settlement. Exists specifically for the gap
// confirmed 2026-08-26 in production: a customer who pays and closes their
// tab before a single payment-status poll completes depends entirely on the
// webhook, which isn't guaranteed to arrive for every provider/event. Staff
// previously had no way to actually verify a claimed payment other than
// trusting the customer and clicking "Konfirmasi Pembayaran" blind. This is
// the exact same fetchWuzzpaySettlementStatus + applyWuzzpaySettlementStatus
// pair the public payment-status route already uses (see its own comments) -
// not a new WuzzPay integration, just an admin-triggered on-demand version of
// the identical check. Only meaningful for orders that actually went through
// WuzzPay (wuzzpayTransactionId set) - cash orders never have one.
app.post('/api/orders/:id/verify-payment', authenticateUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const findById = (orders: Order[]) => orders.find((o: Order) => o.id === id);

  const presenceCheck = await withDbLock(async () => {
    const order = findById(await readOrders());
    return order ? { hasAttempts: getOrderAttempts(order).length > 0 } : null;
  });
  if (!presenceCheck) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  if (!presenceCheck.hasAttempts) {
    return res.status(400).json({ error: 'Pesanan ini tidak memiliki transaksi WuzzPay untuk diverifikasi (kemungkinan dibayar tunai).' });
  }

  // Checks every still-live attempt (multi-channel, 2026-10-26), not just a
  // single tracked transaction id - see pollAndSettleOrderAttempts.
  const { notifyOrder, duplicateOrder } = await pollAndSettleOrderAttempts(findById, id);
  if (notifyOrder) {
    console.log(`WuzzPay manual verification settled order ${notifyOrder.id} via transaction ${notifyOrder.wuzzpayTransactionId}`);
    sendTelegramPaymentNotification(notifyOrder).catch(err => console.error('Telegram payment notification failed:', err));
  }
  if (duplicateOrder) {
    console.error(`WuzzPay manual verification found a DUPLICATE payment on order ${duplicateOrder.id}`);
    sendTelegramDuplicatePaymentAlert(duplicateOrder).catch(err => console.error('Telegram duplicate-payment alert failed:', err));
  }

  const result = await withDbLock(async () => {
    const order = findById(await readOrders());
    return order ? { order } : null;
  });
  if (!result) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  res.json(result.order);
}));

// Admin: correct/top-up the amount collected on an order without changing its
// status - e.g. a partially-paying customer tops up before pickup. Capped at
// the current full invoice (totalPrice + lateFee + any penalties, if already calculated).
app.put('/api/orders/:id/payment', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { amountPaid } = req.body;
    // Narrow readers/writer, not the full readDB/writeDB.
    const orders = await readOrders();
    const idx = orders.findIndex((o: Order) => o.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = orders[idx];
    const cap = order.totalPrice + (order.lateFee || 0) + getPenaltyTotal(order);
    const paid = Number(amountPaid);
    if (isNaN(paid) || paid < 0 || paid > cap) {
      return res.status(400).json({ error: 'Jumlah pembayaran tidak valid.' });
    }
    orders[idx].amountPaid = paid;
    await writeOrders(orders);
    res.json(orders[idx]);
  });
}));

// Admin: add a damage/loss penalty entry to an order - only while staff still
// has the item in front of them at return (Approved/Paid or Item Picked Up),
// matching where Kalkulator Denda itself is shown. Once Completed, the
// invoice is already settled (see the auto-settle above).
app.post('/api/orders/:id/penalties', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { type, productId, description, amount } = req.body;
    // Narrow readers/writer, not the full readDB/writeDB.
    const orders = await readOrders();
    const order = orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.status !== 'Approved/Paid' && order.status !== 'Item Picked Up') {
      return res.status(400).json({ error: 'Denda hanya bisa ditambahkan sebelum pesanan diselesaikan.' });
    }
    if (type !== 'Kerusakan' && type !== 'Kehilangan') {
      return res.status(400).json({ error: 'Jenis denda tidak valid.' });
    }
    const item = order.items.find((i: OrderItem) => i.productId === productId);
    if (!item) {
      return res.status(400).json({ error: 'Item tidak ditemukan pada pesanan ini.' });
    }
    const trimmedDescription = String(description || '').trim();
    if (!trimmedDescription) {
      return res.status(400).json({ error: 'Deskripsi/alasan denda wajib diisi.' });
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ error: 'Jumlah denda tidak valid.' });
    }
    order.penalties = order.penalties || [];
    order.penalties.push({
      id: `penalty-${Date.now()}`,
      type,
      productId,
      productName: item.productName,
      description: trimmedDescription,
      amount: numAmount,
      createdAt: new Date().toISOString(),
    });
    await writeOrders(orders);
    res.json(order);
  });
}));

// Admin: remove a mistakenly-added penalty entry, same status guard as above.
app.delete('/api/orders/:id/penalties/:penaltyId', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id, penaltyId } = req.params;
    // Narrow readers/writer, not the full readDB/writeDB.
    const orders = await readOrders();
    const order = orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    // Owner can override this restriction and remove a penalty at any time,
    // even after the order is completed - staff (karyawan) keep the
    // before-completion-only restriction.
    const isOwnerOverride = req.currentUser!.role === 'owner';
    if (!isOwnerOverride && order.status !== 'Approved/Paid' && order.status !== 'Item Picked Up') {
      return res.status(400).json({ error: 'Denda hanya bisa diubah sebelum pesanan diselesaikan.' });
    }
    order.penalties = (order.penalties || []).filter((p: PenaltyEntry) => p.id !== penaltyId);
    await writeOrders(orders);
    res.json(order);
  });
}));

// Admin (owner-only): permanently delete an order - e.g. an erroneous
// double-booking. Not allowed once Item Returned/Completed, so a settled
// order's revenue can never silently disappear from stats/reports. No
// Postgres-specific sync code needed - writeOrdersPostgres already prunes any
// order (and cascade-deletes its order_items) no longer present in the
// dataset on every write, same mechanism DELETE /api/products/:id relies on
// for its own table.
app.delete('/api/orders/:id', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    // Narrow readers/writer, not the full readDB/writeDB - this was the
    // route reported slow (2026-08-20): a full 6-table transactional sync
    // for deleting one row from one table.
    let orders = await readOrders();
    const order = orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    if (order.status === 'Item Returned/Completed') {
      return res.status(400).json({ error: 'Pesanan yang sudah selesai tidak bisa dihapus.' });
    }
    orders = orders.filter((o: Order) => o.id !== id);
    await writeOrders(orders);
    res.json({ message: 'Order deleted successfully.' });
  });
}));

// Admin (owner-only): remove/reset an already-applied late fee (lateDays/lateFee
// back to 0), even after completion - symmetric to the penalty delete override
// above. Deliberately doesn't touch amountPaid; getRemainingBalance() already
// clamps to 0, so an order that's now "overpaid" relative to the lower invoice
// just shows as Lunas, same as how removing a penalty already behaves.
app.delete('/api/orders/:id/late-fee', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    // Narrow readers/writer, not the full readDB/writeDB.
    const orders = await readOrders();
    const order = orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    order.lateDays = 0;
    order.lateFee = 0;
    await writeOrders(orders);
    res.json(order);
  });
}));

// Admin: Calculate late returns and penalty fees
app.post('/api/orders/:id/calculate-late', authenticateUser, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { returnDateTime } = req.body; // "YYYY-MM-DDTHH:mm" local string (defaults to now if not provided)

    // Narrow readers, not the full readDB - only ever needs orders+settings
    // (never users/products/jobPriceList/jobEntries), and only ever writes
    // the one order (see writeOrders below).
    const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
    const order = orders.find((o: Order) => o.id === id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    // A late-return fee only makes sense once the item has actually been
    // handed over - calculating one before Item Picked Up (e.g. while still
    // Approved/Paid) would charge for lateness that can't have happened yet.
    if (order.status !== 'Item Picked Up') {
      return res.status(400).json({ error: 'Denda keterlambatan hanya bisa dihitung setelah barang diambil.' });
    }

    // returnDateTime is a bare "YYYY-MM-DDTHH:mm" string typed by the admin in
    // their own (Asia/Jakarta) browser, with no timezone info attached. Naively
    // parsing it with `new Date(returnDateTime)` makes JS interpret it using
    // whatever timezone the SERVER PROCESS itself happens to run in - if that's
    // not Asia/Jakarta (e.g. a cloud container defaulting to UTC), the literal
    // is silently read as 7 hours later than the admin actually meant, which is
    // enough to flip a genuinely on-time return into a false "1 day late" charge
    // (confirmed against a real owner-reported case: pickup 19-08 21:20, return
    // 20-08 19:37, tolerance-adjusted deadline 21-08 01:20 - return is ~5h43m
    // *before* the deadline, but a 7h UTC misread pushes it ~1h17m *past* it).
    // This didn't matter before the pickup-anchored deadline change, because
    // both sides of the comparison were naive-parsed the same way and any
    // server-timezone error canceled out; now pickedUpAt-derived deadlines are
    // real UTC instants (.toISOString()), so this side must be anchored
    // explicitly to Asia/Jakarta (fixed UTC+7, no DST) rather than left to the
    // server's ambient timezone. `new Date()` (no returnDateTime supplied,
    // "use current time") is unaffected - it's already a real UTC instant.
    const actualReturn = returnDateTime ? new Date(`${returnDateTime}:00+07:00`) : new Date();

    // Deadline = actual pickup time + the full rented duration (owner's
    // requested rule: "a day" is 24 hours from hand-over, not a calendar
    // day) - not the booked endDate's closing time. pickedUpAt is a full UTC
    // ISO instant (.toISOString()), so .getTime() arithmetic here is
    // unambiguous, unlike endDate (a bare calendar-date string).
    let deadline: Date;
    if (order.pickedUpAt) {
      deadline = new Date(new Date(order.pickedUpAt).getTime() + order.rentDuration * 24 * 60 * 60 * 1000);
    } else {
      // Legacy fallback for an order that reached Item Picked Up before this
      // field existed - same "fall back gracefully" treatment already given
      // to returnedAt-less legacy orders elsewhere (calculateAllocatedStock).
      const endDateDow = new Date(`${order.endDate}T00:00:00`).getDay();
      const closeTime = settings.operatingHours[WEEKDAY_KEYS[endDateDow]].close;
      deadline = new Date(`${order.endDate}T${closeTime}:00`);
    }

    // Tolerance is a flat grace buffer added ONCE to the deadline - not
    // re-applied per elapsed day. Owner correction (2026-08-19): the previous
    // version only used lateToleranceHours to decide whether hoursLate counted
    // as zero days late; once past that window, lateDays was computed from
    // the raw pre-tolerance deadline, so the tolerance's benefit evaporated
    // entirely the moment it was exceeded instead of just shifting the whole
    // clock forward once (e.g. 24h05m past the raw deadline rounded up to 2
    // days late, even though that's only ~20h past the tolerance-adjusted
    // deadline). Also drops the previous "store must be physically open"
    // condition on the tolerance - that rule's rationale only made sense under
    // the old closing-time-anchored deadline (past closing = store obviously
    // shut); it doesn't carry over now that the deadline is pickup-time
    // anchored and can fall at any hour (owner confirmed via AskUserQuestion).
    const effectiveDeadline = new Date(deadline.getTime() + settings.lateToleranceHours * 60 * 60 * 1000);
    const hoursLate = Math.max(0, (actualReturn.getTime() - effectiveDeadline.getTime()) / (1000 * 60 * 60));
    const lateDays = hoursLate === 0 ? 0 : Math.ceil(hoursLate / 24);

    // Calculate late fee per item - skipped when on-time (lateFeeTotal/
    // breakdown just stay at their zero defaults below), but persistence
    // always runs regardless of lateDays, so a recalculation that comes back
    // on-time actually clears a previously-persisted non-zero fee instead of
    // leaving it silently out of sync with what this response says.
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
    let breakdown: { productName: string; quantity: number; dailyRateBreakdown: string; itemTotalLateCost: number }[] = [];
    if (lateDays > 0) {
      breakdown = order.items.map(item => {
        let itemLateCost: number;

        if (item.ratesSnapshot) {
          itemLateCost = calculateRentalCost(item.ratesSnapshot, order.rentDuration + lateDays)
            - calculateRentalCost(item.ratesSnapshot, order.rentDuration);
        } else {
          const basePrice = item.legacyPricePerDay!;
          const incremental = item.legacyIncrementalPrice ?? 0;
          const discountThresholdDays = item.legacyDiscountThresholdDays ?? 5;
          itemLateCost = calculateLegacyRentalCost(basePrice, incremental, discountThresholdDays, order.rentDuration + lateDays)
            - calculateLegacyRentalCost(basePrice, incremental, discountThresholdDays, order.rentDuration);
        }
        itemLateCost = Math.max(0, itemLateCost); // defensive: a mistyped (non-monotonic) rate table could otherwise produce a negative late fee

        const itemTotalLateCost = itemLateCost * item.quantity;
        lateFeeTotal += itemTotalLateCost;

        // Describes the days actually being charged (order.rentDuration+1 through
        // +lateDays), not a fixed "5 Hari" - the marginal per-day cost only equals
        // day5Price/extraDayRate when those late days actually fall past day 5; for
        // a short rental returned late, they don't, and the old hardcoded string
        // named the wrong tier entirely regardless of what was really charged.
        const perDayLateRate = Math.round(itemLateCost / lateDays);
        const dailyRateBreakdown = `Rp${perDayLateRate.toLocaleString('id-ID')}/hari x ${lateDays} hari telat`;

        return {
          productName: item.productName,
          quantity: item.quantity,
          dailyRateBreakdown,
          itemTotalLateCost
        };
      });
    }

    // Save the late fees back to order
    order.lateDays = lateDays;
    order.lateFee = lateFeeTotal;

    // Note: We don't save DB immediately, user can confirm returning, then status updates and saves,
    // but let's save these calculated values now so they stick to the order.
    const orderIndex = orders.findIndex((o: Order) => o.id === id);
    orders[orderIndex] = order;
    await writeOrders(orders);

    res.json({
      lateDays,
      lateFee: lateFeeTotal,
      breakdown,
      deadline: effectiveDeadline.toISOString() // the real no-penalty-before-this cutoff (tolerance already included)
    });
  });
}));

// Public: whether the WuzzPay gateway is configured - lets the client fall
// back to the legacy manual QRIS-mock/WhatsApp flow untouched when it isn't.
// Also doubles as the instant kill-switch in production: unsetting
// WUZZPAY_API_KEY reverts the client to the old flow immediately.
app.get('/api/payment-config', asyncHandler(async (req, res) => {
  // Narrow readSettings, not the full readDB - this route is public and hit
  // on every confirmation page load, same reasoning as store-info above.
  // pendingExpiryHours is included so the client can tell the customer how
  // long they have before an unpaid order (cash included - only a live
  // WuzzPay payment_instruction defers this, see expireStaleOrders) is
  // automatically expired.
  const settings = await readSettings();
  res.json({ enabled: Boolean(WUZZPAY_API_KEY && WUZZPAY_MERCHANT_ID), pendingExpiryHours: settings.pendingExpiryHours, channels: settings.paymentChannels });
}));

// Public, scoped by the same unguessable confirmationToken as GET
// /api/orders/confirm/:token (order.id itself is order-${Date.now()}, guessable,
// so the token is the only safe public key - see that route above). Triggers a
// real WuzzPay charge for the order's already-computed totalPrice; the amount
// is never taken from the request body.
app.post('/api/orders/confirm/:token/charge', asyncHandler(async (req, res) => {
  if (!WUZZPAY_API_KEY || !WUZZPAY_MERCHANT_ID) {
    return res.status(503).json({ error: 'Payment gateway belum dikonfigurasi.' });
  }
  const { productId, bankCode, amount } = req.body;
  if (productId !== 'qris' && productId !== 'va' && productId !== 'emoney') {
    return res.status(400).json({ error: 'Metode pembayaran tidak valid.' });
  }
  // Channel on/off is now admin-editable (Pengaturan > Metode Pembayaran,
  // StoreSettings.paymentChannels - 2026-10-28), replacing what used to be a
  // standalone hardcoded emoney block here. Checked server-side regardless of
  // what the client's picker shows, same reasoning as before: no stray
  // request should reach WuzzPay for a channel the owner has turned off.
  const settingsForCharge = await readSettings();
  if (!settingsForCharge.paymentChannels[productId as 'qris' | 'va' | 'emoney']) {
    return res.status(503).json({ error: 'Metode pembayaran ini sedang tidak tersedia.' });
  }
  // bankCode selects the sub-channel for va (bank) / emoney (wallet) - validated
  // against the same known-code lists the client's picker offers, so no
  // arbitrary string reaches WuzzPay's API unchecked (belt-and-suspenders on
  // top of productId's own enum check above). Numeric interbank codes, NOT
  // the letter codes ("BCA") shown on WuzzPay's own "Bank List" doc page -
  // confirmed empirically against the sandbox (Stage 2 of the payment gateway
  // plan): a letter code was rejected downstream by their provider (espay)
  // with "Data tidak ditemukan = Bank Code", while the numeric code from
  // their /v1/va/static example (014 = BCA) succeeded. Their own docs are
  // internally inconsistent here; this is what's actually correct.
  const VALID_BANK_CODES = ['014', '008', '002', '009', '022', '011', '013', '451', '147', '153', '490']; // BCA, Mandiri, BRI, BNI, CIMB, Danamon, Permata, BSI, Muamalat, Sinarmas, Bank Neo Commerce
  const VALID_WALLET_CODES = ['ovo', 'dana', 'gopay'];
  if (productId === 'va' && !VALID_BANK_CODES.includes(bankCode)) {
    return res.status(400).json({ error: 'Kode bank tidak valid.' });
  }
  if (productId === 'emoney' && !VALID_WALLET_CODES.includes(bankCode)) {
    return res.status(400).json({ error: 'Kode e-wallet tidak valid.' });
  }
  // Per-bank on/off is also admin-editable now (same settings.paymentChannels
  // as above, .vaBanks[code] - 2026-10-28), replacing what used to be a
  // hardcoded BSI/Danamon block here (originally added after a live
  // Cloudflare 502 from WuzzPay's production origin on BSI). Checked here
  // regardless of the client's bank picker (which greys out the same banks
  // via the same settings, src/lib/paymentChannels.ts/PaymentGatewayPanel.tsx).
  if (productId === 'va' && settingsForCharge.paymentChannels.vaBanks[bankCode] === false) {
    return res.status(503).json({ error: 'Bank ini sedang tidak tersedia sementara. Silakan pilih bank lain.' });
  }

  const { token } = req.params;

  // Quick, lock-protected read + validation - a stale read past this point is
  // fine, since the actual charge call below is naturally idempotent
  // (deterministic Idempotency-Key = order.id + product + bank, see the
  // charge call below), so a race against a concurrent charge attempt on
  // the SAME channel+bank is caught by WuzzPay itself (409 in-flight), not
  // by this check.
  const precheck = await withDbLock(async () => {
    const orders = await readOrders();
    const order = orders.find((o: Order) => o.confirmationToken && o.confirmationToken === token);
    if (!order) return { kind: 'not-found' as const };
    // Testing gate (see PAYMENT_GATEWAY_TEST_TRIGGER_NAME above) - responds
    // identically to "gateway not configured" so a non-test order can't
    // distinguish "feature hidden" from "feature doesn't exist yet".
    if (order.customerName !== PAYMENT_GATEWAY_TEST_TRIGGER_NAME) return { kind: 'not-configured' as const };
    // Only a still-Pending order can be charged - not Expired. Allowing a
    // fresh charge into an expired order could let a customer pay for stock
    // the system may have since re-allocated; a payment that was already
    // legitimately in flight before expiry is instead recovered by
    // applyWuzzpaySettlementStatus's separate Expired-transition path, which
    // only completes an existing transaction, never starts a new one.
    if (order.status !== 'Pending') return { kind: 'not-chargeable' as const };

    // Every channel attempted so far on this order, oldest first. Supports
    // orders created before wuzzpayAttempts existed (2026-10-26) by
    // synthesizing a single legacy entry from the old singular fields, so an
    // in-flight pre-deploy order still short-circuits correctly below
    // instead of double-charging.
    const attempts: WuzzpayAttempt[] = order.wuzzpayAttempts && order.wuzzpayAttempts.length > 0
      ? order.wuzzpayAttempts
      : (order.wuzzpayTransactionId && order.paymentInstruction && order.paymentMethod && order.paymentMethod !== 'cash'
          ? [{
              productId: order.paymentMethod,
              bankCode: order.paymentChannel,
              transactionId: order.wuzzpayTransactionId,
              paymentInstruction: order.paymentInstruction,
              chargedAmount: order.wuzzpayChargedAmount ?? order.totalPrice,
              provider: order.wuzzpayProvider,
              lastStatus: order.wuzzpayLastStatus,
              chargedAt: order.createdAt,
            }]
          : []);

    // Idempotent short-circuit: re-clicking the SAME channel while its
    // instruction is still live just returns it as-is, unchanged behavior
    // for a repeat click/page refresh. A DIFFERENT channel/bank is NOT
    // blocked by this (2026-10-26) - each gets its own partner_reference (see
    // the /charge call below, attemptReference), so a customer can try QRIS,
    // then switch to VA, then switch banks within VA, without losing the
    // order or hitting WuzzPay's TRX008 dedup.
    const existing = attempts.find(a => a.productId === productId && (productId === 'qris' || a.bankCode === bankCode));
    const existingExpiresAt = existing?.paymentInstruction?.expires_at;
    if (existing && typeof existingExpiresAt === 'string' && new Date(existingExpiresAt).getTime() > Date.now()) {
      return { kind: 'already-live' as const, attempts };
    }

    return {
      kind: 'ok' as const,
      orderId: order.id,
      totalPrice: order.totalPrice,
      customerName: order.customerName,
      customerWhatsApp: order.customerWhatsApp,
      // Amount is locked to whatever the first channel attempted on this
      // order requested, if any - keeps "how much this order owes"
      // unambiguous regardless of which channel ultimately gets paid,
      // rather than letting a second channel silently request a different
      // amount (e.g. full price via VA, then a 50% DP via QRIS).
      lockedAmount: attempts.length > 0 ? attempts[0].chargedAmount : undefined,
    };
  });

  if (precheck.kind === 'not-found') return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  if (precheck.kind === 'not-configured') return res.status(503).json({ error: 'Payment gateway belum dikonfigurasi.' });
  if (precheck.kind === 'not-chargeable') return res.status(400).json({ error: 'Pesanan ini sudah tidak bisa dibuatkan pembayaran baru.' });
  if (precheck.kind === 'already-live') {
    return res.json({ wuzzpayAttempts: precheck.attempts });
  }

  // Owner's Syarat & Ketentuan requires a minimum 50% DP - `amount` lets the
  // customer choose to pay a deposit instead of the full total online.
  // Omitting it defaults to full payment (every pre-existing caller keeps
  // working unchanged). The client's own picker is just UX - this is the
  // real enforcement point, never trust the requested amount blindly.
  // Remaining balance beyond whatever was actually charged is always
  // collected in person/cash at pickup - there's no "pay the rest online
  // later" flow for a single channel, and a second channel attempted on the
  // same order is locked to match the first (precheck.lockedAmount) rather
  // than being treated as a way to pay the remainder differently.
  const minChargeAmount = Math.ceil(precheck.totalPrice * 0.5);
  let chargeAmount = amount === undefined ? precheck.totalPrice : Number(amount);
  if (precheck.lockedAmount !== undefined) {
    chargeAmount = precheck.lockedAmount;
  } else if (!Number.isInteger(chargeAmount) || chargeAmount < minChargeAmount || chargeAmount > precheck.totalPrice) {
    return res.status(400).json({
      error: `Jumlah pembayaran tidak valid. Minimal Rp ${minChargeAmount.toLocaleString('id-ID')} (DP 50%), maksimal Rp ${precheck.totalPrice.toLocaleString('id-ID')}.`,
    });
  }

  // Banks reject a VA transfer below this amount - checked after chargeAmount
  // is finalized so it also catches the locked-amount case (a second channel
  // can't dodge this by switching to VA for an amount a prior QRIS/e-money
  // attempt already locked in below the floor). Client-side mirror in
  // PaymentGatewayPanel (VA_MINIMUM_AMOUNT) is UX only - this is the real check.
  const VA_MINIMUM_AMOUNT = 10000;
  if (productId === 'va' && chargeAmount < VA_MINIMUM_AMOUNT) {
    return res.status(400).json({
      error: `Minimal transfer Virtual Account adalah Rp ${VA_MINIMUM_AMOUNT.toLocaleString('id-ID')}. Untuk nominal di bawah itu, silakan gunakan QRIS.`,
    });
  }

  // SLOW outbound call - deliberately outside withDbLock (see
  // fetchWuzzpaySettlementStatus's comment above for why: this used to run
  // inside the lock and could starve every other write route for as long as
  // WuzzPay took to respond).
  let data: any;
  try {
    // Idempotency-Key is deterministic (order.id) so a raced/duplicated
    // request is deduped by WuzzPay itself (409 in-flight, replayed once
    // completed) - a second layer on top of the precheck short-circuit above.
    //
    // One path PER PRODUCT now (confirmed 2026-10-25 via docs.wuzzpay.com +
    // live sandbox curl testing, after the merchant's provider switched from
    // Espay to Winpay) - the old generic POST /charge with product_id in the
    // body is gone (404 confirmed live). No product_id field anymore either;
    // it's implied by the path. emoney uses `wallet` (not `bank_code`) and
    // newly requires customer_name/customer_phone - confirmed accepted
    // against sandbox with these exact fields.
    // partner_reference scoped to order+product+bank (2026-10-26 fix,
    // corrected same day) - NOT bare order.id. First attempt (Idempotency-Key
    // only) wasn't enough: a real production retry (BRI, then Mandiri on the
    // same order) still 409'd with WuzzPay's own TRX008 ("partner_reference
    // is already used for a different request") - the dedup is keyed off
    // partner_reference itself, independent of the Idempotency-Key header.
    // Confirmed two different product PATHS (/charge/va vs /charge/qris)
    // don't collide even sharing a partner_reference, but two calls to the
    // SAME path (/charge/va) with a different bank_code do, since it's the
    // same endpoint both times. Using "__" as the separator since order IDs
    // (`order-<timestamp>`) never contain it - the webhook handler below
    // splits on "__" to recover the real order.id.
    const attemptReference = bankCode ? `${precheck.orderId}__${productId}__${bankCode}` : `${precheck.orderId}__${productId}`;
    const chargeBody: Record<string, unknown> = {
      partner_reference: attemptReference,
      amount: { amount: chargeAmount, currency: 'IDR' },
    };
    if (productId === 'va') {
      chargeBody.bank_code = bankCode;
    } else if (productId === 'emoney') {
      chargeBody.wallet = bankCode; // client's bankCode field doubles as the wallet code
      chargeBody.customer_name = precheck.customerName;
      chargeBody.customer_phone = precheck.customerWhatsApp;
    }
    // qris sends neither bank_code nor wallet. Idempotency-Key reuses the
    // same per-attempt reference - both need to be unique per channel+bank
    // for the same reason, no need for two different schemes.
    data = await wuzzpayRequest('POST', `/charge/${productId}`, chargeBody, attemptReference);
  } catch (err) {
    console.error(`WuzzPay charge failed for order ${precheck.orderId}:`, err);
    // partner_reference already used for THIS exact product+bank (WuzzPay's
    // own dedup, code TRX008 - "partner_reference is already used for a
    // different request") - observed 2026-08-20 to mean that specific
    // channel+bank's reference is permanently stuck on WuzzPay's side, not
    // just "in flight". Retrying the SAME channel+bank can never succeed
    // here, since attemptReference is deterministic - only a genuinely new
    // order gets a fresh reference for that exact combination. Does not
    // block trying a DIFFERENT product OR a different bank_code on the same
    // order though, since each gets its own partner_reference (2026-10-26) -
    // the client is free to pick another method/bank after seeing this error.
    if (err instanceof WuzzpayApiError && err.status === 409) {
      return res.status(409).json({
        error: 'Pesanan ini sudah pernah gagal dibuatkan pembayaran dan tidak bisa dicoba lagi. Silakan buat pesanan baru.',
        code: 'REFERENCE_STUCK',
      });
    }
    return res.status(502).json({ error: 'Gagal membuat instruksi pembayaran. Silakan coba lagi.' });
  }

  // Transaction id: confirmed 2026-10-25 via real GET /v1/transactions data
  // (both list and by-id, for genuine historical transactions) that the id
  // used to look up a transaction's status is the plain data.id (e.g.
  // "000163") - not the old data.transaction.ID (PascalCase) guess from the
  // Espay era, which never appears anywhere in real data. Still unconfirmed
  // against an actual *successful* charge response body specifically (only
  // against GET) since sandbox has no active provider to complete one
  // against right now - keeps the old guesses plus provider_ref (the only
  // reference WuzzPay's own charge-endpoint doc examples actually show) as
  // defensive fallbacks, and still logs loudly if nothing matches.
  const transactionId = data?.data?.id ?? data?.data?.transaction?.id ?? data?.data?.transaction?.ID ?? data?.data?.payment_instruction?.provider_ref ?? data?.data?.transaction_id;
  if (!transactionId) {
    console.error(`WuzzPay charge response for order ${precheck.orderId} has no recognizable transaction id - raw response:`, JSON.stringify(data));
  }

  // Quick, lock-protected persist - re-reads the order fresh (it may have
  // changed while the slow call above was in flight) rather than reusing the
  // precheck snapshot. Uses the narrow readOrders/writeOrders pair (not the
  // full readDB/writeDB) - this only ever needs to touch one order, and the
  // full writeDB does an unconditional 6-table transactional sync (products/
  // users/settings/job entries/job prices, not just orders) that measured
  // multiple seconds against production Supabase for no reason relevant here
  // (see the same fix already applied to payment-status/cash/webhook below).
  // Appends to wuzzpayAttempts rather than overwriting the order's singular
  // wuzzpay* fields (2026-10-26, multi-channel support) - those fields are
  // now only ever written by applyWuzzpaySettlementStatus, once something
  // actually settles, so a second (or third) channel attempted here doesn't
  // clobber tracking of an earlier still-live one.
  const result = await withDbLock(async () => {
    const orders = await readOrders();
    const order = orders.find((o: Order) => o.id === precheck.orderId);
    if (!order) return null;
    const newAttempt: WuzzpayAttempt = {
      productId,
      bankCode: bankCode ?? undefined,
      transactionId: transactionId ?? '',
      paymentInstruction: data?.data?.payment_instruction ?? {},
      chargedAmount: chargeAmount,
      provider: data?.data?.used_provider ?? undefined,
      chargedAt: new Date().toISOString(),
    };
    order.wuzzpayAttempts = order.wuzzpayAttempts || [];
    order.wuzzpayAttempts.push(newAttempt);
    await writeOrders(orders);
    return { wuzzpayAttempts: order.wuzzpayAttempts };
  });
  if (!result) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  console.log(`WuzzPay charge succeeded for order ${precheck.orderId}: method=${productId}, transactionId=${transactionId ?? '(none - see error above)'}, provider=${data?.data?.used_provider ?? '(unknown)'}`);
  res.json(result);
}));

// Public, same token boundary as /charge - lets a customer choose to pay
// cash in person at pickup instead of online. No WuzzPay involvement
// whatsoever (no outbound call, nothing to poll) - this just tags the order
// so staff know to expect cash rather than an already-completed online
// transfer (visible in Manajemen Order / OrderDetailPanel). The existing
// manual "Konfirmasi Pembayaran" action remains the actual
// payment-confirmation step, unchanged - staff still confirm once cash is
// physically received, exactly as they already do for every other order.
//
// Deliberately NOT gated behind PAYMENT_GATEWAY_TEST_TRIGGER_NAME, unlike
// /charge - owner decision (2026-08-20): the real gateway page now replaces
// the legacy fake-QRIS page for every customer, with the online methods
// (qris/va/emoney) visibly disabled client-side unless the order matches the
// test trigger name, but cash stays usable for everyone since it never
// touches WuzzPay at all and carries none of the channel-provisioning risk.
app.post('/api/orders/confirm/:token/cash', asyncHandler(async (req, res) => {
  const { token } = req.params;
  // Narrow readOrders/writeOrders, not the full readDB/writeDB - this only
  // ever touches one order's one field, and the full writeDB does an
  // unconditional 6-table transactional sync (measured multiple seconds
  // against production Supabase - this route was the one that surfaced it).
  const result = await withDbLock(async () => {
    const orders = await readOrders();
    const order = orders.find((o: Order) => o.confirmationToken && o.confirmationToken === token);
    if (!order) return { kind: 'not-found' as const };
    if (order.status !== 'Pending') return { kind: 'not-chargeable' as const };
    order.paymentMethod = 'cash';
    await writeOrders(orders);
    return { kind: 'ok' as const };
  });
  if (result.kind === 'not-found') return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  if (result.kind === 'not-chargeable') return res.status(400).json({ error: 'Pesanan ini sudah tidak bisa diubah metode pembayarannya.' });
  res.json({ paymentMethod: 'cash' });
}));

// Public, same token boundary - the client polls this directly, so
// correctness never depends on the webhook (below) actually arriving. Always
// re-verifies against WuzzPay's own API before responding; never trusts
// anything client-supplied. The slow network call runs OUTSIDE withDbLock
// (see fetchWuzzpaySettlementStatus's comment) - critical here specifically,
// since the client polls this route every few seconds for as long as a
// payment tab stays open.
app.get('/api/orders/confirm/:token/payment-status', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const findByToken = (orders: Order[]) => orders.find((o: Order) => o.confirmationToken && o.confirmationToken === token);

  // Checks every still-live attempt on this order (multi-channel, 2026-10-26
  // - a customer may have tried more than one), not just a single tracked
  // transaction id. See pollAndSettleOrderAttempts's own comment for why
  // this has to actively check WuzzPay rather than just read a pre-set
  // field: order.wuzzpayTransactionId now stays unset until something
  // actually settles, so there's nothing to passively read while Pending.
  const { notifyOrder, duplicateOrder } = await pollAndSettleOrderAttempts(findByToken, token);

  // Fired after the lock is released, never from inside it - see
  // sendTelegramPaymentNotification's own comment on the lock-contention
  // incident this must not repeat.
  if (notifyOrder) {
    console.log(`WuzzPay payment-status poll settled order ${notifyOrder.id} via transaction ${notifyOrder.wuzzpayTransactionId}`);
    sendTelegramPaymentNotification(notifyOrder).catch(err => console.error('Telegram payment notification failed:', err));
  }
  if (duplicateOrder) {
    console.error(`WuzzPay payment-status poll found a DUPLICATE payment on order ${duplicateOrder.id}`);
    sendTelegramDuplicatePaymentAlert(duplicateOrder).catch(err => console.error('Telegram duplicate-payment alert failed:', err));
  }

  // Re-read fresh for the response - narrow readOrders, not the full
  // readDB, same reasoning as every other narrow-read route in this file.
  const final = await withDbLock(async () => {
    const order = findByToken(await readOrders());
    if (!order) return null;
    return { status: order.status, attempts: getOrderAttempts(order).map(a => ({ productId: a.productId, bankCode: a.bankCode, lastStatus: a.lastStatus })) };
  });
  if (!final) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  res.json(final);
}));

// Verifies x-wuzzpay-signature against a raw request body. Confirmed
// 2026-08-22 against a real webhook.test delivery: hex(HMAC-SHA256(secret,
// `${timestamp}.${rawBody}`)) - same scheme Stripe uses, never published in
// WuzzPay's own docs. crypto.timingSafeEqual needs equal-length buffers, so a
// length mismatch (e.g. a garbled/truncated header) is treated as "invalid"
// rather than thrown.
function verifyWuzzpaySignature(rawBody: Buffer | undefined, timestamp: unknown, signature: unknown): boolean {
  if (!WUZZPAY_WEBHOOK_SECRET || !rawBody || typeof timestamp !== 'string' || typeof signature !== 'string') {
    return false;
  }
  const expected = crypto.createHmac('sha256', WUZZPAY_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// Public webhook receiver - no auth header required, since WuzzPay's own
// servers call this; authenticity is instead checked via the HMAC signature
// above (when WUZZPAY_WEBHOOK_SECRET is configured). Even so, the payload is
// still never trusted for the actual state change: only partner_reference
// (the order.id we sent at charge time) is read, purely to look up which
// order to re-check; the actual status change always comes from an
// authenticated GET back to WuzzPay, never from this payload. This makes the
// endpoint replay-safe and spoof-proof by construction even if signature
// verification is ever skipped (unconfigured secret, or a future WuzzPay
// change to the scheme) - the worst a forged/garbled body can do is trigger a
// harmless extra re-verification of an order the caller can already see the
// token for. Always responds 200 quickly regardless of outcome, to avoid
// retry storms from WuzzPay on our own bugs. Same lock-scoping as
// payment-status above - the slow network call never runs inside withDbLock.
app.post('/api/webhooks/wuzzpay', asyncHandler(async (req, res) => {
  try {
    const rawBody = req.rawBody;
    if (WUZZPAY_WEBHOOK_SECRET && !verifyWuzzpaySignature(rawBody, req.headers['x-wuzzpay-timestamp'], req.headers['x-wuzzpay-signature'])) {
      console.error('WuzzPay webhook received with missing/invalid x-wuzzpay-signature - ignoring.');
      return res.status(200).json({ received: true });
    }

    // partner_reference tried first now (confirmed 2026-10-25 against real
    // transaction records: ref_no is a *different* value than
    // partner_reference, e.g. "order-1788046773581" vs "5d625ccf02cfc800" -
    // the original "ref_no = partner_reference" assumption came from a
    // synthetic webhook.test delivery, not a real transaction, and would
    // never have matched a real order). ref_no kept as a last-resort
    // fallback only, in case some webhook event shapes still echo it back.
    const partnerReference = req.body?.partner_reference ?? req.body?.data?.partner_reference ?? req.body?.ref_no;
    if (typeof partnerReference === 'string') {
      // partner_reference is now "orderId__product__bank" per attempt
      // (2026-10-26, see the /charge route) rather than bare order.id - the
      // order's own id never contains "__", so splitting on it recovers the
      // real id regardless of which attempt the webhook is actually about.
      // Falls back to the raw value unchanged for anything without "__"
      // (legacy pre-fix orders, or the ref_no fallback above).
      const orderId = partnerReference.includes('__') ? partnerReference.split('__')[0] : partnerReference;
      // Checks every still-live attempt on the order (multi-channel,
      // 2026-10-26), not just whichever one the webhook happens to be about -
      // consistent with this route's existing "never trust the payload for
      // anything except which order to look at" posture: the payload is only
      // ever a prompt to re-check, so re-checking everything is both simpler
      // and more thorough than trying to single out one attempt via the
      // payload's own transaction_id field.
      const findById = (orders: Order[]) => orders.find((o: Order) => o.id === orderId);
      const { notifyOrder, duplicateOrder } = await pollAndSettleOrderAttempts(findById, orderId);
      // Fired after the lock is released, never from inside it - see
      // sendTelegramPaymentNotification's own comment on the lock-contention
      // incident this must not repeat.
      if (notifyOrder) {
        console.log(`WuzzPay webhook settled order ${orderId} via transaction ${notifyOrder.wuzzpayTransactionId}`);
        sendTelegramPaymentNotification(notifyOrder).catch(err => console.error('Telegram payment notification failed:', err));
      }
      if (duplicateOrder) {
        console.error(`WuzzPay webhook found a DUPLICATE payment on order ${orderId}`);
        sendTelegramDuplicatePaymentAlert(duplicateOrder).catch(err => console.error('Telegram duplicate-payment alert failed:', err));
      }
    }
  } catch (err) {
    console.error('WuzzPay webhook handling failed:', err);
  }
  res.status(200).json({ received: true });
}));

// Public: store info for the public site's footer/marquee - a curated subset of
// settings only, deliberately omitting lateToleranceHours (an internal admin
// config value with no public use), same minimal-surface care as GET /api/products.
//
// Falls back to the original default wording per-field whenever the owner has
// left something blank in Pengaturan (e.g. cleared a field by accident before
// saving) - the public site should never show a broken-looking empty paragraph
// or empty link text. This only affects what's served here, not what's stored:
// GET /api/settings (the admin's own Pengaturan view) still shows the raw saved
// value, blank or not, so the owner always sees exactly what they actually saved.
app.get('/api/store-info', asyncHandler(async (req, res) => {
  // Narrow readSettings, not the full readDB - this route only ever needs
  // settings, and it's public + hit on every single page load, so the
  // unconditional 6-table sync a full readDB() pulls in Postgres mode was
  // pure waste here.
  const settings = await readSettings();
  const savedFooter = settings.footer || defaultSettings.footer;
  const savedRunningText = settings.runningText;
  res.json({
    operatingHours: settings.operatingHours,
    footer: {
      description: savedFooter.description || defaultSettings.footer.description,
      address: savedFooter.address || defaultSettings.footer.address,
      instagramHandle: savedFooter.instagramHandle || defaultSettings.footer.instagramHandle,
      instagramUrl: savedFooter.instagramUrl || defaultSettings.footer.instagramUrl,
      whatsappText: savedFooter.whatsappText || defaultSettings.footer.whatsappText,
      copyrightText: savedFooter.copyrightText || defaultSettings.footer.copyrightText,
    },
    runningText: savedRunningText && savedRunningText.length > 0 ? savedRunningText : defaultSettings.runningText,
    termsAndConditions: settings.termsAndConditions || defaultSettings.termsAndConditions,
  });
}));

// Admin: Get/Update store settings (late-return tolerance, weekly operating hours,
// public footer text, marquee running text)
app.get('/api/settings', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  const settings = await readSettings();
  res.json(settings);
}));

app.put('/api/settings', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { lateToleranceHours, pendingExpiryHours, operatingHours, footer, runningText, termsAndConditions, paymentChannels } = req.body;
    const db = await readDB();
    db.settings = { lateToleranceHours, pendingExpiryHours, operatingHours, footer, runningText, termsAndConditions, paymentChannels };
    await writeDB(db);
    res.json(db.settings);
  });
}));

// Admin: Get Dashboard Stats
app.get('/api/stats', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
    if (expireStaleOrders(orders, settings.pendingExpiryHours)) {
      await writeOrders(orders);
    }

    const todayStr = getTodayDateString();

    // Active rentals = orders that have been approved or items picked up
    const activeRentalsCount = orders.filter(o => o.status === 'Approved/Paid' || o.status === 'Item Picked Up').length;

    // Total Revenue = cash actually collected (amountPaid), not the accrued
    // totalPrice+lateFee - a partially-paid order should only count what's
    // actually been received. (Expired orders were never paid, so they're
    // excluded alongside Pending.)
    const finishedOrPaidOrders = orders.filter(o => o.status !== 'Pending' && o.status !== 'Expired');
    const totalRevenue = finishedOrPaidOrders.reduce((sum, o) => {
      return sum + getAmountPaid(o);
    }, 0);

    // Piutang - total still owed across the same order set (0 for orders paid
    // in full; Completed orders auto-settle to 0 on return, see PUT .../status).
    const totalOutstanding = finishedOrPaidOrders.reduce((sum, o) => {
      return sum + getRemainingBalance(o);
    }, 0);

    // Items due for return today = Active orders with EndDate === todayStr or before today and not completed
    const dueTodayCount = orders.filter(o => {
      return (o.status === 'Item Picked Up' || o.status === 'Approved/Paid') && (o.endDate <= todayStr);
    }).length;

    res.json({
      activeRentalsCount,
      totalRevenue,
      totalOutstanding,
      dueTodayCount
    });
  });
}));

// Job price list: any logged-in user can read it (karyawan needs it to fill
// the Operational form); only owner manages it (from the Pengaturan tab).
app.get('/api/job-prices', authenticateUser, asyncHandler(async (req, res) => {
  const jobPriceList = await readJobPriceList();
  res.json(jobPriceList);
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
  const jobEntries = await readJobEntries();
  const entries = req.currentUser!.role === 'owner'
    ? jobEntries
    : jobEntries.filter((e: JobEntry) => e.employeeUserId === req.currentUser!.id);
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
    const updatedIds: string[] = [];
    db.jobEntries = db.jobEntries.map((e: JobEntry) => {
      if (idSet.has(e.id) && e.status === 'Pending') {
        updatedIds.push(e.id);
        return { ...e, status: 'Paid' as const, paymentDate };
      }
      return e;
    });
    await writeDB(db);
    // Returns exactly which ids were actually flipped to Paid (not just a
    // count) - the client needs the authoritative set, since its own
    // selectedIds/local status can be stale relative to a concurrent change
    // (e.g. another session rejected one of them a moment earlier).
    res.json({ updatedCount: updatedIds.length, updatedIds });
  });
}));

// Owner rejects a Pending entry with a reason (miss-input catch) - registered
// before the generic /:id route below, same reasoning as approve-batch.
app.put('/api/job-entries/:id/reject', authenticateUser, requireOwner, asyncHandler(async (req, res) => {
  await withDbLock(async () => {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Alasan penolakan wajib diisi.' });
    }
    const db = await readDB();
    const idx = db.jobEntries.findIndex((e: JobEntry) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Job entry not found.' });
    }
    if (db.jobEntries[idx].status !== 'Pending') {
      return res.status(403).json({ error: 'Hanya pekerjaan Pending yang bisa ditolak.' });
    }
    db.jobEntries[idx] = {
      ...db.jobEntries[idx],
      status: 'Rejected',
      rejectionReason: reason.trim(),
      rejectedAt: new Date().toISOString(),
    };
    await writeDB(db);
    res.json(db.jobEntries[idx]);
  });
}));

// Edit own Pending/Rejected job entry (input mistakes only - once Paid, immutable).
// Editing a Rejected entry re-queues it as Pending and clears the rejection, same
// as if it were never rejected - this is how a karyawan fixes and resubmits.
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
    if (entry.status !== 'Pending' && entry.status !== 'Rejected') {
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
      status: 'Pending',
      rejectionReason: undefined,
      rejectedAt: undefined,
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
