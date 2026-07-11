# Claude Code Development Guide for Bilbo Outdoors

This guide outlines build commands, code patterns, and development guidelines for the **Bilbo Outdoors** project when using Claude Code or other AI-assisted environments.

---

## 🚀 Commands

### Build & Run Commands
- **Install Dependencies**: `npm install`
- **Start Development Server**: `npm run dev` (runs both React and Express server together on [http://localhost:3000](http://localhost:3000))
- **Production Build**: `npm run build` (compiles frontend assets to `dist/` and bundles `server.ts` into `dist/server.cjs` via esbuild)
- **Start Production Build**: `npm run start` (runs the bundled production server)

### Code Quality & Validation
- **Run Linter (TypeScript Type Check)**: `npm run lint` or `npx tsc --noEmit`

### Database Migrations
- **Migrate server_db.json to Supabase**: 
  ```bash
  DATABASE_URL="your-supabase-connection-string" node migrate-to-supabase.js
  ```

---

## 🛠️ Codebase Overview & Guidelines

### 1. Project Architecture
The project is a **Full-Stack Application** integrated into a single Node environment:
- **Frontend**: Single-Page Application (SPA) built using **React 18**, **Vite**, and styled with **Tailwind CSS**.
- **Backend**: **Express** server in `server.ts`. It acts as an API gateway for state operations and proxies frontend routes.
- **Database (Dual Mode)**:
  - **Local/Development**: Reads and writes to the local file-based store `server_db.json`.
  - **Production/Supabase**: When `DATABASE_URL` is configured, it dynamically switches to use the **PostgreSQL** database (Supabase).

### 2. Styling Rules
- **Method**: Use utility classes from **Tailwind CSS** directly in components.
- **Imports**: Tailwind configuration is located in `src/index.css`. Do not add separate `.css` files.
- **Icons**: Use only `lucide-react`. Do not create custom SVGs.
- **Animations**: Use `motion` from `framer-motion` for smooth layout transitions and visual polish.

### 3. TypeScript & Code Style
- **TypeScript Strictness**: Keep variables properly typed.
- **Named Imports**: Always prefer named imports instead of default imports where applicable.
- **Server Bundling Compatibility**:
  - `server.ts` gets bundled into a single file via `esbuild`. Keep any dynamic imports or asset paths safe for runtime execution.
  - Express runs on port `3000` on host `0.0.0.0` to allow correct ingress.

### 4. Code Modifications Check
Before adding features or changing endpoints, verify:
- **`server.ts`**: Handle API responses for `/api/products`, `/api/orders`, etc., and ensure they are compatible with both local JSON state and Supabase queries if the DB connection is present.
- **`src/types.ts`**: Core data models for Products, Orders, and Order Items are maintained here. Update models here first before changing code.
