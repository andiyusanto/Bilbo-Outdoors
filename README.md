# 🏕️ Bilbo Outdoors - Sistem Persewaan Alat Camping

Aplikasi full-stack (React + Express + Vite) untuk manajemen persewaan peralatan luar ruang (camping) Bilbo Outdoors. Proyek ini mendukung manajemen produk, sistem ketersediaan barang real-time (berdasarkan irisan tanggal sewa), pembuatan pesanan pelanggan, perhitungan otomatis denda keterlambatan (dengan tarif harian flat & progresif), serta dashboard analitik bagi staf admin.

---

## 🛠️ Langkah-Langkah Menjalankan di Environment Local

Ikuti panduan berikut untuk mendownload, memasang, dan menjalankan aplikasi ini secara lokal di komputer Anda.

### 1. Prasyarat (Prerequisites)
Pastikan komputer Anda sudah terinstal software berikut:
- **Node.js** (Rekomendasi versi LTS terbaru, minimal v18+)
- **NPM** (Bawaan saat menginstal Node.js)
- **Git** (Untuk clone repository jika diperlukan)

---

### 2. Instalasi Dependensi
1. Masuk ke direktori utama proyek Bilbo Outdoors Anda di Terminal / Command Prompt:
   ```bash
   cd Bilbo-Outdoors
   ```
2. Jalankan perintah berikut untuk menginstal semua library dan dependensi yang dibutuhkan:
   ```bash
   npm install
   ```

---

### 3. Konfigurasi Environment Variables
1. Buat file baru bernama `.env` di direktori root (satu tingkat dengan `package.json`).
2. Salin isi dari `.env.example` ke file `.env` baru tersebut, lalu isi nilainya:
   ```env
   # API Key Gemini jika Anda menggunakan fitur AI (opsional)
   GEMINI_API_KEY="isi_dengan_api_key_gemini_jika_ada"

   # URL Aplikasi lokal Anda
   APP_URL="http://localhost:3000"

   # DATABASE_URL: OPSIONAL. Kosongkan/hapus baris ini jika Anda hanya ingin
   # memakai mode JSON lokal (server_db.json) - ini adalah mode default.
   # Jika diisi, aplikasi akan membaca/menulis LANGSUNG ke Postgres (Supabase)
   # menggantikan file lokal sepenuhnya (bukan dua-duanya sekaligus).
   # Lihat bagian "Migrasi Database ke Supabase" di bawah untuk cara
   # mendapatkan nilai connection string yang benar.
   DATABASE_URL="postgresql://postgres.xxx:password_anda@aws-0-xxx.pooler.supabase.com:5432/postgres"
   ```

---

### 4. Menjalankan Aplikasi

Aplikasi Bilbo Outdoors menggunakan arsitektur full-stack terintegrasi. Server Express dan UI React berjalan bersamaan secara otomatis pada port **3000**.

#### 🚀 Mode Pengembangan (Development Mode)
Untuk menjalankan aplikasi dalam mode development dengan fitur live-reload (jika ada perubahan kode, server akan otomatis merespons):
```bash
npm run dev
```
Buka browser Anda dan akses: [http://localhost:3000](http://localhost:3000)

Saat server menyala, perhatikan log di terminal - akan tertulis mode penyimpanan data yang aktif:
```
Persistence: local JSON file (server_db.json).
```
atau, jika `DATABASE_URL` terisi di `.env`:
```
Persistence: Postgres (DATABASE_URL detected).
```

**Navigasi & URL**: Halaman client (`/`) dan panel admin (`/admin/overview`, `/admin/orders`, `/admin/inventory`) kini masing-masing punya URL sendiri (memakai `react-router-dom`) - bisa di-bookmark, dibagikan langsung ke tab Order/Stok tertentu, dan tombol back/forward browser berfungsi normal antar halaman.

#### 📦 Mode Produksi Lokal (Production Build & Run)
Jika Anda ingin mencoba build versi produksi sebelum mengunggah ke layanan hosting (seperti Render.com):
1. **Lakukan Build Proyek:**
   ```bash
   npm run build
   ```
   Perintah ini akan mengkompilasi file frontend React ke folder `/dist` dan mem-bundle backend `server.ts` menjadi file CommonJS tunggal berkinerja tinggi di `dist/server.cjs`.

2. **Jalankan Aplikasi Hasil Build:**
   ```bash
   npm run start
   ```
   Aplikasi siap diakses di [http://localhost:3000](http://localhost:3000).

---

## 🗄️ Langkah 1: Migrasi Database dari JSON ke Supabase PostgreSQL

Secara default, aplikasi ini membaca dan menulis data ke file lokal `server_db.json`. Ini adalah **dual-mode**: begitu `DATABASE_URL` diisi (baik di `.env` lokal maupun sebagai environment variable di Render), aplikasi otomatis beralih menggunakan Postgres/Supabase **sepenuhnya** menggantikan file JSON tersebut - bukan menulis ke keduanya sekaligus. Peralihan mode ini terjadi sekali saat server baru menyala (lihat log `Persistence: ...` di atas).

**Kapan Anda perlu menjalankan script migrasi (Step C di bawah), kapan tidak:**
- **Proyek Supabase baru/kosong, belum ada data di `server_db.json` yang penting** (misalnya belum ada pesanan masuk): Anda bisa lewati Step C. Cukup buat tabel (Step A), isi `DATABASE_URL` (Step B), lalu jalankan aplikasinya - katalog produk default akan otomatis ter-seed langsung ke Postgres saat server pertama kali menyala.
- **Sudah ada data di `server_db.json` yang ingin dibawa** (produk yang sudah diedit, pesanan yang sudah masuk): jalankan script migrasi (Step C) satu kali untuk menyalin data tersebut ke Supabase, baru kemudian isi `DATABASE_URL` agar aplikasi mulai membaca dari sana.

Ikuti petunjuk langkah demi langkah berikut ini untuk melakukan migrasi dengan aman:

### Step A: Buat Tabel di Supabase (SQL Editor)
1. Masuk ke dashboard [Supabase](https://supabase.com/) Anda.
2. Pilih proyek Anda, lalu buka menu **SQL Editor** di bilah menu samping.
3. Klik **New Query**, tempelkan (paste) kode SQL berikut, lalu klik tombol **Run**:

```sql
-- 1. Membuat Tabel Products
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) NOT NULL,
  price NUMERIC NOT NULL,
  incremental_price_after_5_days NUMERIC NOT NULL DEFAULT 0,
  stock INT NOT NULL,
  description TEXT,
  image TEXT
);

-- 2. Membuat Tabel Orders
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(255) PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_whatsapp VARCHAR(255) NOT NULL,
  start_date VARCHAR(255) NOT NULL,
  end_date VARCHAR(255) NOT NULL,
  rent_duration INT NOT NULL,
  total_price NUMERIC NOT NULL,
  id_card_base64 TEXT,
  status VARCHAR(255) NOT NULL,
  created_at VARCHAR(255) NOT NULL,
  late_days INT DEFAULT 0,
  late_fee NUMERIC DEFAULT 0
);

-- 3. Membuat Tabel Order Items (Relasi Detail Item dari Order)
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  price_per_day NUMERIC NOT NULL,
  incremental_price NUMERIC NOT NULL DEFAULT 0
);
```

### Step B: Dapatkan Connection String Supabase Anda
1. Di dashboard Supabase Anda, buka project Anda, lalu klik tombol **Connect** (di bagian atas halaman project).
2. Di bagian **Connection String**, pilih mode **Session pooler** - **bukan** "Direct connection" dan **bukan** "Transaction pooler".
   - **Direct connection** (`db.xxx.supabase.co`) IPv6-only di tier gratis - akan gagal connect (`ENETUNREACH`) dari banyak jaringan/hosting yang tidak punya rute IPv6.
   - **Transaction pooler** (port `6543`) tidak cocok untuk pola query aplikasi ini (multi-statement per request); gunakan **Session pooler**.
3. Salin URL koneksi tersebut. Formatnya akan terlihat seperti ini (perhatikan port **5432**, host `*.pooler.supabase.com`, dan username `postgres.[project-ref]` - bukan `postgres` saja):
   `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`
4. Ganti `[password]` dengan kata sandi database Supabase yang Anda buat saat pertama kali membuat proyek.

> **Troubleshooting koneksi:**
> - **`ENETUNREACH` / connection timeout**: pastikan Anda memakai *Session pooler* (langkah di atas), bukan *Direct connection*. Aplikasi ini (dan `migrate-to-supabase.js`) sudah otomatis memaksa resolusi IPv4 untuk menghindari masalah ini, tapi connection string yang salah tetap akan gagal.
> - **`password authentication failed for user "postgres"`**: biasanya berarti Anda memakai username `postgres` polos alih-alih `postgres.[project-ref]` - salin ulang seluruh connection string dari dashboard, jangan hanya mengganti host dari connection string Direct connection yang lama.

### Step C: Jalankan Script Migrasi Otomatis
Kami telah menyediakan script migrasi instan `migrate-to-supabase.js` untuk membaca data dari `server_db.json` Anda dan menyisipkannya langsung ke database Supabase Anda.

Di terminal lokal Anda, jalankan perintah ini (pastikan ganti URL koneksi dengan milik Anda):

```bash
# Untuk Linux / macOS
DATABASE_URL="postgresql://postgres.xxx:password_anda@aws-0-xxx.pooler.supabase.com:5432/postgres" node migrate-to-supabase.js

# Untuk Windows (Command Prompt)
set DATABASE_URL=postgresql://postgres.xxx:password_anda@aws-0-xxx.pooler.supabase.com:5432/postgres
node migrate-to-supabase.js

# Untuk Windows (PowerShell)
$env:DATABASE_URL="postgresql://postgres.xxx:password_anda@aws-0-xxx.pooler.supabase.com:5432/postgres"
node migrate-to-supabase.js
```

Jika sukses, Anda akan melihat output:
`🎉 Database migration complete! All products and orders successfully synced.`

> **Error `server_db.json not found`**: script migrasi hanya membaca file yang sudah ada, ia tidak membuatnya. Jalankan `npm run dev` satu kali (tanpa `DATABASE_URL` di `.env`) agar file tersebut ter-seed otomatis dengan katalog default, lalu jalankan lagi script migrasinya.

---

## ☁️ Langkah Deployment Selanjutnya ke Render.com

Saat Anda mendeploy backend Express ke **Render.com**, lakukan pengaturan berikut:

1. **Build Command:** `npm install && npm run build`
2. **Start Command:** `npm run start`
3. **Environment Variables di Render:**
   - Tambahkan variable `DATABASE_URL` dengan nilai Connection String Supabase Anda.
   - Tambahkan `NODE_ENV` dengan nilai `production`.
   - Tambahkan `PORT` dengan nilai `3000`.
