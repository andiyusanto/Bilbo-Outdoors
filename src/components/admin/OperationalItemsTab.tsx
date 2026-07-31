import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Tags, Power, Search } from 'lucide-react';
import { JobPriceListItem, Product } from '../../types';
import { useJobPriceActions } from '../../hooks/useJobPriceActions';

interface OperationalItemsTabProps {
  jobPriceList: JobPriceListItem[];
  jobPriceActions: ReturnType<typeof useJobPriceActions>;
  products: Product[];
}

export default function OperationalItemsTab({ jobPriceList, jobPriceActions, products }: OperationalItemsTabProps) {
  const {
    showJobPriceModal,
    setShowJobPriceModal,
    editingJobPrice,
    jobPriceFormData,
    setJobPriceFormData,
    handleSaveJobPrice,
    handleDeleteJobPrice,
    handleToggleActive,
    toggleProductId,
    openAddJobPriceModal,
    openEditJobPriceModal,
  } = jobPriceActions;

  // Tracks whether the admin has manually typed into the name field - once they
  // have, further checkbox clicks stop overwriting their edit. Pure UI ergonomics
  // local to this modal, not shared state.
  const [itemNameManuallyEdited, setItemNameManuallyEdited] = useState(false);
  const [itemSearch, setItemSearch] = useState<string>('');

  const filteredJobPriceList = jobPriceList.filter((item) =>
    item.itemName.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const productsByCategory = useMemo(() => {
    const groups = new Map<string, Product[]>();
    products.forEach((p) => {
      const list = groups.get(p.category) || [];
      list.push(p);
      groups.set(p.category, list);
    });
    return Array.from(groups.entries());
  }, [products]);

  const openAdd = () => {
    setItemNameManuallyEdited(false);
    openAddJobPriceModal();
  };

  const openEdit = (item: JobPriceListItem) => {
    setItemNameManuallyEdited(true); // legacy/existing name is treated as already-set; picking more products won't clobber it
    openEditJobPriceModal(item);
  };

  const onToggleProduct = (productId: string) => {
    toggleProductId(productId);
    if (!itemNameManuallyEdited) {
      const nextIds = jobPriceFormData.productIds.includes(productId)
        ? jobPriceFormData.productIds.filter((id) => id !== productId)
        : [...jobPriceFormData.productIds, productId];
      const names = products.filter((p) => nextIds.includes(p.id)).map((p) => p.name);
      setJobPriceFormData((prev) => ({ ...prev, itemName: names.join(' / ') }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">Item Operasional</h2>
          <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Kelola daftar harga pekerjaan (Cleaning/Laundry/Inventaris) per alat rental.</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center bg-black hover:bg-brand hover:text-black text-brand font-black text-xs px-5 py-3 rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-black transition-all self-start sm:self-auto uppercase tracking-widest cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2 stroke-[3]" />
          Tambah Item
        </button>
      </div>

      <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-5 space-y-4">
        <p className="text-[10px] text-zinc-500 font-semibold normal-case leading-relaxed">
          Harga per jenis pekerjaan untuk tiap item alat - dipakai pada form Operational karyawan. Kosongkan harga jika jenis pekerjaan tersebut tidak berlaku untuk item itu. Item yang dinonaktifkan tetap tersimpan di sini (bisa diaktifkan kembali kapan saja) tapi tidak lagi muncul sebagai pilihan baru di form Operational.
        </p>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-black absolute left-3 top-3.5 stroke-[2.5]" />
          <input
            type="text"
            placeholder="Cari nama item..."
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 text-xs bg-white border-2 border-black rounded-none focus:bg-brand/10 focus:outline-none w-full font-black tracking-wider"
          />
        </div>

        <div className="border-2 border-black rounded-none overflow-hidden overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-black text-white text-[10px] uppercase tracking-wider font-black">
              <tr>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">Cleaning</th>
                <th className="px-3 py-2.5">Laundry</th>
                <th className="px-3 py-2.5">Inventaris</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredJobPriceList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-zinc-400 font-bold uppercase">
                    {itemSearch ? 'Tidak ada item yang cocok dengan pencarian.' : 'Belum ada item operasional.'}
                  </td>
                </tr>
              ) : (
              filteredJobPriceList.map((item) => {
                const isActive = item.active !== false;
                return (
                  <tr key={item.id} className={`text-xs font-bold ${isActive ? '' : 'opacity-60 bg-zinc-50'}`}>
                    <td className="px-3 py-2.5 text-black">{item.itemName}</td>
                    <td className="px-3 py-2.5 font-mono text-zinc-600">{item.cleaningPrice !== undefined ? `Rp ${item.cleaningPrice.toLocaleString('id-ID')}` : '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-zinc-600">{item.laundryPrice !== undefined ? `Rp ${item.laundryPrice.toLocaleString('id-ID')}` : '-'}</td>
                    <td className="px-3 py-2.5 font-mono text-zinc-600">{item.inventarisPrice !== undefined ? `Rp ${item.inventarisPrice.toLocaleString('id-ID')}` : '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 border font-black uppercase text-[9px] ${isActive ? 'bg-emerald-100 text-emerald-800 border-emerald-600' : 'bg-zinc-200 text-zinc-600 border-zinc-400'}`}>
                        {isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActive(item)}
                          className={isActive ? 'text-zinc-500 hover:text-black cursor-pointer' : 'text-emerald-600 hover:text-emerald-800 cursor-pointer'}
                          title={isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(item)} className="text-black hover:text-brand cursor-pointer" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteJobPrice(item.id)} className="text-red-600 hover:text-red-800 cursor-pointer" title="Hapus Permanen">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showJobPriceModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-black text-white px-5 py-4 flex justify-between items-center border-b-2 border-black shrink-0">
              <h3 className="font-display font-black text-sm uppercase tracking-wider">
                {editingJobPrice ? 'EDIT ITEM OPERASIONAL' : 'TAMBAH ITEM OPERASIONAL'}
              </h3>
              <button
                onClick={() => setShowJobPriceModal(false)}
                className="text-brand hover:text-white font-mono font-black text-xs uppercase cursor-pointer"
              >
                CLOSE
              </button>
            </div>

            <form onSubmit={handleSaveJobPrice} className="p-5 space-y-4 bg-white text-black overflow-y-auto">
              <div>
                <label className="block text-xs font-black text-black uppercase flex items-center">
                  <Tags className="w-3.5 h-3.5 mr-1.5" />
                  Pilih Alat Rental{!editingJobPrice && <span className="text-red-600 ml-1">*</span>}
                </label>
                <p className="text-[10px] text-zinc-500 font-semibold normal-case mt-0.5 mb-1.5">
                  {editingJobPrice
                    ? 'Opsional untuk item lama - biarkan kosong jika item ini tidak berasal dari katalog alat.'
                    : 'Pilih satu atau lebih alat yang menjadi dasar item harga ini. Nama item akan terisi otomatis (bisa diedit manual di bawah).'}
                </p>
                <div className="border-2 border-black rounded-none max-h-48 overflow-y-auto p-2 space-y-2 bg-zinc-50">
                  {productsByCategory.map(([category, prods]) => (
                    <div key={category}>
                      <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wider mb-1">{category}</p>
                      <div className="space-y-1">
                        {prods.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={jobPriceFormData.productIds.includes(p.id)}
                              onChange={() => onToggleProduct(p.id)}
                              className="cursor-pointer"
                            />
                            <span>{p.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-black uppercase">Nama Item</label>
                <input
                  type="text"
                  required
                  value={jobPriceFormData.itemName}
                  onChange={(e) => {
                    setItemNameManuallyEdited(true);
                    setJobPriceFormData({ ...jobPriceFormData, itemName: e.target.value });
                  }}
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black tracking-wider focus:bg-brand/10 focus:outline-none"
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
                disabled={!editingJobPrice && jobPriceFormData.productIds.length === 0}
                className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] uppercase tracking-widest transition-all mt-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
