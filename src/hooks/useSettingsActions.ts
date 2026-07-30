import { useState, Dispatch, SetStateAction } from 'react';
import { StoreSettings } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

interface UseSettingsActionsParams {
  token: string;
  setSettings: Dispatch<SetStateAction<StoreSettings>>;
}

export function useSettingsActions({ token, setSettings }: UseSettingsActionsParams) {
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const { withLoading } = useLoading();
  const { notifySuccess, notifyError } = useNotification();

  const handleUpdateSettings = async (newSettings: StoreSettings) => {
    await withLoading(async () => {
      setIsSaving(true);
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify(newSettings)
        });
        const updated = await parseJsonOrThrow(res);
        setSettings(updated);
        notifySuccess('Pengaturan berhasil disimpan!');
      } catch (err: any) {
        notifyError(`Gagal menyimpan pengaturan: ${err.message}`);
      } finally {
        setIsSaving(false);
      }
    });
  };

  return {
    isSaving,
    handleUpdateSettings,
  };
}
