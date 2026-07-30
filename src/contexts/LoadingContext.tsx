import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';

interface LoadingContextValue {
  isLoading: boolean;
  withLoading: <T>(fn: () => Promise<T>) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const pendingCount = useRef(0);

  const withLoading = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    pendingCount.current += 1;
    if (pendingCount.current === 1) setIsLoading(true);
    try {
      return await fn();
    } finally {
      pendingCount.current -= 1;
      if (pendingCount.current === 0) setIsLoading(false);
    }
  }, []);

  return (
    <LoadingContext.Provider value={{ isLoading, withLoading }}>
      {children}
      <LoadingOverlay show={isLoading} />
    </LoadingContext.Provider>
  );
}

export function useLoading(): LoadingContextValue {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error('useLoading must be used within a LoadingProvider');
  return ctx;
}
