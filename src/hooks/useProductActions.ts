import { useState, Dispatch, SetStateAction, FormEvent } from 'react';
import { Product } from '../types';
import { jsonAuthHeaders, authHeaders, parseJsonOrThrow } from '../lib/api';

interface UseProductActionsParams {
  token: string;
  fetchAdminData: () => Promise<void>;
  setProducts: Dispatch<SetStateAction<Product[]>>;
}

const DEFAULT_PRODUCT_FORM = {
  name: '',
  category: 'TENT & SHELTER',
  price: 0,
  incrementalPriceAfter5Days: 0,
  stock: 5,
  description: '',
  image: '',
};

export function useProductActions({ token, fetchAdminData, setProducts }: UseProductActionsParams) {
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormData, setProductFormData] = useState(DEFAULT_PRODUCT_FORM);

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const method = editingProduct ? 'PUT' : 'POST';
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';

      const res = await fetch(url, {
        method,
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(productFormData)
      });

      await parseJsonOrThrow(res);

      alert(editingProduct ? 'Alat camping berhasil diperbarui!' : 'Alat camping baru berhasil ditambahkan!');
      setShowProductModal(false);
      setEditingProduct(null);
      setProductFormData(DEFAULT_PRODUCT_FORM);
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal menyimpan produk: ${err.message}`);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus alat camping ini?')) return;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token)
      });
      await parseJsonOrThrow(res);
      alert('Alat camping berhasil dihapus!');
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal menghapus produk: ${err.message}`);
    }
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    const newStock = Math.max(0, product.stock + delta);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ stock: newStock })
      });
      const updated = await parseJsonOrThrow(res);
      setProducts(prev => prev.map(p => p.id === product.id ? updated : p));
    } catch (err: any) {
      alert(`Gagal mengubah stok: ${err.message}`);
    }
  };

  const openAddProductModal = () => {
    setEditingProduct(null);
    setProductFormData(DEFAULT_PRODUCT_FORM);
    setShowProductModal(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    setProductFormData({
      name: product.name,
      category: product.category,
      price: product.price,
      incrementalPriceAfter5Days: product.incrementalPriceAfter5Days,
      stock: product.stock,
      description: product.description || '',
      image: product.image || ''
    });
    setShowProductModal(true);
  };

  return {
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
  };
}
