import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastConfig {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastCardProps extends ToastConfig {
  onClose: (id: string) => void;
}

const toastStyles = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-500',
    textColor: 'text-green-800',
    iconColor: 'text-green-500',
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-500',
    textColor: 'text-red-800',
    iconColor: 'text-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-500',
    textColor: 'text-orange-800',
    iconColor: 'text-orange-500',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-500',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-500',
  },
};

export function ToastCard({ id, message, type, duration = 2000, onClose }: ToastCardProps) {
  const [isVisible, setIsVisible] = useState(true);
  const style = toastStyles[type];
  const Icon = style.icon;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(id), 200); // 等待動畫完成
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(id), 200);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`
            ${style.bgColor} ${style.borderColor} ${style.textColor}
            border-l-4 rounded-lg shadow-lg p-4 mb-2 
            flex items-center gap-3 min-w-[280px] max-w-[500px]
          `}
        >
          <Icon className={`${style.iconColor} flex-shrink-0`} size={20} />
          <span className="flex-1">{message}</span>
          <button
            onClick={handleClose}
            className={`${style.textColor} hover:opacity-70 transition-opacity flex-shrink-0`}
            aria-label="關閉"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
