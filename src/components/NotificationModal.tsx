import { CheckCircle, AlertTriangle, HelpCircle, X } from 'lucide-react';

export type NotificationVariant = 'success' | 'error' | 'confirm';

interface NotificationModalProps {
  variant: NotificationVariant;
  message: string;
  onClose: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

const VARIANT_CONFIG = {
  success: {
    title: 'BERHASIL',
    Icon: CheckCircle,
    headerClass: 'bg-emerald-600 text-white',
    iconClass: 'text-white',
  },
  error: {
    title: 'GAGAL',
    Icon: AlertTriangle,
    headerClass: 'bg-red-600 text-white',
    iconClass: 'text-white',
  },
  confirm: {
    title: 'KONFIRMASI',
    Icon: HelpCircle,
    headerClass: 'bg-black text-white',
    iconClass: 'text-brand',
  },
} as const;

export default function NotificationModal({ variant, message, onClose, onConfirm, onCancel }: NotificationModalProps) {
  const { title, Icon, headerClass, iconClass } = VARIANT_CONFIG[variant];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden">
        <div className={`px-5 py-4 flex justify-between items-center border-b-2 border-black ${headerClass}`}>
          <h3 className="font-display font-black text-sm uppercase tracking-wider flex items-center gap-2">
            <Icon className={`w-4 h-4 ${iconClass} stroke-[2.5]`} />
            {title}
          </h3>
          <button
            onClick={variant === 'confirm' ? onCancel : onClose}
            aria-label="Tutup"
            className="hover:opacity-70 transition-opacity cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        <div className="p-5 space-y-4 bg-white text-black">
          <p className="text-xs font-bold text-zinc-800 leading-relaxed">{message}</p>

          {variant === 'confirm' ? (
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 bg-white hover:bg-zinc-100 text-black font-black text-xs border-2 border-black rounded-none uppercase tracking-widest transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-2.5 bg-red-600 hover:bg-black text-white font-black text-xs border-2 border-black rounded-none uppercase tracking-widest transition-colors cursor-pointer"
              >
                Konfirmasi
              </button>
            </div>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none uppercase tracking-widest transition-all cursor-pointer"
            >
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
