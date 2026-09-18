import { useEffect, useRef, type ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationConfig {
  title: string;
  message: string;
  type: NotificationType;
  details?: ReactNode[];
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
    bgColor: 'bg-success-subtle',
    borderColor: 'border-success-border',
    titleColor: 'text-success-subtle-foreground',
    textColor: 'text-success-subtle-foreground',
    iconColor: 'text-success-subtle-foreground',
    buttonBg: 'bg-success hover:bg-success/90 text-success-foreground',
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-destructive-subtle',
    borderColor: 'border-destructive-border',
    titleColor: 'text-destructive-subtle-foreground',
    textColor: 'text-destructive-subtle-foreground',
    iconColor: 'text-destructive-subtle-foreground',
    buttonBg: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-warning-subtle',
    borderColor: 'border-warning-border',
    titleColor: 'text-warning-subtle-foreground',
    textColor: 'text-warning-subtle-foreground',
    iconColor: 'text-warning-subtle-foreground',
    buttonBg: 'bg-warning hover:bg-warning/90 text-warning-foreground',
  },
  info: {
    icon: Info,
    bgColor: 'bg-muted',
    borderColor: 'border-border',
    titleColor: 'text-foreground',
    textColor: 'text-foreground',
    iconColor: 'text-muted-foreground',
    buttonBg: 'bg-primary hover:bg-primary/90 text-primary-foreground',
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
  const cardRef = useRef<HTMLDivElement>(null);

  // dialog 基本可及性：開啟時把焦點移進彈窗（否則 Tab 仍在背後頁面遊走）、
  // Esc 關閉（與點擊遮罩同一路徑）、關閉時把焦點還給原本的元素。
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className={`
            ${style.bgColor} ${style.borderColor}
            border-t-4 rounded-lg shadow-2xl
            w-full max-w-md bg-white outline-none
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <Icon className={style.iconColor} size={24} />
              <h3 className={`${style.titleColor}`}>{title}</h3>
            </div>
            {/* 同 ToastCard：熱區只在觸控裝置放大（準則 §1）。size-11 是 44px，
                -m-3 把四邊各吸回 12px，margin box 回到 size-5 的 20px——header
                的版面不受影響。 */}
            <button
              type="button"
              onClick={onClose}
              className={`${style.textColor} hover:opacity-70 transition-opacity flex size-5 items-center justify-center rounded-full pointer-coarse:size-11 pointer-coarse:-m-3`}
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
          {/* px-6 py-2 只有約 40px 高。頁尾這兩顆才是彈窗的主要觸控目標，
              比右上角的關閉鈕更需要達標——用 min-h 而非固定高度，文字換行時
              仍能長高。 */}
          <div className="px-6 pb-6 flex justify-end gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={handleCancel}
                className="bg-muted hover:bg-muted/80 text-foreground px-6 py-2 rounded-lg transition-colors duration-200 pointer-coarse:min-h-[44px]"
              >
                {cancelText}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className={`
                ${style.buttonBg}
                px-6 py-2 rounded-lg
                transition-colors duration-200 pointer-coarse:min-h-[44px]
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
