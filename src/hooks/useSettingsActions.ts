import { useState, Dispatch, SetStateAction } from 'react';
import { StoreSettings } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';

interface UseSettingsActionsParams {
  token: string;
  setSettings: Dispatch<SetStateAction<StoreSettings>>;
}

export function useSettingsActions({ token, setSettings }: UseSettingsActionsParams) {
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleUpdateSettings = async (newSettings: StoreSettings) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(newSettings)
      });
      const updated = await parseJsonOrThrow(res);
      setSettings(updated);
      alert('Pengaturan berhasil disimpan!');
    } catch (err: any) {
      alert(`Gagal menyimpan pengaturan: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    handleUpdateSettings,
  };
}
