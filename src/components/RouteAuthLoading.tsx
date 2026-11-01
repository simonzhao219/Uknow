// 守衛的冷啟動載入態（T1-B §4.1）：可讀文字（<output> 隱含 role="status"），5 秒後換成
// 「連線較慢，仍在載入…」——/profile 最壞約 14 秒才進 degraded，手機上空轉 spinner 像當機。
import { useEffect, useState } from 'react';

const SLOW_AFTER_MS = 5_000;

export function RouteAuthLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center gap-3 min-h-[60vh]">
      <div
        className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"
        aria-hidden="true"
      />
      <output aria-busy="true" className="text-sm text-muted-foreground">
        {slow ? '連線較慢，仍在載入…' : '載入中…'}
      </output>
    </div>
  );
}
