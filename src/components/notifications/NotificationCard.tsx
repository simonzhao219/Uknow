import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationConfig {
  title: string;
  message: string;
  type: NotificationType;
  details?: string[];
  onConfirm?: () => void;
  confirmText?: string;
  onCancel?: () => void;
  cancelText?: string;
}

interface NotificationCardProps extends NotificationConfig {
  onClose: () => void;
}

const notificationStyles = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-500',
    titleColor: 'text-green-900',
    textColor: 'text-green-800',
    iconColor: 'text-green-500',
    buttonBg: 'bg-green-500 hover:bg-green-600',
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-500',
    titleColor: 'text-red-900',
    textColor: 'text-red-800',
    iconColor: 'text-red-500',
    buttonBg: 'bg-red-500 hover:bg-red-600',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-500',
    titleColor: 'text-orange-900',
    textColor: 'text-orange-800',
    iconColor: 'text-orange-500',
    buttonBg: 'bg-orange-500 hover:bg-orange-600',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-500',
    titleColor: 'text-blue-900',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-500',
    buttonBg: 'bg-blue-500 hover:bg-blue-600',
  },
};

export function NotificationCard({
  title,
  message,
  type,
  details,
  onConfirm,
  confirmText = '確認',
  onCancel,
  cancelText = '取消',
  onClose,
}: NotificationCardProps) {
  const style = notificationStyles[type];
  const Icon = style.icon;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className={`
            ${style.bgColor} ${style.borderColor}
            border-t-4 rounded-lg shadow-2xl 
            w-full max-w-md bg-white
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <Icon className={style.iconColor} size={24} />
              <h3 className={`${style.titleColor}`}>{title}</h3>
            </div>
            <button
              onClick={onClose}
              className={`${style.textColor} hover:opacity-70 transition-opacity`}
              aria-label="關閉"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 pb-4">
            <p className={`${style.textColor} mb-3`}>{message}</p>
            
            {details && details.length > 0 && (
              <div className={`${style.bgColor} rounded-md p-3 space-y-1`}>
                {details.map((detail, index) => (
                  <div key={index} className={`${style.textColor} text-sm flex items-start`}>
                    <span className="mr-2">•</span>
                    <span className="flex-1">{detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex justify-end gap-2">
            {onCancel && (
              <button
                onClick={handleCancel}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg transition-colors duration-200"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={handleConfirm}
              className={`
                ${style.buttonBg}
                text-white px-6 py-2 rounded-lg
                transition-colors duration-200
              `}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}