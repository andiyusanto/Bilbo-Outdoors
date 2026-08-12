import { useState } from 'react';
import { JobEntry } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';
import { getTodayDateString } from '../lib/date';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

interface UseApprovalActionsParams {
  token: string;
  fetchAdminData: () => Promise<void>;
}

export function useApprovalActions({ token, fetchAdminData }: UseApprovalActionsParams) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paymentDateInput, setPaymentDateInput] = useState<string>(
    getTodayDateString()
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  // Selects/deselects every id in the given (currently-visible/filtered) list
  // in one go - toggles to "select all" unless they're all already selected,
  // in which case it deselects just that set.
  const toggleSelectAll = (ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.includes(id));
      return allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
    });
  };

  const clearSelection = () => setSelectedIds([]);
  const { withLoading } = useLoading();
  const { notifySuccess, notifyError } = useNotification();

  const [rejectingEntry, setRejectingEntry] = useState<JobEntry | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const openRejectModal = (entry: JobEntry) => {
    setRejectingEntry(entry);
    setRejectReason('');
  };

  const closeRejectModal = () => {
    setRejectingEntry(null);
    setRejectReason('');
  };

  const handleApproveBatch = async () => {
    if (selectedIds.length === 0) return;
    await withLoading(async () => {
      try {
        const res = await fetch('/api/job-entries/approve-batch', {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ ids: selectedIds, paymentDate: paymentDateInput })
        });
        const data = await parseJsonOrThrow(res);
        notifySuccess(`${data.updatedCount} pekerjaan berhasil disetujui & dibayar!`);
        clearSelection();
        fetchAdminData();
      } catch (err: any) {
        notifyError(`Gagal memproses pembayaran: ${err.message}`);
      }
    });
  };

  const handleReject = async () => {
    if (!rejectingEntry || !rejectReason.trim()) return;
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/job-entries/${rejectingEntry.id}/reject`, {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ reason: rejectReason.trim() })
        });
        await parseJsonOrThrow(res);
        notifySuccess('Pekerjaan ditolak.');
        closeRejectModal();
        fetchAdminData();
      } catch (err: any) {
        notifyError(`Gagal menolak pekerjaan: ${err.message}`);
      }
    });
  };

  return {
    selectedIds,
    toggleSelected,
    toggleSelectAll,
    clearSelection,
    paymentDateInput,
    setPaymentDateInput,
    handleApproveBatch,
    rejectingEntry,
    rejectReason,
    setRejectReason,
    openRejectModal,
    closeRejectModal,
    handleReject,
  };
}
