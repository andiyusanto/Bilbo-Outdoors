import { useState, useEffect } from 'react';
import { Clock, Save } from 'lucide-react';
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

  useEffect(() => {
    setFormState(settings);
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

      <button
        onClick={() => handleUpdateSettings(formState)}
        disabled={isSaving}
        className="flex items-center bg-black hover:bg-brand hover:text-black text-brand font-black text-xs px-5 py-3 rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-black transition-all uppercase tracking-widest cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Save className="w-4 h-4 mr-2 stroke-[3]" />
        {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
      </button>
    </div>
  );
}
