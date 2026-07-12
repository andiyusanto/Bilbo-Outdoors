import { useState, ChangeEvent } from 'react';

export function useIdCardUpload() {
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [idCardBase64, setIdCardBase64] = useState<string>('');

  // Convert uploaded image file (ID/SIM card) to base64 for backend upload
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIdCardFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdCardBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return { idCardFile, idCardBase64, handleFileChange };
}
