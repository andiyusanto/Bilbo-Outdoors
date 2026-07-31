import { useState, ChangeEvent } from 'react';
import { resizeImageToDataUrl } from '../lib/imageResize';
import { useNotification } from '../contexts/NotificationContext';

export function usePersonalPhotoUpload() {
  const [personalPhotoFile, setPersonalPhotoFile] = useState<File | null>(null);
  const [personalPhotoBase64, setPersonalPhotoBase64] = useState<string>('');
  const { notifyError } = useNotification();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPersonalPhotoFile(file);
      setPersonalPhotoBase64(dataUrl);
    } catch (err: any) {
      // Deliberately not falling back to storing the raw/undecoded file -
      // that used to silently save an unusable blob (e.g. a HEIC photo staff
      // could never actually view in OrderDetailPanel) while checkout still
      // looked successful. Blocking here with a clear reason is better for a
      // photo whose entire purpose is being checked by staff later.
      notifyError(err.message || 'Gagal memproses foto. Coba foto lain.');
    }
  };

  return { personalPhotoFile, personalPhotoBase64, handleFileChange };
}
