/**
 * 置中的載入轉圈——路由守衛的冷啟動等待與 lazy 路由的 Suspense fallback 共用，
 * 避免各處重刻一份 spinner。
 */
export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
