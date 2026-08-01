import { useState, Dispatch, SetStateAction, FormEvent } from 'react';
import { Product } from '../types';
import { jsonAuthHeaders, authHeaders, parseJsonOrThrow } from '../lib/api';
import { resizeImageToDataUrl } from '../lib/imageResize';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

interface UseProductActionsParams {
  token: string;
  fetchAdminData: () => Promise<void>;
  setProducts: Dispatch<SetStateAction<Product[]>>;
}

const DEFAULT_PRODUCT_FORM = {
  name: '',
  category: 'TENT & SHELTER',
  rates: { day1Price: 0, day2Price: 0, day3Price: 0, day4Price: 0, day5Price: 0, extraDayRate: 0 },
  readinessHours: 0,
  stock: 5,
  description: '',
  image: '',
  varian: '',
  size: '',
  color: '',
};

export function useProductActions({ token, fetchAdminData, setProducts }: UseProductActionsParams) {
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormData, setProductFormData] = useState(DEFAULT_PRODUCT_FORM);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const { withLoading } = useLoading();
  const { notifySuccess, notifyError, confirmAction } = useNotification();

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      try {
        const method = editingProduct ? 'PUT' : 'POST';
        const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';

        const res = await fetch(url, {
          method,
          headers: jsonAuthHeaders(token),
          body: JSON.stringify(productFormData)
        });

        await parseJsonOrThrow(res);

        notifySuccess(editingProduct ? 'Alat camping berhasil diperbarui!' : 'Alat camping baru berhasil ditambahkan!');
        setShowProductModal(false);
        setEditingProduct(null);
        setProductFormData(DEFAULT_PRODUCT_FORM);
        fetchAdminData();
      } catch (err: any) {
        notifyError(`Gagal menyimpan produk: ${err.message}`);
      }
    });
  };

  const handleUploadProductImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ image: dataUrl })
      });
      const { url } = await parseJsonOrThrow(res);
      setProductFormData(prev => ({ ...prev, image: url }));
    } catch (err: any) {
      notifyError(`Gagal mengunggah gambar: ${err.message}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!(await confirmAction('Apakah Anda yakin ingin menghapus barang sewa ini?'))) return;
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/products/${id}`, {
          method: 'DELETE',
          headers: authHeaders(token)
        });
        await parseJsonOrThrow(res);
        notifySuccess('Alat camping berhasil dihapus!');
        fetchAdminData();
      } catch (err: any) {
        notifyError(`Gagal menghapus produk: ${err.message}`);
      }
    });
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    const newStock = Math.max(0, product.stock + delta);
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/products/${product.id}`, {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ stock: newStock })
        });
        const updated = await parseJsonOrThrow(res);
        setProducts(prev => prev.map(p => p.id === product.id ? updated : p));
      } catch (err: any) {
        notifyError(`Gagal mengubah stok: ${err.message}`);
      }
    });
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
      rates: { ...product.rates },
      readinessHours: product.readinessHours,
      stock: product.stock,
      description: product.description || '',
      image: product.image || '',
      varian: product.varian || '',
      size: product.size || '',
      color: product.color || ''
    });
    setShowProductModal(true);
  };

  return {
    showProductModal,
    setShowProductModal,
    editingProduct,
    productFormData,
    setProductFormData,
    uploadingImage,
    handleUploadProductImage,
    handleSaveProduct,
    handleDeleteProduct,
    handleAdjustStock,
    openAddProductModal,
    openEditProductModal,
  };
}
