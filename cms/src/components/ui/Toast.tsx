'use client';
import { createContext, useCallback, useContext, useState } from 'react';

type Toast = { id: number; message: string; kind: 'info' | 'error' | 'success' };
const ToastCtx = createContext<(message: string, kind?: Toast['kind']) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card px-4 py-3 text-sm shadow-pop animate-in ${
              t.kind === 'error' ? 'border-red-300 text-red-700' : t.kind === 'success' ? 'border-emerald-300 text-emerald-700' : ''
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
