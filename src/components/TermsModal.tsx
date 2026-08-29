import { useEffect } from 'react';
import { X } from 'lucide-react';

interface TermsModalProps {
  content: string;
  onClose: () => void;
}

// Same overlay/close convention as ImagePreviewModal - text content instead
// of an image, so this gets its own scrollable body rather than reusing that
// component directly.
export default function TermsModal({ content, onClose }: TermsModalProps) {
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
        className="relative max-w-2xl w-full max-h-[85vh] flex flex-col border-4 border-black bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)]"
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

        <h2 className="font-display font-black text-black text-lg uppercase tracking-tight border-b-4 border-brand px-6 py-4 shrink-0">
          Syarat &amp; Ketentuan
        </h2>

        <div className="overflow-y-auto px-6 py-5">
          <p className="text-xs text-zinc-800 font-semibold whitespace-pre-line leading-relaxed">{content}</p>
        </div>

        <div className="px-6 py-4 border-t-2 border-black shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs rounded-none border-2 border-black shadow-[3px_3px_0px_var(--brand-color)] transition-all uppercase tracking-widest cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
