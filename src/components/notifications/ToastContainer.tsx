import React from 'react';
import { ToastCard, ToastConfig } from './ToastCard';

interface ToastContainerProps {
  toasts: ToastConfig[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 md:top-4 md:bottom-auto left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-center">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} {...toast} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}