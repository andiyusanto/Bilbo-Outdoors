import { StoreSettings } from '../src/types';

// Shared default store settings, seeded on first run in both JSON-file mode and
// Postgres mode - matches the owner's real weekly schedule (Sun/Mon open at noon,
// every other day 9am, all days close 10pm), the standard 4-hour late-return
// grace period, the original hardcoded 2-hour unpaid-order expiry window, and
// the public site's original hardcoded footer/marquee text (so seeding this
// doesn't change anything visually), until the owner edits any of it via the
// admin Pengaturan tab.
export const defaultSettings: StoreSettings = {
  lateToleranceHours: 4,
  pendingExpiryHours: 2,
  operatingHours: {
    monday: { open: '12:00', close: '22:00' },
    tuesday: { open: '09:00', close: '22:00' },
    wednesday: { open: '09:00', close: '22:00' },
    thursday: { open: '09:00', close: '22:00' },
    friday: { open: '09:00', close: '22:00' },
    saturday: { open: '09:00', close: '22:00' },
    sunday: { open: '12:00', close: '22:00' },
  },
  footer: {
    description: 'Penyedia sewa alat kemah, trekking, dan hiking terlengkap dan tepercaya di kota Surabaya. Kami memastikan petualangan Anda aman dengan alat berkualitas terbaik.',
    address: 'Jl. Ngagel Jaya Tengah No. 12, Pucang Sewu, Kec. Gubeng, Kota Surabaya, Jawa Timur 60283',
    instagramHandle: '@bilbooutdoors (INSTAGRAM)',
    instagramUrl: 'https://instagram.com/bilbooutdoors',
    whatsappText: 'Narahubung Cepat WA: 0811-370-6666',
    copyrightText: '© 2026 Bilbo Outdoors Surabaya. All rights reserved. Hubungi kami untuk petualangan seru Anda!',
  },
  runningText: [
    'Tent & Shelter',
    'Sleeping Systems',
    'Carrier & Backpack',
    'Cooking Gear',
    'Lighting & Power',
    'Hiking Essentials',
    'Camp Support',
    'Apparel & Personal Gear',
  ],
  // Seeded from the owner's real in-store "Syarat & Ketentuan Rental" poster
  // (2026-08-29, full transcription corrected 2026-08-29 against clearer
  // close-up photos of each panel, plus an owner-requested addition: Uang
  // Jaminan as an explicit identity-collateral alternative in point 1) as a
  // working starting point - free text, fully editable via Pengaturan, not a
  // fixed/structured field.
  termsAndConditions: `SYARAT & KETENTUAN RENTAL

Mohon membaca dan memahami seluruh syarat dan ketentuan sebelum melakukan penyewaan perlengkapan.

1. SYARAT JAMINAN IDENTITAS
- Wajib meninggalkan jaminan berupa e-KTP/SIM ASLI yang masih berlaku (tidak menerima Kartu Pelajar/Mahasiswa, BPJS, NPWP, atau lainnya).
- Jika masih di bawah 17 tahun, bisa meninggalkan jaminan berupa KTA (khusus Surabaya) disertai Foto KK atau bukti fisik KK yang berlaku.
- Sebagai alternatif kartu identitas, bisa juga meninggalkan Uang Jaminan (uang tunai) dengan nominal yang disepakati bersama staf saat pengambilan barang.

2. KETENTUAN BOOKING
- Booking paling lambat dilakukan H-1 sebelum pengambilan barang (baik online booking maupun offline booking).
- Booking baru diproses setelah penyewa membayar DP minimal 50%.
- Booking bisa dilakukan jauh-jauh hari, namun baru bisa memilih barang paling cepat H-7.
- Cancel booking bisa kembali uang 100% jika konfirmasi paling lambat H-3 sebelum tanggal keberangkatan.
- Jika cancel booking kurang dari H-3, maka DP (booking) dinyatakan hangus, karena slot sudah dialokasikan sebelumnya.
- Jika ada perubahan (pengurangan) jumlah (qty) booking (misal: booking 5 tenda, namun ada perubahan menjadi 4 tenda), maksimal H-3.
- Uang yang sudah dibayar tidak bisa dikembalikan. Misal: sudah membayar rental untuk 3 hari, namun ada kondisi di mana barang dikembalikan sebelum waktunya, maka uang tidak bisa dikembalikan.

3. KETENTUAN UMUM
DILARANG KERAS MEMASAK DI DALAM TENDA RENTAL!!!
- Pastikan barang dalam kondisi bagus dan layak pakai pada saat melakukan pengambilan barang.
- Sewa mempunyai sistem 1x24 jam, terhitung semenjak barang diambil + toleransi perjalanan selambat-lambatnya 4 jam (atau sampai toko tutup*).
- Jika melewati batas toleransi, maka akan dikenakan charge dengan hitungan lama sewa full sesuai dengan harga yang berlaku.

Contoh: Ambil tanggal 5 Juni 2026 pukul 14:00, batas pengembalian maksimal jika lama sewa 2 hari adalah tanggal 7 Juni 2026 pukul 18:00 - melewati jam tersebut maka akan dikenakan charge dan terhitung lama sewa 3 hari.

- Penyewa wajib membayar penuh pada saat pengambilan barang.
- Segala bentuk pencurian/kejahatan/kriminalitas selanjutnya akan kami limpahkan ke pihak yang berwajib.
- Peraturan dapat berubah sewaktu-waktu tanpa pemberitahuan sebelumnya sesuai dengan kebijakan dan keputusan pemilik.

4. KERUSAKAN & KEHILANGAN
Kerusakan Ringan: dikenakan biaya perbaikan sesuai tingkat kerusakan.

Kerusakan Berat: dikenakan biaya penggantian sebagian atau penuh sesuai harga barang. Catatan khusus: untuk item Trekking Pole, Headlamp, lampu tenda & senter, segala jenis kerusakan masuk ke Kerusakan Berat dikarenakan tidak bisa dilakukan perbaikan seperti awal.

Kehilangan Barang: penyewa wajib mengganti sesuai harga pasar barang yang hilang.

Dengan melakukan pembayaran dan mengambil barang sewaan, penyewa dianggap telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan yang berlaku di Bilbo Outdoors.`,
};
