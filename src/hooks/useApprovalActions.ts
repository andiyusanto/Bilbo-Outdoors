import { useState, Dispatch, SetStateAction } from 'react';
import { JobEntry } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';
import { getTodayDateString } from '../lib/date';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

interface UseApprovalActionsParams {
  token: string;
  setJobEntries: Dispatch<SetStateAction<JobEntry[]>>;
}

export function useApprovalActions({ token, setJobEntries }: UseApprovalActionsParams) {
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
        // Patch exactly the ids the server actually flipped to Paid
        // (data.updatedIds), not selectedIds re-filtered against local
        // status - the local cache can be stale relative to a concurrent
        // change from another session (e.g. someone else rejected one of
        // these entries a moment earlier), so trusting the server's
        // authoritative result avoids the UI showing a status that was
        // never actually applied.
        const updatedIdSet = new Set<string>(data.updatedIds);
        setJobEntries(prev => prev.map(e =>
          updatedIdSet.has(e.id)
            ? { ...e, status: 'Paid' as const, paymentDate: paymentDateInput }
            : e
        ));
        notifySuccess(`${data.updatedCount} pekerjaan berhasil disetujui & dibayar!`);
        clearSelection();
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
        const updatedEntry = await parseJsonOrThrow(res);
        setJobEntries(prev => prev.map(e => e.id === updatedEntry.id ? updatedEntry : e));
        notifySuccess('Pekerjaan ditolak.');
        closeRejectModal();
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
