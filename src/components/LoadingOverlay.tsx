import { AnimatePresence, motion } from 'motion/react';
import bilboIcon from '../assets/bilbo-icon.png';

interface LoadingOverlayProps {
  show: boolean;
}

export default function LoadingOverlay({ show }: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center"
          role="status"
          aria-live="polite"
          aria-label="Memproses..."
        >
          <motion.img
            src={bilboIcon}
            alt=""
            className="w-16 h-16 drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]"
            animate={{ rotate: 360, scale: [1, 1.1, 1] }}
            transition={{ rotate: { duration: 1.4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
