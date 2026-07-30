import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import NotificationModal, { NotificationVariant } from '../components/NotificationModal';

interface QueueEntry {
  id: number;
  variant: NotificationVariant;
  message: string;
  resolve?: (value: boolean) => void;
}

interface NotificationContextValue {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
  confirmAction: (message: string) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const nextId = useRef(0);

  const push = useCallback((variant: NotificationVariant, message: string, resolve?: (value: boolean) => void) => {
    nextId.current += 1;
    setQueue((prev) => [...prev, { id: nextId.current, variant, message, resolve }]);
  }, []);

  const dismiss = useCallback((id: number, result: boolean) => {
    setQueue((prev) => {
      const entry = prev.find((e) => e.id === id);
      entry?.resolve?.(result);
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const notifySuccess = useCallback((message: string) => push('success', message), [push]);
  const notifyError = useCallback((message: string) => push('error', message), [push]);
  const confirmAction = useCallback(
    (message: string) => new Promise<boolean>((resolve) => push('confirm', message, resolve)),
    [push]
  );

  const current = queue[0];

  return (
    <NotificationContext.Provider value={{ notifySuccess, notifyError, confirmAction }}>
      {children}
      {current && (
        <NotificationModal
          variant={current.variant}
          message={current.message}
          onClose={() => dismiss(current.id, false)}
          onConfirm={() => dismiss(current.id, true)}
          onCancel={() => dismiss(current.id, false)}
        />
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within a NotificationProvider');
  return ctx;
}
