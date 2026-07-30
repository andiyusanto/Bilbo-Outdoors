import { FormEvent } from 'react';
import { Product, DayRateTable } from '../../types';

interface ProductFormData {
  name: string;
  category: string;
  rates: DayRateTable;
  readinessHours: number;
  stock: number;
  description: string;
  image: string;
}

interface ProductFormModalProps {
  editingProduct: Product | null;
  productFormData: ProductFormData;
  setProductFormData: (data: ProductFormData) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}

export default function ProductFormModal({
  editingProduct,
  productFormData,
  setProductFormData,
  onSubmit,
  onClose,
}: ProductFormModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden">
        <div className="bg-black text-white px-5 py-4 flex justify-between items-center border-b-2 border-black">
          <h3 className="font-display font-black text-sm uppercase tracking-wider">
            {editingProduct ? 'EDIT ALAT CAMPING' : 'TAMBAH ALAT CAMPING BARU'}
          </h3>
          <button
            onClick={onClose}
            className="text-brand hover:text-white font-mono font-black text-xs uppercase"
          >
            CLOSE
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4 bg-white text-black">
          <div>
            <label className="block text-xs font-black text-black uppercase">Nama Alat</label>
            <input
              type="text"
              required
              value={productFormData.name}
              onChange={(e) => setProductFormData({...productFormData, name: e.target.value})}
              placeholder="Contoh: Compass UL 2P"
              className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black tracking-wider focus:bg-brand/10 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-black uppercase">Kategori</label>
            <select
              value={productFormData.category}
              onChange={(e) => setProductFormData({...productFormData, category: e.target.value})}
              className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none cursor-pointer"
            >
              <option value="TENT & SHELTER">TENT & SHELTER</option>
              <option value="SLEEPING SYSTEM">SLEEPING SYSTEM</option>
              <option value="CARRIER & BACKPACK">CARRIER & BACKPACK</option>
              <option value="COOKING GEAR">COOKING GEAR</option>
              <option value="LIGHTING & POWER">LIGHTING & POWER</option>
              <option value="HIKING ESSENTIALS">HIKING ESSENTIALS</option>
              <option value="CAMP SUPPORT">CAMP SUPPORT</option>
              <option value="APPAREL & PERSONAL GEAR">APPAREL & PERSONAL GEAR</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-black uppercase">Tabel Harga Sewa (Rp)</label>
            <div className="grid grid-cols-3 gap-3 mt-1">
              {([
                ['day1Price', 'Harian'],
                ['day2Price', '2 Hari'],
                ['day3Price', '3 Hari'],
                ['day4Price', '4 Hari'],
                ['day5Price', '5 Hari'],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <label className="block text-[9px] font-bold text-zinc-500 uppercase">{label}</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={productFormData.rates[field]}
                    onChange={(e) => setProductFormData({...productFormData, rates: {...productFormData.rates, [field]: Number(e.target.value)}})}
                    className="mt-0.5 block w-full rounded-none border-2 border-black px-2 py-2 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[9px] font-bold text-zinc-500 uppercase">5 Hari+ (/hari)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={productFormData.rates.extraDayRate}
                  onChange={(e) => setProductFormData({...productFormData, rates: {...productFormData.rates, extraDayRate: Number(e.target.value)}})}
                  className="mt-0.5 block w-full rounded-none border-2 border-black px-2 py-2 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-black uppercase">Waktu Kesiapan Setelah Kembali (Jam)</label>
              <input
                type="number"
                required
                min="0"
                value={productFormData.readinessHours}
                onChange={(e) => setProductFormData({...productFormData, readinessHours: Number(e.target.value)})}
                className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-black uppercase">Stok Awal</label>
              <input
                type="number"
                required
                min="1"
                value={productFormData.stock}
                onChange={(e) => setProductFormData({...productFormData, stock: Number(e.target.value)})}
                className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-black uppercase">Gambar (Opsional URL)</label>
            <input
              type="text"
              value={productFormData.image}
              onChange={(e) => setProductFormData({...productFormData, image: e.target.value})}
              placeholder="https://..."
              className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black focus:bg-brand/10 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-black uppercase">Deskripsi</label>
            <textarea
              rows={2}
              value={productFormData.description}
              onChange={(e) => setProductFormData({...productFormData, description: e.target.value})}
              placeholder="SPESIFIKASI BERAT, KAPASITAS, DLL."
              className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none"
            ></textarea>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] uppercase tracking-widest transition-all mt-4 cursor-pointer"
          >
            Simpan Alat Camping
          </button>
        </form>
      </div>
    </div>
  );
}
