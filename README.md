# 🏕️ Bilbo Outdoors - Sistem Persewaan Alat Camping

Aplikasi full-stack (React + Express + Vite) untuk manajemen persewaan peralatan luar ruang (camping) Bilbo Outdoors. Proyek ini mendukung manajemen produk dengan skema harga sewa per-hari (tabel kumulatif untuk hari ke-1 s/d ke-5, ditambah tarif flat per hari untuk hari ke-6 dan seterusnya), sistem ketersediaan barang real-time (berdasarkan irisan tanggal sewa dan waktu kesiapan alat setelah dikembalikan), pencarian katalog di halaman publik yang otomatis menaruh alat berstok kosong pada rentang tanggal terpilih di urutan paling akhir, pembuatan pesanan pelanggan dengan verifikasi foto diri penyewa dan persetujuan wajib atas Syarat & Ketentuan (teks bebas, diatur dari Pengaturan), integrasi payment gateway WuzzPay (QRIS/Transfer Bank/E-Wallet, aktif untuk pelanggan umum secara bertahap per kanal - Bayar Tunai selalu tersedia) dengan webhook + polling status pembayaran dan verifikasi manual on-demand oleh staf, pencatatan jaminan yang diserahkan saat barang diambil (kartu identitas fisik atau uang tunai dengan nominal tercatat), pembayaran sebagian/DP dengan pelunasan otomatis saat pesanan diselesaikan, pengeditan item & jadwal untuk pesanan yang masih Pending atau Approved/Paid (terkunci begitu barang diambil), kalkulator denda keterlambatan yang hanya bisa dijalankan setelah barang diambil, pencatatan denda keterlambatan maupun kerusakan/kehilangan alat dengan opsi khusus owner untuk menghapus/mereset denda kapan pun (bahkan setelah pesanan selesai), penghapusan pesanan oleh owner untuk kasus seperti double booking, jejak audit staf yang mengubah setiap pesanan, serta dashboard analitik bagi staf admin.

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
-- Catatan: kolom harga bertipe INTEGER (bukan NUMERIC) - dikonfirmasi dari skema
-- live Supabase yang sudah berjalan (price/price_per_day/dll ternyata INTEGER,
-- bukan NUMERIC seperti dokumentasi lama), dan Rupiah memang selalu bilangan bulat.
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) NOT NULL,
  day1_price INTEGER,
  day2_price INTEGER,
  day3_price INTEGER,
  day4_price INTEGER,
  day5_price INTEGER,
  extra_day_rate INTEGER,
  readiness_hours INT NOT NULL DEFAULT 0,
  stock INT NOT NULL,
  description TEXT,
  image TEXT,
  varian VARCHAR(255),
  size VARCHAR(255),
  color VARCHAR(255)
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
  id_card_base64 TEXT, -- stores the customer's personal photo (face/upper-body or full body), not an ID card scan - column name kept for backwards compatibility, see the pickup_id_type note below
  status VARCHAR(255) NOT NULL,
  created_at VARCHAR(255) NOT NULL,
  late_days INT DEFAULT 0,
  late_fee NUMERIC DEFAULT 0,
  confirmation_token VARCHAR(255),
  returned_at VARCHAR(255),
  picked_up_at VARCHAR(255),
  pickup_id_type VARCHAR(255),
  amount_paid NUMERIC,
  status_history JSONB,
  penalties JSONB,
  payment_method VARCHAR(255),
  payment_channel VARCHAR(255),
  payment_instruction JSONB,
  wuzzpay_transaction_id VARCHAR(255),
  wuzzpay_provider VARCHAR(255),
  wuzzpay_last_status VARCHAR(255),
  personal_photo_path VARCHAR(255) -- object path in the PRIVATE bilbo-personal-photos Supabase Storage bucket (never a full URL - signed URLs expire, see server.ts's createSignedPersonalPhotoUrl); set once at creation for new orders when Storage is configured, NULL for legacy orders (which keep their photo in id_card_base64 above)
);

-- 3. Membuat Tabel Order Items (Relasi Detail Item dari Order)
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  day1_price INTEGER,
  day2_price INTEGER,
  day3_price INTEGER,
  day4_price INTEGER,
  day5_price INTEGER,
  extra_day_rate INTEGER,
  price_per_day INTEGER,
  incremental_price INTEGER,
  discount_threshold_days INT
);

-- Postgres does not auto-index a foreign-key-referencing column (only the
-- referenced side, orders.id, gets one automatically) - order_id is looked
-- up on every single order write (writeOrdersPostgres deletes/replaces this
-- order's rows), so without this index that's a sequential scan over the
-- whole table on every write.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- 4. Membuat Tabel Settings (Toleransi Keterlambatan + Jam Operasional Toko) - baris tunggal (id selalu 1)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  late_tolerance_hours INTEGER NOT NULL DEFAULT 4,
  pending_expiry_hours INTEGER NOT NULL DEFAULT 2,
  operating_hours JSONB NOT NULL,
  footer JSONB,
  running_text VARCHAR(255)[],
  terms_and_conditions TEXT
);

-- 5. Membuat Tabel Users (akun staff - owner/master & karyawan)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  session_token VARCHAR(255),
  created_at VARCHAR(255) NOT NULL
);

-- 6. Membuat Tabel Job Price List (daftar harga pekerjaan cleaning/laundry/inventaris per item)
CREATE TABLE IF NOT EXISTS job_price_list (
  id VARCHAR(255) PRIMARY KEY,
  item_name VARCHAR(255) NOT NULL,
  cleaning_price INTEGER,
  laundry_price INTEGER,
  inventaris_price INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  product_ids VARCHAR(255)[]
);

-- 7. Membuat Tabel Job Entries (pekerjaan yang dicatat karyawan, untuk approval & pembayaran)
CREATE TABLE IF NOT EXISTS job_entries (
  id VARCHAR(255) PRIMARY KEY,
  employee_user_id VARCHAR(255) NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  entry_date VARCHAR(255) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  payment_date VARCHAR(255),
  rejection_reason VARCHAR(255),
  rejected_at VARCHAR(255),
  created_at VARCHAR(255) NOT NULL
);
```

> **Sudah pernah menjalankan Step A sebelum kolom `discount_min_days`/`discount_threshold_days` ada?** Cukup jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang, dan nilai default `5` otomatis mengisi baris yang sudah ada, sesuai dengan aturan harga yang memang berlaku sebelumnya):
> ```sql
> ALTER TABLE products    ADD COLUMN IF NOT EXISTS discount_min_days       INT NOT NULL DEFAULT 5;
> ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_threshold_days INT NOT NULL DEFAULT 5;
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `confirmation_token` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang). Kolom ini sengaja dibiarkan nullable, tanpa default - setiap order butuh nilai acak yang berbeda, bukan satu nilai default yang sama untuk semua baris. Order lama (sebelum fitur ini ada) akan tetap `NULL` selamanya dan itu memang disengaja: order tersebut sudah selesai diproses secara langsung sebelum fitur "link konfirmasi" ini ada, jadi tidak ada regresi bagi pelanggan yang bersangkutan.
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR(255);
> ```

> **Sudah pernah menjalankan Step A sebelum skema harga 2026 (tabel harga per-hari + waktu kesiapan alat) ada?** Jalankan ini **sekali, sebelum men-deploy kode baru**, di SQL Editor yang sama (aman dijalankan berulang). Kolom harga lama (`price`, `price_per_day`) dilonggarkan jadi nullable karena kolom-kolom baru menggantikannya sepenuhnya - lihat "⚠️ Database Architecture" di `CLAUDE.md` untuk urutan migrasi yang aman (ALTER dulu → `migrate-pricing-v2.ts` untuk mengisi data → baru deploy kode baru). Kolom lama di `order_items` (`price_per_day`/`incremental_price`/`discount_threshold_days`) **tidak dihapus** - order lama (sebelum migrasi ini) tetap menyimpan datanya di sana selamanya, agar detail harga pesanan lama tidak hilang.
> ```sql
> ALTER TABLE products ADD COLUMN IF NOT EXISTS day1_price INTEGER;
> ALTER TABLE products ADD COLUMN IF NOT EXISTS day2_price INTEGER;
> ALTER TABLE products ADD COLUMN IF NOT EXISTS day3_price INTEGER;
> ALTER TABLE products ADD COLUMN IF NOT EXISTS day4_price INTEGER;
> ALTER TABLE products ADD COLUMN IF NOT EXISTS day5_price INTEGER;
> ALTER TABLE products ADD COLUMN IF NOT EXISTS extra_day_rate INTEGER;
> ALTER TABLE products ADD COLUMN IF NOT EXISTS readiness_hours INT NOT NULL DEFAULT 0;
> ALTER TABLE products ALTER COLUMN price DROP NOT NULL;
>
> ALTER TABLE order_items ADD COLUMN IF NOT EXISTS day1_price INTEGER;
> ALTER TABLE order_items ADD COLUMN IF NOT EXISTS day2_price INTEGER;
> ALTER TABLE order_items ADD COLUMN IF NOT EXISTS day3_price INTEGER;
> ALTER TABLE order_items ADD COLUMN IF NOT EXISTS day4_price INTEGER;
> ALTER TABLE order_items ADD COLUMN IF NOT EXISTS day5_price INTEGER;
> ALTER TABLE order_items ADD COLUMN IF NOT EXISTS extra_day_rate INTEGER;
> ALTER TABLE order_items ALTER COLUMN price_per_day DROP NOT NULL;
> ALTER TABLE order_items ALTER COLUMN incremental_price DROP NOT NULL;
> ALTER TABLE order_items ALTER COLUMN discount_threshold_days DROP NOT NULL;
>
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS returned_at VARCHAR(255);
> ```
> Setelah menjalankan SQL di atas, jalankan `DATABASE_URL="..." npx tsx migrate-pricing-v2.ts` satu kali untuk mengisi angka harga baru ke katalog produk yang sudah ada (dan menambahkan produk-produk baru), **sebelum** men-deploy kode aplikasi versi baru.

> **Sudah pernah menjalankan Step A sebelum kolom `pickup_id_type` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang). Kolom `id_card_base64` sekarang menyimpan foto diri pelanggan (bukan scan KTP/SIM), sedangkan `pickup_id_type` mencatat jenis kartu identitas fisik (KTP/SIM/KTA/KIP/Kartu Pelajar/dll.) yang diserahkan langsung di toko sebagai jaminan saat status pesanan berubah ke "Item Picked Up". Nullable, tanpa default - order lama tetap `NULL` selamanya, tidak ada regresi.
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_id_type VARCHAR(255);
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `picked_up_at` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - nullable, tanpa default, order lama tetap `NULL` selamanya. Menyimpan waktu (ISO datetime) saat status pesanan berubah ke "Item Picked Up", diisi otomatis sekali oleh server (bukan input staf). Sejak fitur ini, batas waktu pengembalian (dipakai kalkulator denda) dihitung dari `picked_up_at + durasi sewa x 24 jam`, bukan lagi dari jam tutup toko pada tanggal selesai sewa yang dibooking - order lama tanpa `picked_up_at` otomatis memakai aturan lama sebagai fallback, tidak ada regresi.
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at VARCHAR(255);
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `amount_paid` di `orders` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - nullable, tanpa default, order lama tetap `NULL` selamanya (tidak ada regresi). Menyimpan total yang sudah benar-benar diterima dari penyewa - bisa berupa DP (down payment) sebagian atau pembayaran penuh, diisi saat staf menekan "Konfirmasi Pembayaran" di menu Manajemen Order, dan otomatis disesuaikan menjadi lunas saat pesanan diselesaikan (barang dikembalikan). Sisa tagihan (`total_price + late_fee - amount_paid`) selalu dihitung on-the-fly, tidak pernah disimpan sebagai kolom terpisah.
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC;
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `status_history` di `orders` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - nullable tanpa default; kode aplikasi (`rowToOrder` di `db/postgres.ts`) otomatis memakai `[]` selama kolom masih `NULL`, jadi tidak ada regresi pada order lama. Menyimpan jejak audit staf mana yang mengubah status pesanan ke apa dan kapan (Pending &rarr; Approved/Paid &rarr; Item Picked Up &rarr; Item Returned/Completed), ditampilkan sebagai "Riwayat Status" di Manajemen Order. Transisi otomatis oleh sistem (pesanan Pending yang kedaluwarsa) dicatat dengan nama "Sistem (Otomatis)". Pembuatan pesanan awal (status Pending pertama kali) sengaja tidak dicatat di sini karena itu tindakan pelanggan, bukan staf. Setiap entri juga bisa membawa field opsional `action` yang menggantikan label yang ditampilkan tanpa mengubah arti `status` itu sendiri - dipakai untuk mencatat aksi non-transisi seperti edit item/tanggal pesanan (menu Manajemen Order, khusus pesanan berstatus Pending), yang muncul di "Riwayat Status" sebagai "Item/Tanggal Diubah" alih-alih nama status.
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_history JSONB;
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `penalties` di `orders` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - nullable tanpa default; kode aplikasi (`rowToOrder` di `db/postgres.ts`) otomatis memakai `[]` selama kolom masih `NULL`, jadi tidak ada regresi pada order lama. Menyimpan denda kerusakan/kehilangan alat yang diinput manual oleh staf saat barang dikembalikan (Manajemen Order), masing-masing dengan jenis (Kerusakan/Kehilangan), item terkait, alasan, dan nominal - dijumlahkan ke Total Invoice dan otomatis dilunasi bersama sisa pembayaran saat pesanan diselesaikan, sama seperti denda keterlambatan.
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS penalties JSONB;
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `active`/`product_ids` di `job_price_list` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - `active` otomatis mengisi `true` untuk semua baris yang sudah ada saat ALTER dijalankan (item lama tidak pernah tiba-tiba jadi nonaktif), dan `product_ids` (array id dari tabel `products`, dipakai menu "Item Operasional" untuk menyimpan alat rental mana saja yang jadi dasar item harga tersebut) nullable tanpa default - baris lama yang dibuat sebelum fitur ini tetap `NULL` selamanya, tidak ada regresi.
> ```sql
> ALTER TABLE job_price_list ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
> ALTER TABLE job_price_list ADD COLUMN IF NOT EXISTS product_ids VARCHAR(255)[];
> ```

> **Sudah pernah menjalankan Step A sebelum tabel `settings` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang), **sebelum men-deploy kode baru** - kode aplikasi mengasumsikan tabel ini sudah ada saat boot. Tabel ini menyimpan toleransi keterlambatan (jam) dan jadwal jam buka toko per hari (dipakai kalkulator denda keterlambatan), diatur dari menu "Pengaturan" di admin panel. Baris tunggal (`id = 1`) - `operating_hours` disimpan sebagai JSONB (bukan 7×2 kolom terpisah) karena strukturnya berbentuk objek per-hari yang lebih pas dipetakan langsung ke `WeeklyHours` di `src/types.ts` tanpa kode mapping tambahan.
> ```sql
> CREATE TABLE IF NOT EXISTS settings (
>   id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
>   late_tolerance_hours INTEGER NOT NULL DEFAULT 4,
>   pending_expiry_hours INTEGER NOT NULL DEFAULT 2,
>   operating_hours JSONB NOT NULL,
>   footer JSONB,
>   running_text VARCHAR(255)[],
>   terms_and_conditions TEXT
> );
> ```
> Setelah tabel dibuat, boot aplikasi berikutnya akan otomatis mengisi baris default (lihat `seedPostgresIfEmpty` di `db/postgres.ts`) - tidak perlu INSERT manual.

> **Sudah pernah menjalankan Step A sebelum tabel `users`/`job_price_list`/`job_entries` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang), **sebelum men-deploy kode baru** - kode aplikasi mengasumsikan ketiga tabel ini sudah ada saat boot. `users` menyimpan akun staff (role `owner`/`karyawan`, password di-hash dengan scrypt - lihat `src/auth.ts`, tidak pernah disimpan plain text). `job_price_list` adalah daftar harga per item x jenis pekerjaan (Cleaning/Laundry/Inventaris), dikelola dari tab Pengaturan. `job_entries` adalah pekerjaan yang dicatat karyawan dari menu Operational, disetujui & dibayar dari menu Approval.
> ```sql
> CREATE TABLE IF NOT EXISTS users (
>   id VARCHAR(255) PRIMARY KEY,
>   username VARCHAR(255) UNIQUE NOT NULL,
>   password_hash VARCHAR(255) NOT NULL,
>   password_salt VARCHAR(255) NOT NULL,
>   role VARCHAR(50) NOT NULL,
>   display_name VARCHAR(255) NOT NULL,
>   active BOOLEAN NOT NULL DEFAULT true,
>   session_token VARCHAR(255),
>   created_at VARCHAR(255) NOT NULL
> );
>
> CREATE TABLE IF NOT EXISTS job_price_list (
>   id VARCHAR(255) PRIMARY KEY,
>   item_name VARCHAR(255) NOT NULL,
>   cleaning_price INTEGER,
>   laundry_price INTEGER,
>   inventaris_price INTEGER,
>   active BOOLEAN NOT NULL DEFAULT true,
>   product_ids VARCHAR(255)[]
> );
>
> CREATE TABLE IF NOT EXISTS job_entries (
>   id VARCHAR(255) PRIMARY KEY,
>   employee_user_id VARCHAR(255) NOT NULL,
>   employee_name VARCHAR(255) NOT NULL,
>   entry_date VARCHAR(255) NOT NULL,
>   item_name VARCHAR(255) NOT NULL,
>   job_type VARCHAR(50) NOT NULL,
>   unit_price INTEGER NOT NULL,
>   quantity INTEGER NOT NULL,
>   total INTEGER NOT NULL,
>   status VARCHAR(50) NOT NULL,
>   payment_date VARCHAR(255),
>   rejection_reason VARCHAR(255),
>   rejected_at VARCHAR(255),
>   created_at VARCHAR(255) NOT NULL
> );
> ```
> Setelah tabel dibuat, boot aplikasi berikutnya akan otomatis mengisi akun owner default (`bilboadmin` / `bilbooutdoor2026`) dan daftar harga pekerjaan default - tidak perlu INSERT manual.

> **Sudah pernah menjalankan Step A sebelum kolom `active` di `users` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - `active` otomatis mengisi `true` untuk semua akun staff yang sudah ada saat ALTER dijalankan (tidak ada akun yang tiba-tiba jadi nonaktif). Dipakai fitur nonaktifkan/hapus/edit akun di menu "User" - lihat `hasOtherActiveOwner` di `server.ts` untuk aturan yang mencegah owner aktif terakhir dinonaktifkan/dihapus/diubah rolenya.
> ```sql
> ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `varian`/`size`/`color` di `products` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - ketiganya nullable tanpa default, baris produk yang sudah ada tetap `NULL` selamanya (tidak ada regresi tampilan). Dipakai menu "Manajemen Stok" untuk atribut opsional tambahan (varian, ukuran, warna) yang tampil di halaman katalog publik dan di daftar pilih-alat pada fitur Edit Pesanan, hanya jika diisi.
> ```sql
> ALTER TABLE products ADD COLUMN IF NOT EXISTS varian VARCHAR(255);
> ALTER TABLE products ADD COLUMN IF NOT EXISTS size VARCHAR(255);
> ALTER TABLE products ADD COLUMN IF NOT EXISTS color VARCHAR(255);
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `rejection_reason`/`rejected_at` di `job_entries` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - keduanya nullable tanpa default, baris pekerjaan yang sudah ada tetap `NULL` selamanya (tidak ada regresi). Dipakai tombol "Tolak" di menu Approval - status `Rejected` beserta alasannya, agar karyawan tahu apa yang perlu diperbaiki sebelum mencatat ulang.
> ```sql
> ALTER TABLE job_entries ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(255);
> ALTER TABLE job_entries ADD COLUMN IF NOT EXISTS rejected_at VARCHAR(255);
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `footer`/`running_text` di `settings` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - keduanya nullable tanpa default; kode aplikasi (`rowToSettings` di `db/postgres.ts`) otomatis memakai nilai default bawaan (`db/defaultSettings.ts`) selama kolom masih `NULL`, jadi tidak ada regresi tampilan sebelum baris `settings` disimpan ulang lewat menu Pengaturan. `footer` menyimpan teks footer halaman publik (deskripsi, alamat, Instagram, WhatsApp, copyright) sebagai JSONB, `running_text` menyimpan daftar teks bar berjalan (marquee) di bagian bawah halaman publik - keduanya diatur dari menu "Pengaturan".
> ```sql
> ALTER TABLE settings ADD COLUMN IF NOT EXISTS footer JSONB;
> ALTER TABLE settings ADD COLUMN IF NOT EXISTS running_text VARCHAR(255)[];
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `pending_expiry_hours` di `settings` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - `DEFAULT 2` otomatis mengisi baris yang sudah ada dengan nilai lama yang sebelumnya hardcode di kode (2 jam), jadi tidak ada regresi perilaku. Menentukan berapa jam pesanan Pending tanpa pembayaran dibiarkan sebelum otomatis berubah jadi Expired (lihat `expireStaleOrders` di `server.ts`), diatur dari menu "Pengaturan" -> Toleransi Keterlambatan.
> ```sql
> ALTER TABLE settings ADD COLUMN IF NOT EXISTS pending_expiry_hours INTEGER NOT NULL DEFAULT 2;
> ```

> **Sudah pernah menjalankan Step A sebelum kolom-kolom payment gateway (`payment_method`/`payment_channel`/`payment_instruction`/`wuzzpay_transaction_id`/`wuzzpay_provider`/`wuzzpay_last_status`) di `orders` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - semuanya nullable tanpa default, order lama tetap `NULL` selamanya, tidak ada regresi. Menyimpan hasil integrasi WuzzPay (payment gateway aggregator): `payment_method` (`qris`/`va`/`emoney`) dan `payment_channel` (kode bank atau e-wallet) yang dipilih pelanggan, `payment_instruction` (JSONB - nomor VA/string QRIS/waktu kedaluwarsa mentah dari `POST /v1/charge`, dipakai halaman konfirmasi pesanan untuk render ulang setelah reload tanpa charge ulang), dan tiga kolom debugging admin-only (`wuzzpay_transaction_id`, `wuzzpay_provider`, `wuzzpay_last_status`) yang **tidak pernah dikirim** ke endpoint publik `GET /api/orders/confirm/:token` (lihat `PublicOrder` di `src/types.ts`). Status pembayaran tidak pernah dipercaya dari body webhook - server selalu memverifikasi ulang lewat `GET /v1/transactions/{id}` miliknya sendiri sebelum mengubah status pesanan (lihat `verifyAndSettleOrderPayment` di `server.ts`).
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(255);
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(255);
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_instruction JSONB;
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS wuzzpay_transaction_id VARCHAR(255);
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS wuzzpay_provider VARCHAR(255);
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS wuzzpay_last_status VARCHAR(255);
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `wuzzpay_charged_amount` di `orders` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - nullable tanpa default, order lama tetap `NULL` selamanya, tidak ada regresi. Menyimpan nominal Rupiah yang benar-benar diminta dalam pemanggilan `POST /v1/charge` - bisa berupa DP (minimum 50% dari `total_price`, lihat rute `/charge` di `server.ts`) atau pembayaran penuh. `applyWuzzpaySettlementStatus` membaca kolom ini (bukan `total_price`) saat mengisi `amount_paid` setelah pembayaran online terverifikasi, sehingga DP tercatat sebagai DP, bukan langsung dianggap lunas - sisanya tetap tertagih lewat `Sisa Pembayaran` seperti pembayaran tunai sebagian yang sudah ada. Dibuat sebagai kolom baru, bukan menguraikan `payment_instruction` (JSONB mentah dari WuzzPay) untuk mengambil nominalnya, karena bentuk respons WuzzPay untuk QRIS/e-money belum terverifikasi ikut mengembalikan nominal yang sama seperti VA.
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS wuzzpay_charged_amount INTEGER;
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `personal_photo_path` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - nullable, tanpa default, order lama tetap `NULL` selamanya, tidak ada regresi atau backfill otomatis. Kolom ini menyimpan *path* (bukan URL penuh) foto diri pelanggan di dalam bucket **privat** Supabase Storage baru (`bilbo-personal-photos`), pengganti `id_card_base64` (yang menyimpan foto sebagai teks base64 mentah - TOAST besar yang ditulis ulang setiap kali order-nya di-update, lihat komentar di atas `ORDER_COLUMNS_NO_PHOTO` di `db/postgres.ts`). `id_card_base64` tetap dipertahankan apa adanya untuk order lama, dan tetap dipakai sebagai fallback untuk order baru bila `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` belum dikonfigurasi atau upload ke Storage gagal. `GET /api/orders/:id` (satu-satunya rute yang butuh foto asli) menyelesaikan salah satu dari dua kolom ini menjadi satu string `personalPhotoBase64` yang langsung bisa dipakai (`data:...;base64,...` untuk yang lama, signed URL berumur pendek untuk yang baru) - bentuk field di response tidak berubah, lihat `readOrderPhoto` di `server.ts`.
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS personal_photo_path VARCHAR(255);
> ```

> **Sudah pernah menjalankan Step A sebelum index `idx_order_items_order_id` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang, tidak mengubah data apa pun). `order_items.order_id` di-query lewat `WHERE`/`DELETE` di setiap penulisan order (lihat `writeOrdersPostgres` di `db/postgres.ts`), tapi Postgres tidak otomatis membuat index untuk kolom foreign key (hanya sisi yang direferensikan, `orders.id`, yang otomatis ter-index) - tanpa index ini, setiap penulisan order melakukan sequential scan ke seluruh tabel `order_items`.
> ```sql
> CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
> ```

> **Sudah pernah menjalankan Step A sebelum kolom `terms_and_conditions` di `settings` ada?** Jalankan ini sekali di SQL Editor yang sama (aman dijalankan berulang) - nullable tanpa default; kode aplikasi (`rowToSettings` di `db/postgres.ts`) otomatis memakai teks default bawaan (`db/defaultSettings.ts`) selama kolom masih `NULL`. Menyimpan teks bebas Syarat & Ketentuan yang ditampilkan lewat popup di halaman checkout publik (wajib dicentang sebelum pelanggan bisa kirim pemesanan) - diatur dari menu "Pengaturan".
> ```sql
> ALTER TABLE settings ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
> ```

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
