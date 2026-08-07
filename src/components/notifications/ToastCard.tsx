import { useEffect, useState } from 'react';
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
          // max-w-full（上限交給 ToastContainer 夾住的容器）取代
          // min-w-[280px] max-w-[500px]：原本那組固定寬度不看視窗，窄螢幕上
          // 卡片會比畫面還寬。寬度仍隨內容伸縮，只是再也不會超出容器。
          className={`
            ${style.bgColor} ${style.borderColor} ${style.textColor}
            border-l-4 rounded-lg shadow-lg p-4 mb-2
            flex items-center gap-3 max-w-full
          `}
          data-testid="toast"
          data-toast-type={type}
        >
          <Icon className={`${style.iconColor} flex-shrink-0`} size={20} />
          {/* min-w-0：flex 子項預設不會縮到 min-content 以下，錯誤訊息裡的
              長 token（Email、網址、錯誤代碼）會把卡片撐爆。break-words 讓
              那種不可斷的字串換行而不是往外跑。 */}
          <span className="min-w-0 flex-1 break-words">{message}</span>
          {/* 熱區只在觸控裝置放大（準則 §1：滑鼠維持精簡密度）。size-11 是
              44px，-m-2.5 把四邊各吸回 10px，margin box 回到 size-6 的 24px
              ——熱區長大但 toast 的高度與間距完全不變。 */}
          <button
            type="button"
            onClick={handleClose}
            className={`${style.textColor} hover:opacity-70 transition-opacity flex-shrink-0 flex size-6 items-center justify-center rounded-full pointer-coarse:size-11 pointer-coarse:-m-2.5`}
            aria-label="關閉"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
