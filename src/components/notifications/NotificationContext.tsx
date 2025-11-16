import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastContainer } from './ToastContainer';
import { NotificationCard } from './NotificationCard';
import type { ToastConfig, ToastType } from './ToastCard';
import type { NotificationConfig, NotificationType } from './NotificationCard';

interface NotificationContextType {
  // Toast 相關（輕量級通知，自動消失）
  showToast: (message: string, type?: ToastType, options?: Partial<ToastConfig>) => void;
  
  // 確認通知相關（需要用戶確認）
  showNotification: (config: NotificationConfig) => void;
  
  // 快捷方法
  showSuccess: (title: string, message: string, details?: string[]) => void;
  showError: (title: string, message: string, details?: string[]) => void;
  showWarning: (title: string, message: string, details?: string[]) => void;
  showInfo: (title: string, message: string, details?: string[]) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [toasts, setToasts] = useState<ToastConfig[]>([]);
  const [notification, setNotification] = useState<NotificationConfig | null>(null);

  // Toast 相關函數
  const showToast = useCallback((
    message: string,
    type: ToastType = 'info',
    options?: Partial<ToastConfig>
  ) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastConfig = {
      id,
      message,
      type,
      duration: 3000,
      ...options,
    };

    setToasts((prev) => {
      // 最多同時顯示 3 個 toast
      const updated = [...prev, newToast];
      if (updated.length > 3) {
        return updated.slice(-3);
      }
      return updated;
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 確認通知相關函數
  const showNotification = useCallback((config: NotificationConfig) => {
    setNotification(config);
  }, []);

  const closeNotification = useCallback(() => {
    setNotification(null);
  }, []);

  // 快捷方法
  const showSuccess = useCallback((title: string, message: string, details?: string[]) => {
    showNotification({
      type: 'success',
      title,
      message,
      details,
    });
  }, [showNotification]);

  const showError = useCallback((title: string, message: string, details?: string[]) => {
    showNotification({
      type: 'error',
      title,
      message,
      details,
    });
  }, [showNotification]);

  const showWarning = useCallback((title: string, message: string, details?: string[]) => {
    showNotification({
      type: 'warning',
      title,
      message,
      details,
    });
  }, [showNotification]);

  const showInfo = useCallback((title: string, message: string, details?: string[]) => {
    showNotification({
      type: 'info',
      title,
      message,
      details,
    });
  }, [showNotification]);

  const value: NotificationContextType = {
    showToast,
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      
      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Notification Card */}
      {notification && (
        <NotificationCard
          {...notification}
          onClose={closeNotification}
        />
      )}
    </NotificationContext.Provider>
  );
}
