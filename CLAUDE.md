# Claude Code Development Guide for Bilbo Outdoors

This guide outlines build commands, code patterns, architecture, and known gaps for the **Bilbo Outdoors** camping-gear rental system, for use with Claude Code or other AI-assisted environments.

---

## 🚀 Commands

### Build & Run
- **Install**: `npm install`
- **Dev server**: `npm run dev` (runs `tsx server.ts`; Express + Vite middleware together on [http://localhost:3000](http://localhost:3000), with HMR)
- **Production build**: `npm run build` (Vite builds frontend to `dist/`, esbuild bundles `server.ts` → `dist/server.cjs`, CJS, externalized packages)
- **Run production build**: `npm run start` (`node dist/server.cjs`)
- **Clean**: `npm run clean`

### Code Quality
- **Type check**: `npm run lint` (`tsc --noEmit`) — there is no ESLint/Prettier configured, this is the only automated check.

### Database Migration (one-time, manual, NOT part of the running app)
```bash
DATABASE_URL="postgresql://user:pass@host:port/db" node migrate-to-supabase.js
```
See ⚠️ **Database Architecture** below before touching anything DB-related — this is the single most important thing to understand about this codebase right now.

---

## 🛠️ Architecture

### 1. Stack
- **Frontend**: React **19**, Vite 6, Tailwind CSS **v4** (CSS-native config, not `tailwind.config.js`), `lucide-react` icons, `motion` (framer-motion) for animation.
- **Backend**: Single Express app in `server.ts`, serving both the API and (via Vite middleware in dev / static `dist/` in prod) the SPA — one Node process, one port (`3000`, bound to `0.0.0.0`).
- **Persistence**: Dual-mode. If `process.env.DATABASE_URL` is set at boot, all reads/writes go through Postgres exclusively (`db/postgres.ts`); otherwise falls back to the local JSON file `server_db.json` at the project root, auto-seeded with the default catalog on first run if missing. Exclusive boot-time branch — never both at once. See ⚠️ **Database Architecture** below.

### 2. ⚠️ Database Architecture — READ BEFORE CHANGING DB CODE
**Mode selection happens once, at boot, in `initDatabase()` (`server.ts`).** If `DATABASE_URL` is set, `readDB`/`writeDB` are pointed at `readDBPostgres`/`writeDBPostgres` (`db/postgres.ts`); otherwise they're the original JSON-file functions. A bad/unreachable `DATABASE_URL` fails boot loudly (process crashes) rather than silently falling back to the JSON file — don't "fix" that into a silent fallback, it would mask a misconfigured deploy that thinks it's writing to Supabase but isn't.

`migrate-to-supabase.js` is still a **separate, manually-invoked, one-shot script** for the initial bulk-copy of an existing `server_db.json` into a fresh Supabase project — it's not how the running app talks to Postgres day-to-day.

**Design of `db/postgres.ts`, read before touching:**
- `readDB()`/`writeDB()` keep their original coarse contract (`{ products, orders }`, orders carrying nested `items`) — every route handler's business logic (pricing formula, late-fee formula, `calculateAllocatedStock`) is completely unaware of which backend is active. Don't break this contract when adding new fields; add them to the row mappers (`rowToProduct`/`rowToOrder`/`rowToOrderItem`) instead.
- `writeDBPostgres` does a full transactional sync (upsert everything present, prune anything removed) rather than targeted per-field updates — intentional, matches the JSON file's "rewrite everything" semantics and keeps all 10 route handlers' internal logic untouched. It's **batched into a handful of multi-row `INSERT ... VALUES (...),(...),(...) ON CONFLICT`** statements (see `buildValuesClause`), not one query per row — a naive per-row loop was measured taking 20-30s per write against a real Supabase pooler connection (each round trip ~0.5-0.7s, ×30+ products); batching cuts that to a handful of round trips regardless of table size. If you add a new table/entity, batch it the same way rather than looping.
- **Write requests are serialized in-process via `withDbLock`** (`server.ts`). This only exists because converting `readDB`/`writeDB` to real async I/O reintroduced a lost-update race that the original fully-synchronous `fs` code never had (a synchronous handler can't be interleaved by a concurrent request; an `await`-ing one can). It only protects a single Node process — doesn't help if this ever runs as 2+ instances behind a load balancer, which would need real row-level Postgres locking instead.
- **The live Supabase schema does not necessarily match `README.md`'s documented `CREATE TABLE` DDL.** Discovered empirically: `start_date`/`end_date` came back as `date` columns (not `varchar(255)` as documented), and numeric columns as `integer` (not `numeric`). `pg` auto-parses `DATE` into a JS `Date` using local-timezone calendar components, which silently shifts the calendar day on re-serialization whenever the server's local timezone isn't UTC (this box runs `Asia/Jakarta`, UTC+7 — matches the app's Surabaya setting, and would have silently broken `dueTodayCount`'s `o.endDate <= todayStr` string comparison). Fixed by overriding `pg`'s type parser for the DATE oid (1082) to return the raw string. If Postgres data ever looks off by one day, check this first before assuming a new bug.
- Supabase's connection needs `dns.setDefaultResultOrder('ipv4first')` (set in `initPostgresPool`) — its pooler host is dual-stack, and this box (and likely others) has no real IPv6 route, causing `ENETUNREACH` otherwise. Also always use the **session pooler** connection string (`*.pooler.supabase.com`), not "Direct connection" (`db.*.supabase.co`) — the direct host is IPv6-only on the free tier.
- `DATABASE_URL` is loaded from a local `.env` file via `dotenv/config` (imported at the top of `server.ts`) — `dotenv` was previously an unused dependency, now wired in. `.env` is gitignored; `.env.example` documents the expected format.

### 3. Data Model (`src/types.ts`)
- `Product`: catalog item, `price` = daily rate (IDR), `incrementalPriceAfter5Days` = daily discount amount (per-product, admin-editable; used by tents by default, 0 for most other categories), `discountMinDays` = per-product day threshold after which that discount applies (defaults to 5, also admin-editable — the field name still says "5Days" for historical/low-risk reasons, but the actual threshold is `discountMinDays`, not literally 5), `stock` = total inventory count.
- `Order` / `OrderItem`: `rentDuration` is computed server-side (inclusive day count), `lateDays`/`lateFee` are populated lazily via `/api/orders/:id/calculate-late`. `OrderItem.discountThresholdDays` is a **snapshot** of `Product.discountMinDays` taken at booking time (same pattern as `pricePerDay`/`incrementalPrice`) — deliberately named differently from `Product.discountMinDays` so a future change that puts both a live product and an order item in scope in the same function is a TypeScript compile error, not a silent wrong-value bug, if someone reads the wrong one.
- Pricing logic (in `server.ts`): days 1 through `discountMinDays` charge `price`; beyond that charge `price - incrementalPriceAfter5Days` (a loyalty discount for longer stays, threshold is per-product, not a fixed "5"). The exact same formula is duplicated for order-total calculation and late-fee calculation — if you change one, change both (search `discountMinDays` / `discountThresholdDays` in `server.ts`), and also `calculateItemCost` in `ClientPortal.tsx` (a third copy, used for the client-side cart estimate). **The late-fee calculation must only ever read `order.items`' snapshotted fields, never look up live `db.products`** — that's what keeps an admin's later edit to a product's discount from retroactively changing an already-placed order's late fee.
- Stock availability is computed per-request via `calculateAllocatedStock()`, which walks every day in the requested range and sums overlapping active (non-completed) orders per product. This is O(days × orders × items) — fine at current scale, worth revisiting if order volume grows a lot.

### 4. Auth
Auth is intentionally minimal: `POST /api/auth/login` checks a **hardcoded** username/password (`admin` / `bilbooutdoor2026`) and returns a **static bearer token** (`bilbo-outdoors-admin-token-2026`) that `authenticateAdmin` middleware checks verbatim. There's no session store, no expiry, no hashing. This is fine for a single-admin MVP but should not be extended as-is if multi-user admin access or public deployment hardening is ever needed — flag it rather than silently building more on top of it.

### 5. Styling
- Tailwind v4 via `@tailwindcss/vite` plugin — theme tokens (fonts, brand color) are defined with `@theme` in `src/index.css`, not a JS config file. Don't add a `tailwind.config.js`; extend the `@theme` block instead.
- Brand color is dynamic: `src/themes.ts` defines a palette of theme presets, applied at runtime as CSS custom properties (`--brand-color`, etc.) on `document.documentElement`, persisted to `localStorage`. Use the `bg-brand` / `text-brand` utility classes rather than hardcoding hex values.
- Icons: `lucide-react` only, no custom SVGs (except `QRISCode.tsx`, which is a static illustrative SVG mock of a QRIS code — it is **not wired to a real payment gateway**, just a visual placeholder with the order amount interpolated in).
- Animation: `motion` (framer-motion) for transitions/polish.

### 6. TypeScript & Code Style
- Keep variables properly typed; prefer named imports.
- `server.ts` is bundled standalone via esbuild (`--packages=external`) — keep any dynamic imports/asset paths safe for that bundling, and don't assume Vite-only features are available at runtime in `server.ts`.
- `AdminPanel.tsx` and `ClientPortal.tsx` are thin shells that call custom hooks (`src/hooks/`) and render tab/section components (`src/components/admin/`, `src/components/client/`) — they were split out of two large monolithic files. Before adding a feature, check whether it belongs in an existing hook/component rather than growing the shell.

### 7. Unused / leftover
- `@google/genai` is a dependency but is not imported or used anywhere in the codebase. It's boilerplate leftover from the Google AI Studio project template (see the AI Studio comments in `vite.config.ts` re: `DISABLE_HMR`). Safe to ignore; flag before building any actual Gemini-powered feature, since none currently exists despite the `GEMINI_API_KEY` env var scaffolding in `.env.example`.

---

## ✅ Before Modifying Code, Check
- **`server.ts`**: All API logic (`/api/products`, `/api/orders`, `/api/check-availability`, `/api/stats`, late-fee calc) lives in this one file. Persistence is dual-mode (`db/postgres.ts` or `server_db.json`, see ⚠️ Database Architecture above) behind the `readDB()`/`writeDB()` seam — don't add a second abstraction layer on top; extend the existing one.
- **Route handlers are `async` and wrapped in `asyncHandler`**; the 6 that call `writeDB` are also wrapped in `withDbLock`. Keep new endpoints consistent with this pattern, or an unhandled rejection can hang a request or crash the process.
- **`src/types.ts`**: Update data models here first, before touching `server.ts` or components — both sides import from here.
- **Pricing/late-fee formulas**: duplicated in two places in `server.ts` (order creation, late-fee calculation). Keep them in sync, or better, factor out a shared helper when touching either.
- **Auth**: don't quietly harden or change the login flow as a side effect of an unrelated task — it's a known, deliberate simplification, not an oversight to "fix" silently.