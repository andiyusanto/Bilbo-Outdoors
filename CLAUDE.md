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
- **Persistence**: A flat JSON file, `server_db.json`, at the project root. Auto-seeded with default product catalog on first run if missing (see `initDatabase()` in `server.ts`).

### 2. ⚠️ Database Architecture — READ BEFORE CHANGING DB CODE
**The app has no runtime Postgres/Supabase integration.** `server.ts` only ever reads/writes `server_db.json` via `readDB()` / `writeDB()` — there is no `DATABASE_URL` check, no `pg.Pool`/`pg.Client`, no branching logic anywhere in the server.

`migrate-to-supabase.js` is a **separate, manually-invoked, one-shot script**. It reads `server_db.json` once and upserts its contents into a Supabase Postgres schema (`products`, `orders`, `order_items`). It does not run as part of `npm run dev` or `npm run start`, and the Express server never queries Postgres afterward.

**Practical implication**: if this is deployed to Render.com (or any host with an ephemeral/non-persistent filesystem) following the README's "migrate to Supabase" flow, the server keeps writing new orders to its local `server_db.json` copy, not to Supabase. Any order created after the migration script is run:
- won't show up in Supabase, and
- will be lost on the next redeploy/restart, since the container filesystem doesn't persist.

**If asked to "make the DB dual-mode" or "actually use Supabase in production"**, this means adding real logic to `server.ts`: check `process.env.DATABASE_URL` at boot, and if present, replace `readDB`/`writeDB` with `pg` queries against the schema the migration script already assumes (see the `CREATE TABLE` statements in `README.md`). Until that's done, treat `server_db.json` as the only source of truth, in every environment, regardless of what `DATABASE_URL` is set to.

### 3. Data Model (`src/types.ts`)
- `Product`: catalog item, `price` = daily rate (IDR), `incrementalPriceAfter5Days` = extra daily surcharge after day 5 (used by tents; 0 for most other categories), `stock` = total inventory count.
- `Order` / `OrderItem`: `rentDuration` is computed server-side (inclusive day count), `lateDays`/`lateFee` are populated lazily via `/api/orders/:id/calculate-late`.
- Pricing logic (in `server.ts`): days 1–5 charge `price`; day 6+ charge `price + incrementalPriceAfter5Days`. The exact same formula is duplicated for order-total calculation and late-fee calculation — if you change one, change both (search `day > 5` / `daySeqNum > 5` in `server.ts`).
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
- `AdminPanel.tsx` (~68K) and `ClientPortal.tsx` (~40K) are large, monolithic components. Before adding features, actually open and search within the relevant file rather than assuming structure — they are not split into subcomponents.

### 7. Unused / leftover
- `@google/genai` is a dependency but is not imported or used anywhere in the codebase. It's boilerplate leftover from the Google AI Studio project template (see the AI Studio comments in `vite.config.ts` re: `DISABLE_HMR`). Safe to ignore; flag before building any actual Gemini-powered feature, since none currently exists despite the `GEMINI_API_KEY` env var scaffolding in `.env.example`.

---

## ✅ Before Modifying Code, Check
- **`server.ts`**: All API logic (`/api/products`, `/api/orders`, `/api/check-availability`, `/api/stats`, late-fee calc) lives in this one file, operating on `server_db.json`. There is no DB abstraction layer — don't invent one implicitly; if you add real Postgres support, do it explicitly and update this doc.
- **`src/types.ts`**: Update data models here first, before touching `server.ts` or components — both sides import from here.
- **Pricing/late-fee formulas**: duplicated in two places in `server.ts` (order creation, late-fee calculation). Keep them in sync, or better, factor out a shared helper when touching either.
- **Auth**: don't quietly harden or change the login flow as a side effect of an unrelated task — it's a known, deliberate simplification, not an oversight to "fix" silently.