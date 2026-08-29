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
  // (2026-08-29) as a working starting point - free text, fully editable via
  // Pengaturan, not a fixed/structured field.
  termsAndConditions: `SYARAT & KETENTUAN RENTAL

Mohon membaca dan memahami seluruh syarat dan ketentuan sebelum melakukan penyewaan perlengkapan.

1. SYARAT JAMINAN IDENTITAS
- Wajib meninggalkan jaminan berupa e-KTP/SIM ASLI yang masih berlaku (tidak menerima Kartu Pelajar/Mahasiswa, BPJS, NPWP, atau lainnya).
- Jika masih di bawah 17 tahun, wajib meninggalkan jaminan berupa KTA (khusus Surabaya) atau menyerahkan foto KK/bukti fisik KK yang berlaku.

2. KETENTUAN BOOKING
- Booking paling lambat dilakukan H-1 sebelum pengambilan barang (baik online booking maupun offline booking).
- Booking baru diproses setelah penyewa membayar DP minimal 50%.
- Booking bisa dilakukan jauh-jauh hari, namun pemilihan barang baru bisa dilakukan paling cepat H-7 sejak tanggal booking.
- Pembatalan booking bisa dikembalikan 100% jika konfirmasi paling lambat H-3 sebelum tanggal pengambilan.
- Pembatalan kurang dari H-3 dinyatakan hangus, karena slot sudah dialokasikan sebelumnya.
- Perubahan (pengurangan) jumlah/jenis barang booking (misal: booking 5 tenda menjadi 4 tenda) juga berlaku H-3.

Contoh: Ambil tanggal 5 Juni 2026 pukul 14:00 dan kembali tanggal 7 Juni 2026 pukul 18:00 (melewati jam tersebut), maka akan dikenakan charge dengan hitungan lama sewa 3 hari.

3. KETENTUAN UMUM
- Dilarang keras memasak di dalam tenda rental!
- Pastikan barang dalam kondisi bagus dan layak pakai saat pengambilan barang.
- Sewa dihitung per 1x24 jam, terhitung sejak barang diambil.
- Jika melewati batas toleransi, akan dikenakan charge tambahan sesuai hitungan lama sewa.

4. KERUSAKAN & KEHILANGAN
Kerusakan Ringan: dikenakan biaya perbaikan sesuai tingkat kerusakan.

Kerusakan Berat: dikenakan biaya penggantian sebagian atau penuh sesuai harga barang. Catatan khusus: untuk item seperti trekking pole, headlamp, dan lampu tenda, jenis kerusakan apa pun otomatis masuk kategori berat karena tidak bisa diperbaiki sebagian.

Kehilangan Barang: penyewa wajib mengganti sesuai harga pasar barang yang hilang.

Dengan melakukan pembayaran dan mengambil barang sewaan, penyewa dianggap sudah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan yang berlaku di Bilbo Outdoors.`,
};
