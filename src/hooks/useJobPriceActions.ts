import { useState, FormEvent } from 'react';
import { JobPriceListItem } from '../types';
import { jsonAuthHeaders, authHeaders, parseJsonOrThrow } from '../lib/api';

interface UseJobPriceActionsParams {
  token: string;
  fetchAdminData: () => Promise<void>;
}

const DEFAULT_JOB_PRICE_FORM = {
  itemName: '',
  cleaningPrice: '' as number | '',
  laundryPrice: '' as number | '',
  inventarisPrice: '' as number | '',
};

export function useJobPriceActions({ token, fetchAdminData }: UseJobPriceActionsParams) {
  const [showJobPriceModal, setShowJobPriceModal] = useState<boolean>(false);
  const [editingJobPrice, setEditingJobPrice] = useState<JobPriceListItem | null>(null);
  const [jobPriceFormData, setJobPriceFormData] = useState(DEFAULT_JOB_PRICE_FORM);

  const handleSaveJobPrice = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const method = editingJobPrice ? 'PUT' : 'POST';
      const url = editingJobPrice ? `/api/job-prices/${editingJobPrice.id}` : '/api/job-prices';
      const res = await fetch(url, {
        method,
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(jobPriceFormData)
      });
      await parseJsonOrThrow(res);
      setShowJobPriceModal(false);
      setEditingJobPrice(null);
      setJobPriceFormData(DEFAULT_JOB_PRICE_FORM);
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal menyimpan harga pekerjaan: ${err.message}`);
    }
  };

  const handleDeleteJobPrice = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus item ini dari daftar harga?')) return;
    try {
      const res = await fetch(`/api/job-prices/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token)
      });
      await parseJsonOrThrow(res);
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal menghapus item: ${err.message}`);
    }
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
    openAddJobPriceModal,
    openEditJobPriceModal,
  };
}
