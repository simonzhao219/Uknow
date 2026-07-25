import { ToastCard, type ToastConfig } from './ToastCard';

interface ToastContainerProps {
  toasts: ToastConfig[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    // role="status" + aria-live：全站操作回饋（登入失敗、提領送出…）都走
    // toast，沒有 live region 的話螢幕閱讀器完全聽不到任何回饋。
    // inset-x-0 + mx-auto + max-w + px-4 取代原本的 left-1/2 + -translate-x-1/2：
    // 舊寫法沒有給容器任何寬度上限，卡片的 max-w-[500px] 因此不受視窗約束——
    // 訊息一長就撐到 500px 並以中心對齊掛在畫面外，375px 下左右各溢出 63px、
    // 兩端文字被切掉。改成先把容器夾在視窗內（含 16px 邊距），卡片再以容器
    // 為上限，任何視窗寬度都不會超出。
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 md:top-4 md:bottom-auto inset-x-0 mx-auto w-full max-w-[532px] px-4 z-[9999] flex flex-col items-center pointer-events-none"
    >
      <div className="pointer-events-auto flex w-full flex-col items-center">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} {...toast} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}
