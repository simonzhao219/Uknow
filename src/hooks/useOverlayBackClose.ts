import { useEffect, useRef } from 'react';

/**
 * 疊層開啟期間，Android 返回鍵／瀏覽器上一頁只關疊層、不離頁。
 *
 * 做法：開啟時 pushState 一個與目前位置相同的歷史項（沿用 history.state，路由器不會把它
 * 當成換頁）；popstate 代表使用者按了返回 → 呼叫 onClose。疊層是由 UI 自己關掉的（完成／取消／
 * Esc）時，要把多推的那一項用 history.back() 吃掉，否則使用者之後要多按一次返回。
 */
export function useOverlayBackClose(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    let poppedByUser = false;
    window.history.pushState(window.history.state, '');
    const handler = () => {
      poppedByUser = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handler, { once: true });
    return () => {
      window.removeEventListener('popstate', handler);
      if (!poppedByUser) window.history.back();
    };
  }, [open]);
}
