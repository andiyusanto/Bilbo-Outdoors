import { Plus, Edit3, Trash2 } from 'lucide-react';
import { Product } from '../../types';
import { useProductActions } from '../../hooks/useProductActions';
import ProductFormModal from './ProductFormModal';

interface InventoryTabProps {
  products: Product[];
  productActions: ReturnType<typeof useProductActions>;
}

export default function InventoryTab({ products, productActions }: InventoryTabProps) {
  const {
    showProductModal,
    setShowProductModal,
    editingProduct,
    productFormData,
    setProductFormData,
    handleSaveProduct,
    handleDeleteProduct,
    handleAdjustStock,
    openAddProductModal,
    openEditProductModal,
  } = productActions;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">KELOLA ALAT CAMPING</h2>
          <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Sesuaikan persediaan fisik, harga sewa, dan jenis peralatan outdoor.</p>
        </div>

        <button
          onClick={openAddProductModal}
          className="bg-black hover:bg-brand hover:text-black text-brand font-black text-xs px-5 py-3 rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-black transition-all flex items-center self-start sm:self-auto uppercase tracking-widest cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2 stroke-[3]" />
          Tambah Alat Camping
        </button>
      </div>

      {/* Grid of Products */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.length === 0 ? (
          <div className="col-span-full py-16 text-center text-xs text-zinc-400 font-bold uppercase border-2 border-black bg-zinc-50">
            Stok alat camping kosong.
          </div>
        ) : (
          products.map((prod) => (
            <div key={prod.id} className="bg-white border-2 border-black p-5 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] space-y-4 flex flex-col justify-between">
              <div>
                {/* Title and category */}
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-mono font-black bg-brand/20 text-black px-2 py-0.5 border border-black uppercase">
                    {prod.category}
                  </span>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => openEditProductModal(prod)}
                      title="Edit"
                      className="p-1.5 hover:bg-brand/20 border border-transparent hover:border-black rounded-none text-zinc-500 hover:text-black transition-all cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(prod.id)}
                      title="Hapus"
                      className="p-1.5 hover:bg-red-500 hover:text-white border border-transparent hover:border-black rounded-none text-zinc-500 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>

                <h3 className="font-display font-black text-sm text-black uppercase mt-3">{prod.name}</h3>
                {prod.description && (
                  <p className="text-[11px] text-zinc-600 font-bold uppercase mt-1.5 line-clamp-2">{prod.description}</p>
                )}
              </div>

              {/* Financial info & stock controls */}
              <div className="border-t-2 border-black pt-3.5 space-y-3">
                <div className="flex justify-between text-xs font-bold text-zinc-500 uppercase">
                  <span>Sewa Pokok:</span>
                  <strong className="text-black font-mono font-black">Rp {prod.price.toLocaleString('id-ID')}/hari</strong>
                </div>

                {prod.incrementalPriceAfter5Days > 0 ? (
                  <div className="flex justify-between text-xs font-bold text-emerald-600 uppercase">
                    <span>Sewa {'>'}{prod.discountMinDays} hari (diskon):</span>
                    <strong className="font-mono font-black">Rp {(prod.price - prod.incrementalPriceAfter5Days).toLocaleString('id-ID')}/hari</strong>
                  </div>
                ) : null}

                {/* Physical Stock Controls */}
                <div className="flex justify-between items-center bg-zinc-50 px-3 py-2 border-2 border-black rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <span className="text-xs font-black text-black uppercase tracking-wider">Stok Inventaris:</span>
                  <div className="flex items-center space-x-2.5">
                    <button
                      onClick={() => handleAdjustStock(prod, -1)}
                      className="w-7 h-7 border-2 border-black bg-white hover:bg-brand font-black text-xs flex items-center justify-center transition-all cursor-pointer rounded-none"
                    >
                      -
                    </button>
                    <span className="text-xs font-mono font-black text-black w-6 text-center">{prod.stock}</span>
                    <button
                      onClick={() => handleAdjustStock(prod, 1)}
                      className="w-7 h-7 border-2 border-black bg-white hover:bg-brand font-black text-xs flex items-center justify-center transition-all cursor-pointer rounded-none"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {showProductModal && (
        <ProductFormModal
          editingProduct={editingProduct}
          productFormData={productFormData}
          setProductFormData={setProductFormData}
          onSubmit={handleSaveProduct}
          onClose={() => setShowProductModal(false)}
        />
      )}
    </div>
  );
}
