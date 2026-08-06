import { ReactNode } from 'react';

// Static in-app mirror of docs/Panduan-Bilbo-Outdoors.pdf - keep both in sync
// when admin/client flows change. Deliberately holds no real credential
// values (see AdminLoginScreen.tsx) since this page is reachable by every
// logged-in staff account, including Karyawan.

function Ui({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block bg-zinc-50 border border-zinc-300 rounded-none px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">
      {children}
    </span>
  );
}

function RoleTag({ owner }: { owner?: boolean }) {
  return owner ? (
    <span className="ml-2 inline-block bg-brand text-black border-2 border-black px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider align-middle">
      Owner/Master
    </span>
  ) : (
    <span className="ml-2 inline-block bg-zinc-100 text-zinc-600 border border-zinc-300 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider align-middle">
      Karyawan &amp; Owner
    </span>
  );
}

function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-l-4 border-brand bg-zinc-50 p-4 text-xs text-zinc-800 leading-relaxed rounded-none">
      <div className="font-mono text-[10px] uppercase tracking-wider text-amber-700 mb-1.5 font-black">{label}</div>
      {children}
    </div>
  );
}

function FieldsTable({ rows }: { rows: { label: string; desc: ReactNode }[] }) {
  return (
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="border-b-2 border-black">
          <th className="py-2 pr-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-black">Kolom</th>
          <th className="py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-black">Keterangan</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-zinc-200 align-top">
            <td className="py-2.5 pr-3 font-black w-40 shrink-0">{r.label}</td>
            <td className="py-2.5 text-zinc-700 leading-relaxed">{r.desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5 my-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="shrink-0 w-5 h-5 rounded-full bg-black text-brand font-mono text-[10px] font-black flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-xs text-zinc-800 leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function StatusFlow({ statuses, branch }: { statuses: string[]; branch?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 my-1">
      {statuses.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className="bg-black text-white font-mono text-[10px] px-2.5 py-1.5 uppercase">{s}</span>
          {i < statuses.length - 1 && <span className="text-amber-700 font-black">&rarr;</span>}
        </div>
      ))}
      {branch && (
        <span className="bg-amber-50 border-2 border-brand text-amber-800 font-mono text-[10px] px-2.5 py-1.5 uppercase ml-1">
          {branch}
        </span>
      )}
    </div>
  );
}

interface SectionProps {
  id: string;
  num: string;
  part?: string;
  title: string;
  owner?: boolean;
  kicker?: string;
  children: ReactNode;
}

function Section({ id, num, part, title, owner, kicker, children }: SectionProps) {
  return (
    <section id={id} className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-6 scroll-mt-6">
      {part && <div className="font-mono text-[10px] uppercase tracking-wider text-amber-700 font-black mb-1.5">{part}</div>}
      <h3 className="text-lg font-display font-black uppercase border-l-4 border-brand pl-3 leading-tight">
        {num} {title}
        {owner !== undefined && <RoleTag owner={owner} />}
      </h3>
      {kicker && <p className="text-xs text-zinc-500 font-semibold mt-2 mb-4 max-w-2xl">{kicker}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const TOC: { id: string; num: string; title: string }[] = [
  { id: 'g-1-1', num: '1.1', title: 'Masuk ke Sistem Admin' },
  { id: 'g-1-2', num: '1.2', title: 'Owner/Master vs Karyawan' },
  { id: 'g-1-3', num: '1.3', title: 'Navigasi & Menu Atas' },
  { id: 'g-1-4', num: '1.4', title: 'Overview' },
  { id: 'g-1-5', num: '1.5', title: 'Manajemen Order' },
  { id: 'g-1-6', num: '1.6', title: 'Manajemen Stok' },
  { id: 'g-1-7', num: '1.7', title: 'Operational' },
  { id: 'g-1-8', num: '1.8', title: 'Approval' },
  { id: 'g-1-9', num: '1.9', title: 'Item Operasional' },
  { id: 'g-1-10', num: '1.10', title: 'Pengaturan Toko' },
  { id: 'g-1-11', num: '1.11', title: 'Manajemen User' },
  { id: 'g-2-1', num: '2.1', title: 'Alur Pemesanan' },
  { id: 'g-2-2', num: '2.2', title: 'Promo & Diskon' },
  { id: 'g-2-3', num: '2.3', title: 'Memilih Tanggal Sewa' },
  { id: 'g-2-4', num: '2.4', title: 'Memilih Alat Camping' },
  { id: 'g-2-5', num: '2.5', title: 'Ringkasan Keranjang' },
  { id: 'g-2-6', num: '2.6', title: 'Formulir Penyewa' },
  { id: 'g-2-7', num: '2.7', title: 'Konfirmasi & Pembayaran' },
  { id: 'g-2-8', num: '2.8', title: 'Setelah Pesanan Dikirim' },
  { id: 'g-a', num: 'A', title: 'Catatan Penting' },
];

export default function GuideTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">Panduan Penggunaan</h2>
        <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">
          Versi web dari panduan admin &amp; pelanggan Bilbo Outdoors.
        </p>
      </div>

      <div className="bg-zinc-50 border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
          {TOC.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className="text-xs font-bold text-zinc-700 hover:text-black hover:underline py-0.5"
            >
              <span className="font-mono text-amber-700 mr-1.5">{t.num}</span>
              {t.title}
            </a>
          ))}
        </div>
      </div>

      <div className="font-mono text-[10px] uppercase tracking-wider text-amber-700 font-black pt-2">
        Bagian 1 &middot; Panduan Admin &amp; Staf
      </div>

      <Section id="g-1-1" num="1.1" title="Masuk ke Sistem Admin" kicker="Cara staf dan owner mengakses panel admin.">
        <p>
          Panel admin dapat diakses melalui tombol <Ui>Staff Admin</Ui> di pojok kanan atas halaman utama, atau langsung
          membuka alamat <Ui>/admin</Ui> di browser. Isi <Ui>Username</Ui> dan <Ui>Password</Ui>, lalu tekan{' '}
          <Ui>Masuk Sistem Admin</Ui>. Kesalahan login ditampilkan sebagai pesan merah di atas formulir.
        </p>
        <Note label="Akun & Password">
          Setiap staf memiliki akun masing-masing, dibuatkan oleh Owner melalui menu User (lihat 1.11). Jika belum
          memiliki akun, hubungi Owner/Admin utama untuk dibuatkan. Setelah menerima akun baru, segera ganti password
          melalui menu <Ui>Ganti Password</Ui> (lihat 1.3).
        </Note>
        <p>
          Sesi login tersimpan di browser dan tidak perlu diulang setiap membuka halaman, sampai staf menekan tombol{' '}
          <Ui>Logout</Ui>.
        </p>
      </Section>

      <Section id="g-1-2" num="1.2" title="Dua Peran Pengguna: Owner/Master vs Karyawan" kicker="Sistem membedakan hak akses antara pemilik usaha dan karyawan operasional.">
        <FieldsTable
          rows={[
            {
              label: 'Owner / Master',
              desc: 'Melihat semua menu: Overview, Manajemen Order, Manajemen Stok, Operational, Approval, Item Operasional, Pengaturan, User, dan Panduan. Setelah login diarahkan ke Overview.',
            },
            {
              label: 'Karyawan',
              desc: 'Hanya melihat Manajemen Order, Operational, dan Panduan. Menu lain disembunyikan sepenuhnya. Setelah login diarahkan ke Operational.',
            },
          ]}
        />
        <p>
          Karyawan bertugas mengonfirmasi pesanan masuk dan mencatat pekerjaan harian (cleaning/laundry/inventaris).
          Karyawan bisa membuat/mengedit catatan pekerjaannya sendiri selama masih Pending, tapi tidak bisa menyetujui
          pembayaran (Approval) atau mengubah daftar harga (Item Operasional) &mdash; keduanya khusus Owner.
        </p>
      </Section>

      <Section id="g-1-3" num="1.3" title="Navigasi & Menu Bagian Atas" kicker="Elemen yang selalu tampil di bagian atas setiap halaman admin.">
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-800">
          <li><Ui>Refresh Data</Ui> &mdash; memuat ulang seluruh data admin dari server.</li>
          <li><Ui>Ganti Password</Ui> &mdash; ikon kunci, membuka jendela ubah password.</li>
          <li>Nama staf yang sedang login beserta label peran.</li>
          <li><Ui>Logout</Ui> &mdash; keluar dari sesi admin.</li>
          <li><Ui>Portal Client</Ui> &mdash; berpindah ke halaman publik/pelanggan.</li>
        </ul>
        <p className="font-bold text-xs mt-3">Mengganti password</p>
        <Steps
          items={[
            <>Klik ikon <Ui>Ganti Password</Ui> di navbar.</>,
            <>Isi <Ui>Password Saat Ini</Ui>, <Ui>Password Baru</Ui> (min. 6 karakter), dan <Ui>Konfirmasi Password Baru</Ui>.</>,
            <>Tekan <Ui>Simpan Password Baru</Ui>. Sesi login tetap berjalan, tidak perlu login ulang.</>,
          ]}
        />
      </Section>

      <Section id="g-1-4" num="1.4" title="Overview" owner kicker="Dasbor ringkasan statistik penyewaan.">
        <p>
          Judul <strong>STATISTIK PENYEWAAN</strong> dengan filter tanggal <Ui>Dari</Ui>/<Ui>Sampai</Ui> (default awal
          bulan berjalan sampai hari ini). Tiga kartu statistik: <strong>Sewa Aktif</strong>, <strong>Total Omset</strong>{' '}
          (termasuk denda), dan <strong>Jatuh Tempo Hari Ini</strong>. Di bawahnya: Distribusi Status Pesanan dan
          Peralatan Terlaris Disewa.
        </p>
      </Section>

      <Section id="g-1-5" num="1.5" title="Manajemen Order" kicker="Menu utama untuk memproses seluruh pesanan pelanggan.">
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-800">
          <li>Pencarian <Ui>Cari nama / WhatsApp...</Ui>, filter status, filter tanggal <Ui>Dari</Ui>/<Ui>Sampai</Ui>.</li>
          <li>
            <Ui>Unduh Excel</Ui> &mdash; ekspor daftar pesanan yang sedang tampil (sesuai filter aktif) ke CSV. Nonaktif
            jika daftar kosong.
          </li>
        </ul>
        <p className="font-bold text-xs mt-3">Alur status pesanan</p>
        <StatusFlow statuses={['Pending', 'Approved/Paid', 'Item Picked Up', 'Item Returned/Completed']} branch="Expired" />
        <p>
          <strong>Expired</strong> adalah cabang khusus: pesanan Pending yang belum dibayar dalam 2 jam otomatis berubah
          menjadi Expired, namun tetap bisa disetujui manual selama stok masih tersedia.
        </p>
        <p className="font-bold text-xs mt-3">Panel Detail Order</p>
        <Steps
          items={[
            <>Saat Pending/Expired, setelah verifikasi bukti pembayaran (lihat 2.7): tekan <Ui>Konfirmasi Pembayaran (Setujui Sewa)</Ui>.</>,
            <>Saat pelanggan mengambil barang: pilih <Ui>Jaminan yang Diberikan</Ui>, lalu <Ui>Konfirmasi &amp; Serahkan Barang</Ui>.</>,
            <>
              Saat barang dikembalikan: <Ui>Tanpa Denda</Ui> untuk langsung selesai, atau <Ui>Kalkulator Denda</Ui> &rarr;{' '}
              <Ui>Hitung</Ui> &rarr; <Ui>Terapkan Denda &amp; Selesaikan Sewa</Ui> jika terlambat.
            </>,
          ]}
        />
      </Section>

      <Section id="g-1-6" num="1.6" title="Manajemen Stok" kicker="Mengelola katalog alat: tambah, edit, hapus, harga, dan foto produk.">
        <FieldsTable
          rows={[
            { label: 'Nama Alat', desc: 'Nama produk yang tampil di katalog.' },
            { label: 'Kategori', desc: <>Pilih dari daftar, atau <Ui>Tambah Kategori Baru</Ui>.</> },
            {
              label: 'Varian / Ukuran / Warna',
              desc: <>Atribut opsional tambahan, diisi dengan cara yang sama seperti Kategori (pilih dari daftar atau ketik nilai baru). Boleh dibiarkan <Ui>(Tidak Ada)</Ui>. Jika diisi, nilainya otomatis tampil di halaman katalog publik di bawah deskripsi produk.</>,
            },
            { label: 'Tabel Harga (Rp)', desc: 'Harian, 2 Hari, 3 Hari, 4 Hari, 5 Hari, 5 Hari+ (per hari).' },
            { label: 'Waktu Kesiapan', desc: 'Jam alat perlu "istirahat" sebelum disewakan lagi.' },
            { label: 'Stok Awal', desc: 'Jumlah unit yang dimiliki.' },
            {
              label: 'Gambar Produk',
              desc: <><Ui>Upload Gambar</Ui> &mdash; foto otomatis diperkecil &amp; diunggah, hasil URL terisi otomatis. URL manual tetap tersedia sebagai alternatif.</>,
            },
          ]}
        />
        <p>Stok bisa ditambah/dikurangi langsung dari kartu produk lewat tombol <Ui>-</Ui>/<Ui>+</Ui>, tanpa membuka form edit.</p>
      </Section>

      <Section id="g-1-7" num="1.7" title="Operational" kicker="Karyawan mencatat pekerjaan cleaning/laundry/inventaris yang sudah dilakukan.">
        <Steps
          items={[
            <>Tekan <Ui>Tambah Pekerjaan</Ui>.</>,
            <>Isi <Ui>Tanggal</Ui>, pilih <Ui>Item</Ui> dan <Ui>Jenis Pekerjaan</Ui>.</>,
            <>Nominal terisi otomatis; isi <Ui>Qty</Ui>, lalu tekan <Ui>Simpan Pekerjaan</Ui>.</>,
          ]}
        />
        <p>Entri yang masih Pending atau Ditolak bisa di-<Ui>Edit</Ui>; yang sudah Dibayar terkunci. Tersedia filter tanggal dan baris total.</p>
        <Note label="Status Ditolak">
          Jika Owner menolak sebuah entri (lihat 1.8), statusnya berubah menjadi <strong>Ditolak</strong> dan alasan penolakan
          ditampilkan langsung di bawah nama item. Perbaiki data yang salah lalu tekan <Ui>Simpan Pekerjaan</Ui> &mdash;
          entri otomatis kembali berstatus Pending dan masuk lagi ke antrean Approval.
        </Note>
      </Section>

      <Section id="g-1-8" num="1.8" title="Approval" owner kicker="Owner meninjau, menyetujui, dan membayar pekerjaan yang dicatat karyawan.">
        <Steps
          items={[
            'Centang baris pekerjaan yang ingin dibayar (tersedia checkbox pilih-semua).',
            <>Isi <Ui>Tanggal Pembayaran</Ui>.</>,
            <>Tekan <Ui>Setujui &amp; Bayar Terpilih</Ui>.</>,
          ]}
        />
        <p>Tabel <strong>Riwayat Dibayar</strong> di bawahnya mencatat seluruh pekerjaan yang sudah dibayar beserta tanggalnya.</p>

        <p className="font-bold text-xs mt-3">Menolak entri yang salah input</p>
        <p>
          Setiap baris Pending juga punya tombol <Ui>Tolak</Ui> &mdash; dipakai saat karyawan salah mencatat data (item,
          qty, atau jenis pekerjaan yang keliru). Menekan Tolak membuka jendela kecil yang meminta{' '}
          <Ui>Alasan Penolakan</Ui> (wajib diisi), lalu tekan <Ui>Tolak Pekerjaan</Ui>.
        </p>
        <p>
          Entri yang ditolak pindah ke tabel <strong>Riwayat Ditolak</strong> beserta alasannya, dan otomatis muncul di
          menu Operational karyawan yang bersangkutan berstatus Ditolak agar bisa diperbaiki dan dicatat ulang (lihat 1.7).
        </p>
      </Section>

      <Section id="g-1-9" num="1.9" title="Item Operasional" owner kicker="Daftar harga acuan tiap jenis pekerjaan per alat.">
        <Note label="Nonaktifkan, Jangan Hapus">
          Gunakan tombol nonaktifkan (ikon daya) untuk menyembunyikan item dari pilihan baru tanpa kehilangan riwayat.
          Menghapus bersifat permanen.
        </Note>
        <p>
          Tekan <Ui>Tambah Item</Ui>, centang alat rental terkait (nama item terisi otomatis), isi harga Cleaning/Laundry/
          Inventaris (boleh kosong), lalu <Ui>Simpan Item</Ui>.
        </p>
      </Section>

      <Section id="g-1-10" num="1.10" title="Pengaturan Toko" owner kicker="Toleransi keterlambatan dan jam operasional yang menjadi dasar perhitungan denda.">
        <p>
          <Ui>Lama Toleransi Keterlambatan Dalam Satuan Jam</Ui> (default 4 jam) &mdash; penyewa bebas denda hanya jika
          mengembalikan dalam jam toleransi <strong>dan</strong> toko masih buka. Tabel <Ui>Jam Operasional Toko</Ui> mengatur
          jam open/close per hari (Senin&ndash;Minggu). Tekan <Ui>Simpan Pengaturan</Ui> setelah mengubah.
        </p>
        <p className="font-bold text-xs mt-3">Footer &amp; Teks Berjalan</p>
        <p>
          Kartu <Ui>Footer &amp; Teks Berjalan</Ui> mengatur teks yang tampil di halaman publik: Deskripsi, Alamat,
          Instagram (teks tampilan &amp; URL), Teks WhatsApp, dan Teks Copyright di footer, serta{' '}
          <Ui>Teks Berjalan (Marquee)</Ui> di bar bawah halaman utama &mdash; satu baris per teks, bebas diisi nama
          kategori, info diskon, atau pengumuman lain.
        </p>
        <Note label="Jam Operasional di Footer Otomatis Mengikuti Tabel di Atas">
          Baris jam buka di footer publik dihitung otomatis dari tabel <Ui>Jam Operasional Toko</Ui> &mdash; tidak perlu
          diisi terpisah, dan tidak akan pernah tidak sinkron dengan jadwal yang dipakai kalkulator denda.
        </Note>
      </Section>

      <Section id="g-1-11" num="1.11" title="Manajemen User" owner kicker="Mengelola akun staf beserta hak aksesnya.">
        <FieldsTable
          rows={[
            { label: 'Nama Lengkap', desc: 'Nama staf yang ditampilkan di navbar.' },
            { label: 'Username', desc: 'Digunakan untuk login.' },
            { label: 'Password Awal', desc: 'Minimal 6 karakter, staf dapat menggantinya sendiri setelah login pertama.' },
            { label: 'Role', desc: 'Karyawan atau Owner/Master.' },
          ]}
        />
        <p>Tekan <Ui>Simpan User</Ui> untuk membuat akun baru.</p>
        <p className="font-bold text-xs mt-3">Mengelola akun yang sudah ada</p>
        <p>
          Setiap baris punya tiga aksi: ikon daya untuk <Ui>Nonaktifkan</Ui>/<Ui>Aktifkan</Ui> (mencabut akses staf sementara tanpa menghapus akunnya &mdash; sesi login yang sedang aktif langsung terputus saat dinonaktifkan), ikon pensil untuk <Ui>Edit</Ui> (hanya Nama Lengkap, Username, dan Role &mdash; kolom password tidak muncul sama sekali di sini), dan ikon tempat sampah untuk menghapus akun secara permanen (meminta konfirmasi terlebih dahulu).
        </p>
        <Note label="Password Staf Tidak Bisa Diatur dari Sini">
          Mengedit user tidak pernah menyentuh password &mdash; itu murni urusan staf yang bersangkutan lewat menu <Ui>Ganti Password</Ui> setelah mereka login sendiri (lihat 1.3).
        </Note>
        <Note label="Perlindungan Owner Terakhir">
          Sistem tidak akan mengizinkan akun Anda sendiri dinonaktifkan atau dihapus lewat menu ini, dan tidak akan mengizinkan owner aktif terakhir dinonaktifkan, dihapus, atau diturunkan rolenya menjadi Karyawan &mdash; supaya tidak ada yang tiba-tiba tidak bisa mengakses sistem sama sekali.
        </Note>
      </Section>

      <div className="font-mono text-[10px] uppercase tracking-wider text-amber-700 font-black pt-4">
        Bagian 2 &middot; Panduan Pelanggan (Halaman Publik)
      </div>

      <Section id="g-2-1" num="2.1" title="Ringkasan Alur Pemesanan" kicker="Gambaran singkat perjalanan pelanggan dari membuka situs sampai pesanan terkirim.">
        <Steps
          items={[
            'Membuka halaman utama dan melihat promo/diskon yang sedang berjalan.',
            'Memilih tanggal mulai & selesai sewa.',
            'Memilih alat camping dan memasukkannya ke keranjang.',
            'Mengecek ringkasan biaya di kotak Current Selection.',
            'Mengisi formulir data diri, termasuk unggah foto sebagai jaminan.',
            'Mengirim pesanan dan diarahkan ke halaman konfirmasi berisi kode pembayaran.',
            'Melakukan pembayaran dan mengirim bukti ke admin via WhatsApp untuk diverifikasi.',
          ]}
        />
      </Section>

      <Section id="g-2-2" num="2.2" title="Melihat Promo & Diskon" kicker="Carousel promo di bagian atas halaman utama.">
        <p>
          Slide pertama menampilkan promo umum: sewa 5 hari berturut-turut mendapat harga total lebih hemat dibanding
          tarif harian. Slide berikutnya menampilkan, per kategori, produk yang sedang didiskon beserta besaran hematnya.
        </p>
      </Section>

      <Section id="g-2-3" num="2.3" title="Memilih Tanggal Sewa" kicker="Langkah pertama sebelum bisa memilih alat.">
        <p>
          Isi <Ui>Tanggal Mulai Sewa</Ui> dan <Ui>Tanggal Selesai Sewa</Ui>. Setelah keduanya terisi, sistem menampilkan
          durasi sewa dan mengecek ketersediaan stok riil untuk rentang tanggal tersebut secara otomatis.
        </p>
      </Section>

      <Section id="g-2-4" num="2.4" title="Memilih Kategori & Alat Camping" kicker="Menjelajahi katalog dan memasukkan alat ke keranjang.">
        <p>
          Tab kategori mempersempit tampilan katalog. Tekan <Ui>Pilih Alat</Ui> untuk menambah 1 unit ke keranjang, lalu
          gunakan <Ui>-</Ui>/<Ui>+</Ui> untuk mengubah jumlah &mdash; dibatasi sisa stok pada rentang tanggal yang dipilih.
        </p>
      </Section>

      <Section id="g-2-5" num="2.5" title="Ringkasan Keranjang (Current Selection)" kicker="Kotak yang menampilkan rincian alat yang sudah dipilih.">
        <p>Menampilkan tiap alat dalam keranjang (nama, jumlah, biaya per baris, durasi) beserta Total Biaya Sewa yang selalu diperbarui.</p>
      </Section>

      <Section id="g-2-6" num="2.6" title="Mengisi Formulir Penyewa" kicker="Data yang perlu diisi pelanggan sebelum mengirim pesanan.">
        <FieldsTable
          rows={[
            { label: 'Nama Lengkap', desc: 'Nama penyewa.' },
            { label: 'No. WhatsApp Aktif', desc: 'Digunakan admin untuk konfirmasi & komunikasi selama masa sewa.' },
            {
              label: 'Upload Foto Diri',
              desc: 'Foto setengah/seluruh badan untuk verifikasi identitas & jaminan sewa. Mendukung kamera langsung atau file tersimpan, termasuk format HEIC dari iPhone.',
            },
          ]}
        />
        <p>Tekan <Ui>Kirim Pemesanan &amp; Bayar</Ui> untuk mengirim. Tombol nonaktif jika keranjang kosong atau sedang mengirim.</p>
      </Section>

      <Section id="g-2-7" num="2.7" title="Halaman Konfirmasi Pesanan & Pembayaran" kicker="Halaman setelah pesanan berhasil dikirim, berisi kode pembayaran dan ringkasan invoice.">
        <p>Menampilkan ID pesanan, kode QRIS, opsi Transfer Bank, dan Ringkasan Invoice. Tautan halaman ini bisa disimpan/dibagikan untuk cek status kapan saja tanpa login.</p>
        <Note label="Penting untuk Staf">
          Kode QRIS di halaman ini bersifat ilustratif dan belum terhubung ke gateway pembayaran sungguhan. Pembayaran
          tetap diverifikasi manual oleh staf dari bukti yang dikirim pelanggan via WhatsApp, sebelum menekan{' '}
          <Ui>Konfirmasi Pembayaran (Setujui Sewa)</Ui> di Manajemen Order (lihat 1.5).
        </Note>
      </Section>

      <Section id="g-2-8" num="2.8" title="Setelah Pesanan Dikirim — Apa Selanjutnya?" kicker="Menghubungkan sisi pelanggan dengan proses yang dilakukan staf.">
        <Steps
          items={[
            'Pelanggan mengirim bukti pembayaran melalui tombol WhatsApp di halaman konfirmasi.',
            'Staf memverifikasi bukti pembayaran secara manual di menu Manajemen Order.',
            <>Setelah terverifikasi, staf menekan <Ui>Konfirmasi Pembayaran (Setujui Sewa)</Ui>.</>,
            'Saat pengambilan & pengembalian barang, staf melanjutkan alur di panel detail order (lihat 1.5).',
          ]}
        />
      </Section>

      <div className="font-mono text-[10px] uppercase tracking-wider text-amber-700 font-black pt-4">Lampiran</div>

      <Section id="g-a" num="A." title="Catatan & Hal Penting">
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-800">
          <li><strong>Ganti password default segera</strong> setelah menerima akun baru dari Owner (lihat 1.1 dan 1.3).</li>
          <li><strong>Pesanan otomatis kedaluwarsa (Expired)</strong> jika belum dibayar dalam 2 jam, namun tetap bisa disetujui manual selama stok mencukupi.</li>
          <li><strong>Foto diri pelanggan</strong> mendukung JPG, PNG, WebP, dan HEIC &mdash; semua diproses otomatis oleh sistem.</li>
          <li><strong>Kode QRIS bersifat ilustratif</strong>, bukan gateway aktif. Semua pembayaran wajib diverifikasi manual sebelum pesanan disetujui.</li>
          <li><strong>Karyawan vs Owner</strong>: jika sebuah menu terasa hilang, periksa dahulu peran akun yang digunakan (lihat 1.2) &mdash; ini bukan kesalahan sistem.</li>
        </ul>
      </Section>
    </div>
  );
}
