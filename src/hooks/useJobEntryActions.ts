import { useState, FormEvent } from 'react';
import { JobEntry, JobType } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';
import { getTodayDateString } from '../lib/date';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

interface UseJobEntryActionsParams {
  token: string;
  fetchAdminData: () => Promise<void>;
}

const DEFAULT_ENTRY_FORM = {
  entryDate: getTodayDateString(),
  itemName: '',
  jobType: '' as JobType | '',
  quantity: 1,
};

export function useJobEntryActions({ token, fetchAdminData }: UseJobEntryActionsParams) {
  const [showEntryModal, setShowEntryModal] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<JobEntry | null>(null);
  const [entryFormData, setEntryFormData] = useState(DEFAULT_ENTRY_FORM);
  const { withLoading } = useLoading();
  const { notifySuccess, notifyError } = useNotification();

  const handleSaveEntry = async (e: FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      try {
        const method = editingEntry ? 'PUT' : 'POST';
        const url = editingEntry ? `/api/job-entries/${editingEntry.id}` : '/api/job-entries';
        const res = await fetch(url, {
          method,
          headers: jsonAuthHeaders(token),
          body: JSON.stringify(entryFormData)
        });
        await parseJsonOrThrow(res);
        notifySuccess(editingEntry ? 'Pekerjaan berhasil diperbarui!' : 'Pekerjaan berhasil dicatat!');
        setShowEntryModal(false);
        setEditingEntry(null);
        setEntryFormData(DEFAULT_ENTRY_FORM);
        fetchAdminData();
      } catch (err: any) {
        notifyError(`Gagal menyimpan pekerjaan: ${err.message}`);
      }
    });
  };

  const openAddEntryModal = () => {
    setEditingEntry(null);
    setEntryFormData(DEFAULT_ENTRY_FORM);
    setShowEntryModal(true);
  };

  const openEditEntryModal = (entry: JobEntry) => {
    setEditingEntry(entry);
    setEntryFormData({
      entryDate: entry.entryDate,
      itemName: entry.itemName,
      jobType: entry.jobType,
      quantity: entry.quantity,
    });
    setShowEntryModal(true);
  };

  return {
    showEntryModal,
    setShowEntryModal,
    editingEntry,
    entryFormData,
    setEntryFormData,
    handleSaveEntry,
    openAddEntryModal,
    openEditEntryModal,
  };
}
