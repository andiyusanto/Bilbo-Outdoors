import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImagePreviewModalProps {
  imageUrl: string;
  alt: string;
  onClose: () => void;
}

export default function ImagePreviewModal({ imageUrl, alt, onClose }: ImagePreviewModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl w-full border-4 border-black bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute -top-4 -right-4 w-9 h-9 bg-brand border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:bg-black hover:text-brand transition-colors cursor-pointer"
        >
          <X className="w-5 h-5 stroke-[3]" />
        </button>
        <img src={imageUrl} alt={alt} className="w-full max-h-[80vh] object-contain" />
      </div>
    </div>
  );
}
