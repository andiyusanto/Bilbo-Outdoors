import { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { Product } from '../../types';
import bilboIcon from '../../assets/bilbo-icon.png';
import ImagePreviewModal from './ImagePreviewModal';

interface StockInfo {
  remaining: number;
  allocated: number;
}

interface EquipmentGridProps {
  loadingProducts: boolean;
  filteredProducts: Product[];
  cart: Record<string, number>;
  stockDetails: Record<string, StockInfo>;
  startDate: string;
  endDate: string;
  onUpdateCart: (productId: string, quantity: number) => void;
}

export default function EquipmentGrid({
  loadingProducts,
  filteredProducts,
  cart,
  stockDetails,
  startDate,
  endDate,
  onUpdateCart,
}: EquipmentGridProps) {
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);

  if (loadingProducts) {
    return (
      <div className="py-20 text-center text-xs font-bold uppercase tracking-wider text-zinc-400 italic">
        Memuat katalog alat camping Bilbo Outdoors...
      </div>
    );
  }

  if (filteredProducts.length === 0) {
    return (
      <div className="py-20 text-center text-xs font-bold uppercase tracking-wider text-zinc-400 bg-white border-2 border-black rounded-none">
        Tidak ada produk di kategori ini.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {filteredProducts.map((prod) => {
        const selectedQty = cart[prod.id] || 0;
        const availableInfo = stockDetails[prod.id];
        const hasDates = startDate && endDate;
        const isOutOfStock = hasDates && availableInfo && availableInfo.remaining <= 0;

        return (
          <div
            key={prod.id}
            className={`bg-white border-2 rounded-none transition-all flex flex-col justify-between shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_rgba(0,0,0,1)] ${
              selectedQty > 0 ? 'border-black ring-2 ring-brand' : 'border-black'
            }`}
          >
            {/* Photo strip - full bleed, shows real product photo if set, else a muted brand mark */}
            <div className="w-full h-36 border-b-2 border-black overflow-hidden shrink-0">
              {prod.image ? (
                <button
                  type="button"
                  onClick={() => setPreviewImage({ url: prod.image!, alt: prod.name })}
                  className="group relative w-full h-full cursor-pointer"
                  aria-label={`Lihat foto ${prod.name}`}
                >
                  <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity stroke-[2.5]" />
                  </div>
                </button>
              ) : (
                <div className="w-full h-full bg-brand/5 flex items-center justify-center">
                  <img src={bilboIcon} alt="" className="w-14 h-14 opacity-25" />
                </div>
              )}
            </div>

            <div className="p-5 flex flex-col justify-between space-y-4 flex-1">
              <div>
                {/* Header info */}
                <div className="flex justify-between items-start gap-2 border-b border-black pb-2">
                  <span className="text-[9px] font-mono font-black bg-black text-white px-2 py-0.5 rounded-none uppercase">
                    {prod.category}
                  </span>

                  {/* Stock status indicator */}
                  {hasDates && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-none uppercase border ${
                      isOutOfStock
                        ? 'bg-red-100 text-red-800 border-red-800'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-800'
                    }`}>
                      {isOutOfStock ? 'STOK HABIS' : `Tersisa: ${availableInfo?.remaining ?? prod.stock} unit`}
                    </span>
                  )}
                </div>

                <h4 className="font-display font-black text-base text-black mt-3 uppercase tracking-tight">{prod.name}</h4>
                {prod.description && (
                  <p className="text-[11px] text-zinc-600 mt-1 line-clamp-3 uppercase font-semibold leading-relaxed">{prod.description}</p>
                )}
              </div>

              {/* Pricing and cart controller */}
              <div className="border-t border-black pt-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Sewa / Hari</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="bg-brand px-2 py-0.5 text-xs font-black border border-black shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                      {Math.round(prod.price/1000)}K / HARI
                    </span>
                  </div>
                  {prod.incrementalPriceAfter5Days > 0 && (
                    <p className="text-[9px] text-emerald-600 font-black mt-1 uppercase">
                      {`>${prod.discountMinDays} HARI: -${(prod.incrementalPriceAfter5Days/1000)}K/HARI`}
                    </p>
                  )}
                </div>

                {/* Cart count updater buttons */}
                <div className="flex items-center space-x-1">
                  {selectedQty > 0 ? (
                    <div className="flex items-center space-x-1 border-2 border-black bg-zinc-50 p-1 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                      <button
                        onClick={() => onUpdateCart(prod.id, selectedQty - 1)}
                        className="w-7 h-7 bg-white hover:bg-zinc-100 rounded-none border border-black text-xs font-black transition-all text-black cursor-pointer"
                      >
                        -
                      </button>
                      <span className="text-xs font-black text-black font-mono w-6 text-center">
                        {selectedQty}
                      </span>
                      <button
                        onClick={() => onUpdateCart(prod.id, selectedQty + 1)}
                        disabled={isOutOfStock || selectedQty >= (availableInfo?.remaining ?? prod.stock)}
                        className="w-7 h-7 bg-white hover:bg-zinc-100 rounded-none border border-black text-xs font-black transition-all text-black disabled:opacity-45 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onUpdateCart(prod.id, 1)}
                      disabled={isOutOfStock}
                      className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-none border-2 transition-all cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] ${
                        isOutOfStock
                          ? 'bg-zinc-100 text-zinc-400 border-zinc-300 cursor-not-allowed shadow-none'
                          : 'bg-brand hover:bg-black hover:text-white border-black text-black font-black'
                      }`}
                    >
                      {isOutOfStock ? 'Stok Kosong' : 'Pilih Alat'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage.url}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
