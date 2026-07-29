import { useState, ChangeEvent } from 'react';

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

// Downscales large photos (a half/full-body phone photo is typically much larger
// than a tightly-cropped ID card scan) so the base64 payload stays comfortably
// under the server's 10MB JSON body limit, without the customer needing to do
// anything differently.
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal memuat gambar'));
    };
    img.src = objectUrl;
  });
}

export function usePersonalPhotoUpload() {
  const [personalPhotoFile, setPersonalPhotoFile] = useState<File | null>(null);
  const [personalPhotoBase64, setPersonalPhotoBase64] = useState<string>('');

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPersonalPhotoFile(file);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPersonalPhotoBase64(dataUrl);
    } catch {
      // Fall back to the original file unresized rather than blocking checkout.
      const reader = new FileReader();
      reader.onloadend = () => setPersonalPhotoBase64(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return { personalPhotoFile, personalPhotoBase64, handleFileChange };
}
