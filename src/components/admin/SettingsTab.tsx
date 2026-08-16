import { useState, useEffect, useRef } from 'react';
import { Clock, Save, Megaphone } from 'lucide-react';
import { StoreSettings, WeeklyHours } from '../../types';
import { useSettingsActions } from '../../hooks/useSettingsActions';

interface SettingsTabProps {
  settings: StoreSettings;
  settingsActions: ReturnType<typeof useSettingsActions>;
}

const DAY_ROWS: { key: keyof WeeklyHours; label: string }[] = [
  { key: 'monday', label: 'Senin' },
  { key: 'tuesday', label: 'Selasa' },
  { key: 'wednesday', label: 'Rabu' },
  { key: 'thursday', label: 'Kamis' },
  { key: 'friday', label: 'Jumat' },
  { key: 'saturday', label: 'Sabtu' },
  { key: 'sunday', label: 'Minggu' },
];

export default function SettingsTab({ settings, settingsActions }: SettingsTabProps) {
  const { isSaving, handleUpdateSettings } = settingsActions;
  const [formState, setFormState] = useState<StoreSettings>(settings);

  // Unlike the modal-based edit forms elsewhere (product/user/job-price/job-
  // entry), Settings is an always-mounted page, not something that opens
  // fresh per edit - so it can't just seed once and be done. It still needs
  // to pick up the real settings once they arrive after the initial
  // DEFAULT_SETTINGS placeholder (see useAdminData.ts), and ideally stay
  // live if the admin has this tab open without touching anything. But a
  // background refresh (the 15-minute poll, or another admin's own save)
  // must never silently overwrite unsaved in-progress edits - so only
  // auto-resync while formState is still "pristine" (unchanged since the
  // last sync), tracked via what we last synced from rather than comparing
  // against the incoming settings directly (which would always look
  // "different" the moment the admin edits anything, defeating the check).
  const lastSyncedSettingsRef = useRef<StoreSettings>(settings);
  useEffect(() => {
    setFormState(prev => {
      const isPristine = JSON.stringify(prev) === JSON.stringify(lastSyncedSettingsRef.current);
      lastSyncedSettingsRef.current = settings;
      return isPristine ? settings : prev;
    });
  }, [settings]);

  const updateDayHours = (day: keyof WeeklyHours, field: 'open' | 'close', value: string) => {
    setFormState(prev => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: { ...prev.operatingHours[day], [field]: value },
      },
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">PENGATURAN TOKO</h2>
        <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Atur toleransi keterlambatan dan jam operasional untuk kalkulator denda.</p>
      </div>

      <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-5 space-y-3 max-w-md">
        <h3 className="text-xs font-black text-black uppercase tracking-wider flex items-center">
          <Clock className="w-4 h-4 mr-2 text-black stroke-[2.5]" />
          Toleransi Keterlambatan
        </h3>
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">
          Lama Toleransi Keterlambatan Dalam Satuan Jam
        </label>
        <input
          type="number"
          min={0}
          value={formState.lateToleranceHours}
          onChange={(e) => setFormState(prev => ({ ...prev, lateToleranceHours: Number(e.target.value) }))}
          className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none w-32"
        />
        <p className="text-[10px] text-zinc-500 font-semibold normal-case leading-relaxed">
          Penyewa hanya bebas denda jika mengembalikan dalam jam toleransi ini <strong>DAN</strong> toko masih buka saat itu. Jika sudah lewat jam operasional, otomatis dianggap kembali di hari berikutnya dan tetap kena denda walau belum melewati jumlah jam toleransi.
        </p>

        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider pt-2 border-t border-zinc-200">
          Batas Waktu Pembayaran Sebelum Pesanan Kedaluwarsa (Jam)
        </label>
        <input
          type="number"
          min={0}
          value={formState.pendingExpiryHours}
          onChange={(e) => setFormState(prev => ({ ...prev, pendingExpiryHours: Number(e.target.value) }))}
          className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none w-32"
        />
        <p className="text-[10px] text-zinc-500 font-semibold normal-case leading-relaxed">
          Pesanan berstatus Pending yang belum dibayar dalam jumlah jam ini otomatis berubah menjadi Expired dan berhenti menahan stok. Staf tetap bisa menyetujui pesanan Expired secara manual selama stok masih tersedia.
        </p>
      </div>

      <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-5 space-y-4 max-w-xl">
        <h3 className="text-xs font-black text-black uppercase tracking-wider">Jam Operasional Toko</h3>
        <p className="text-[10px] text-zinc-500 font-semibold normal-case leading-relaxed -mt-2">
          Pengembalian di luar jam buka-tutup ini dianggap baru bisa diproses keesokan harinya, sehingga otomatis kena denda minimal 1 hari.
        </p>
        <div className="space-y-2">
          {DAY_ROWS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-16 text-xs font-black text-black uppercase shrink-0">{label}</span>
              <input
                type="time"
                value={formState.operatingHours[key].open}
                onChange={(e) => updateDayHours(key, 'open', e.target.value)}
                className="bg-white border-2 border-black px-2 py-1.5 text-xs font-bold rounded-none focus:outline-none flex-1"
              />
              <span className="text-xs font-black text-zinc-400">—</span>
              <input
                type="time"
                value={formState.operatingHours[key].close}
                onChange={(e) => updateDayHours(key, 'close', e.target.value)}
                className="bg-white border-2 border-black px-2 py-1.5 text-xs font-bold rounded-none focus:outline-none flex-1"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-5 space-y-4 max-w-xl">
        <h3 className="text-xs font-black text-black uppercase tracking-wider flex items-center">
          <Megaphone className="w-4 h-4 mr-2 text-black stroke-[2.5]" />
          Footer &amp; Teks Berjalan
        </h3>
        <p className="text-[10px] text-zinc-500 font-semibold normal-case leading-relaxed -mt-2">
          Teks yang tampil di footer dan bar teks berjalan (marquee) di halaman publik.
        </p>

        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">Deskripsi</label>
          <textarea
            rows={3}
            value={formState.footer.description}
            onChange={(e) => setFormState(prev => ({ ...prev, footer: { ...prev.footer, description: e.target.value } }))}
            className="mt-1 block w-full bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">Alamat</label>
          <textarea
            rows={2}
            value={formState.footer.address}
            onChange={(e) => setFormState(prev => ({ ...prev, footer: { ...prev.footer, address: e.target.value } }))}
            className="mt-1 block w-full bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">Instagram (Teks Tampilan)</label>
            <input
              type="text"
              value={formState.footer.instagramHandle}
              onChange={(e) => setFormState(prev => ({ ...prev, footer: { ...prev.footer, instagramHandle: e.target.value } }))}
              className="mt-1 block w-full bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">Instagram (URL)</label>
            <input
              type="text"
              value={formState.footer.instagramUrl}
              onChange={(e) => setFormState(prev => ({ ...prev, footer: { ...prev.footer, instagramUrl: e.target.value } }))}
              className="mt-1 block w-full bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">Teks WhatsApp</label>
          <input
            type="text"
            value={formState.footer.whatsappText}
            onChange={(e) => setFormState(prev => ({ ...prev, footer: { ...prev.footer, whatsappText: e.target.value } }))}
            className="mt-1 block w-full bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">Teks Copyright</label>
          <input
            type="text"
            value={formState.footer.copyrightText}
            onChange={(e) => setFormState(prev => ({ ...prev, footer: { ...prev.footer, copyrightText: e.target.value } }))}
            className="mt-1 block w-full bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">Teks Berjalan (Marquee)</label>
          <textarea
            rows={4}
            value={formState.runningText.join('\n')}
            onChange={(e) => setFormState(prev => ({ ...prev, runningText: e.target.value.split('\n') }))}
            placeholder={'Tent & Shelter\nSleeping Systems\n...'}
            className="mt-1 block w-full bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
          <p className="text-[10px] text-zinc-500 font-semibold normal-case leading-relaxed mt-1">
            Satu baris = satu teks yang tampil bergantian di bar bawah. Bisa untuk nama kategori, info diskon, atau pengumuman lain - bebas.
          </p>
        </div>
      </div>

      <button
        onClick={() => handleUpdateSettings({
          ...formState,
          runningText: formState.runningText.map((line) => line.trim()).filter(Boolean),
        })}
        disabled={isSaving}
        className="flex items-center bg-black hover:bg-brand hover:text-black text-brand font-black text-xs px-5 py-3 rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-black transition-all uppercase tracking-widest cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Save className="w-4 h-4 mr-2 stroke-[3]" />
        {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
      </button>
    </div>
  );
}
