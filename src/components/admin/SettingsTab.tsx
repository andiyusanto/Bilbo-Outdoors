import { useState, useEffect } from 'react';
import { Clock, Save, Plus, Pencil, Trash2 } from 'lucide-react';
import { StoreSettings, WeeklyHours, JobPriceListItem } from '../../types';
import { useSettingsActions } from '../../hooks/useSettingsActions';
import { useJobPriceActions } from '../../hooks/useJobPriceActions';

interface SettingsTabProps {
  settings: StoreSettings;
  settingsActions: ReturnType<typeof useSettingsActions>;
  jobPriceList: JobPriceListItem[];
  jobPriceActions: ReturnType<typeof useJobPriceActions>;
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

export default function SettingsTab({ settings, settingsActions, jobPriceList, jobPriceActions }: SettingsTabProps) {
  const { isSaving, handleUpdateSettings } = settingsActions;
  const {
    showJobPriceModal,
    setShowJobPriceModal,
    editingJobPrice,
    jobPriceFormData,
    setJobPriceFormData,
    handleSaveJobPrice,
    handleDeleteJobPrice,
    openAddJobPriceModal,
    openEditJobPriceModal,
  } = jobPriceActions;
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
          Jam Toleransi Setelah Tutup Toko
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

      <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-5 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-black uppercase tracking-wider">Daftar Harga Pekerjaan</h3>
          <button
            onClick={openAddJobPriceModal}
            className="flex items-center bg-black hover:bg-brand hover:text-black text-brand font-black text-[10px] px-3 py-2 rounded-none border-2 border-black transition-all uppercase tracking-widest cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5 stroke-[3]" />
            Tambah Item
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 font-semibold normal-case leading-relaxed -mt-2">
          Harga per jenis pekerjaan (Cleaning/Laundry/Inventaris) untuk tiap item alat - dipakai pada form Operational karyawan. Kosongkan harga jika jenis pekerjaan tersebut tidak berlaku untuk item itu.
        </p>
        <div className="border-2 border-black rounded-none overflow-hidden overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-black text-white text-[10px] uppercase tracking-wider font-black">
              <tr>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">Cleaning</th>
                <th className="px-3 py-2.5">Laundry</th>
                <th className="px-3 py-2.5">Inventaris</th>
                <th className="px-3 py-2.5">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {jobPriceList.map((item) => (
                <tr key={item.id} className="text-xs font-bold">
                  <td className="px-3 py-2.5 text-black uppercase">{item.itemName}</td>
                  <td className="px-3 py-2.5 font-mono text-zinc-600">{item.cleaningPrice !== undefined ? `Rp ${item.cleaningPrice.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="px-3 py-2.5 font-mono text-zinc-600">{item.laundryPrice !== undefined ? `Rp ${item.laundryPrice.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="px-3 py-2.5 font-mono text-zinc-600">{item.inventarisPrice !== undefined ? `Rp ${item.inventarisPrice.toLocaleString('id-ID')}` : '-'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEditJobPriceModal(item)} className="text-black hover:text-brand cursor-pointer" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteJobPrice(item.id)} className="text-red-600 hover:text-red-800 cursor-pointer" title="Hapus">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showJobPriceModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden">
            <div className="bg-black text-white px-5 py-4 flex justify-between items-center border-b-2 border-black">
              <h3 className="font-display font-black text-sm uppercase tracking-wider">
                {editingJobPrice ? 'EDIT HARGA PEKERJAAN' : 'TAMBAH ITEM HARGA'}
              </h3>
              <button
                onClick={() => setShowJobPriceModal(false)}
                className="text-brand hover:text-white font-mono font-black text-xs uppercase cursor-pointer"
              >
                CLOSE
              </button>
            </div>

            <form onSubmit={handleSaveJobPrice} className="p-5 space-y-4 bg-white text-black">
              <div>
                <label className="block text-xs font-black text-black uppercase">Nama Item</label>
                <input
                  type="text"
                  required
                  value={jobPriceFormData.itemName}
                  onChange={(e) => setJobPriceFormData({ ...jobPriceFormData, itemName: e.target.value })}
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {([
                  ['cleaningPrice', 'Cleaning'],
                  ['laundryPrice', 'Laundry'],
                  ['inventarisPrice', 'Inventaris'],
                ] as const).map(([field, label]) => (
                  <div key={field}>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase">{label}</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="-"
                      value={jobPriceFormData[field]}
                      onChange={(e) => setJobPriceFormData({ ...jobPriceFormData, [field]: e.target.value === '' ? '' : Number(e.target.value) })}
                      className="mt-0.5 block w-full rounded-none border-2 border-black px-2 py-2 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] uppercase tracking-widest transition-all mt-4 cursor-pointer"
              >
                Simpan Item
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
