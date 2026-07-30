import { useState } from 'react';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';

interface UseApprovalActionsParams {
  token: string;
  fetchAdminData: () => Promise<void>;
}

export function useApprovalActions({ token, fetchAdminData }: UseApprovalActionsParams) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paymentDateInput, setPaymentDateInput] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const clearSelection = () => setSelectedIds([]);

  const handleApproveBatch = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch('/api/job-entries/approve-batch', {
        method: 'PUT',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ ids: selectedIds, paymentDate: paymentDateInput })
      });
      const data = await parseJsonOrThrow(res);
      alert(`${data.updatedCount} pekerjaan berhasil disetujui & dibayar!`);
      clearSelection();
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal memproses pembayaran: ${err.message}`);
    }
  };

  return {
    selectedIds,
    toggleSelected,
    clearSelection,
    paymentDateInput,
    setPaymentDateInput,
    handleApproveBatch,
  };
}
