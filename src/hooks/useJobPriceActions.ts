import { useState, Dispatch, SetStateAction, FormEvent } from 'react';
import { JobPriceListItem } from '../types';
import { jsonAuthHeaders, authHeaders, parseJsonOrThrow } from '../lib/api';
import { upsertById } from '../lib/collections';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

interface UseJobPriceActionsParams {
  token: string;
  setJobPriceList: Dispatch<SetStateAction<JobPriceListItem[]>>;
}

const DEFAULT_JOB_PRICE_FORM = {
  itemName: '',
  cleaningPrice: '' as number | '',
  laundryPrice: '' as number | '',
  inventarisPrice: '' as number | '',
  productIds: [] as string[],
};

export function useJobPriceActions({ token, setJobPriceList }: UseJobPriceActionsParams) {
  const [showJobPriceModal, setShowJobPriceModal] = useState<boolean>(false);
  const [editingJobPrice, setEditingJobPrice] = useState<JobPriceListItem | null>(null);
  const [jobPriceFormData, setJobPriceFormData] = useState(DEFAULT_JOB_PRICE_FORM);
  const { withLoading } = useLoading();
  const { notifyError, confirmAction } = useNotification();

  const handleSaveJobPrice = async (e: FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      try {
        const method = editingJobPrice ? 'PUT' : 'POST';
        const url = editingJobPrice ? `/api/job-prices/${editingJobPrice.id}` : '/api/job-prices';
        const res = await fetch(url, {
          method,
          headers: jsonAuthHeaders(token),
          body: JSON.stringify(jobPriceFormData)
        });
        const savedItem = await parseJsonOrThrow(res);
        setJobPriceList(prev => upsertById(prev, savedItem)); // POST appends server-side (db.jobPriceList.push)
        setShowJobPriceModal(false);
        setEditingJobPrice(null);
        setJobPriceFormData(DEFAULT_JOB_PRICE_FORM);
      } catch (err: any) {
        notifyError(`Gagal menyimpan harga pekerjaan: ${err.message}`);
      }
    });
  };

  const handleDeleteJobPrice = async (id: string) => {
    if (!(await confirmAction('Apakah Anda yakin ingin menghapus PERMANEN item ini dari daftar harga? Tindakan ini tidak bisa dibatalkan - gunakan "Nonaktifkan" jika hanya ingin menyembunyikannya sementara.'))) return;
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/job-prices/${id}`, {
          method: 'DELETE',
          headers: authHeaders(token)
        });
        await parseJsonOrThrow(res);
        setJobPriceList(prev => prev.filter(j => j.id !== id));
      } catch (err: any) {
        notifyError(`Gagal menghapus item: ${err.message}`);
      }
    });
  };

  const handleToggleActive = async (item: JobPriceListItem) => {
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/job-prices/${item.id}`, {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ active: item.active === false ? true : false })
        });
        const updatedItem = await parseJsonOrThrow(res);
        setJobPriceList(prev => prev.map(j => j.id === updatedItem.id ? updatedItem : j));
      } catch (err: any) {
        notifyError(`Gagal mengubah status item: ${err.message}`);
      }
    });
  };

  const toggleProductId = (productId: string) => {
    setJobPriceFormData((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(productId)
        ? prev.productIds.filter((id) => id !== productId)
        : [...prev.productIds, productId],
    }));
  };

  const openAddJobPriceModal = () => {
    setEditingJobPrice(null);
    setJobPriceFormData(DEFAULT_JOB_PRICE_FORM);
    setShowJobPriceModal(true);
  };

  const openEditJobPriceModal = (item: JobPriceListItem) => {
    setEditingJobPrice(item);
    setJobPriceFormData({
      itemName: item.itemName,
      cleaningPrice: item.cleaningPrice ?? '',
      laundryPrice: item.laundryPrice ?? '',
      inventarisPrice: item.inventarisPrice ?? '',
      productIds: item.productIds ?? [],
    });
    setShowJobPriceModal(true);
  };

  return {
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
  };
}
