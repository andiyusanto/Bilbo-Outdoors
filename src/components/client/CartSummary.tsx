import { ShoppingBag } from 'lucide-react';
import { Product } from '../../types';

interface CartSummaryProps {
  cart: Record<string, number>;
  products: Product[];
  rentDuration: number;
  calculateItemCost: (product: Product, quantity: number) => number;
  getCartTotal: () => number;
}

export default function CartSummary({
  cart,
  products,
  rentDuration,
  calculateItemCost,
  getCartTotal,
}: CartSummaryProps) {
  return (
    <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-6 space-y-5">
      <h3 className="font-display font-black text-black text-lg flex items-center uppercase tracking-tight border-b-4 border-brand pb-2">
        <ShoppingBag className="w-5 h-5 mr-2 text-black stroke-[3]" />
        CURRENT SELECTION
      </h3>

      {Object.keys(cart).length === 0 ? (
        <div className="py-10 text-center text-xs text-zinc-400 font-bold uppercase tracking-wider">
          Belum ada alat camping dipilih. Pilih di katalog sebelah kiri.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cart item rows */}
          <div className="divide-y divide-black/10 border-b border-black pb-4 max-h-60 overflow-y-auto pr-1">
            {Object.entries(cart).map(([pId, qty]) => {
              const prod = products.find(p => p.id === pId);
              if (!prod) return null;
              const cost = calculateItemCost(prod, qty as number);
              return (
                <div key={pId} className="py-3 flex justify-between items-start text-xs text-zinc-800 uppercase font-semibold">
                  <div>
                    <span className="font-black text-black">{prod.name}</span>
                    <span className="text-zinc-400 mx-1.5">x</span>
                    <span className="font-black text-black font-mono bg-brand/20 border border-black px-1.5 py-0.5">{qty} Unit</span>
                    <p className="text-[10px] text-zinc-500 mt-1 font-mono font-bold">
                      {rentDuration} Hari sewa
                    </p>
                  </div>
                  <span className="font-black text-black font-mono">
                    Rp {cost.toLocaleString('id-ID')}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Total price box */}
          <div className="flex justify-between items-baseline font-display text-black">
            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Total Biaya Sewa:</span>
            <span className="text-2xl font-black text-black bg-brand border-2 border-black px-3 py-1 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              Rp {getCartTotal().toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
