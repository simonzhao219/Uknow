import { useEffect, useRef } from 'react';

/**
 * 疊層開啟期間，Android 返回鍵／瀏覽器上一頁只關疊層、不離頁。
 *
 * 做法：開啟時 pushState 一個與目前位置相同的歷史項（沿用 history.state，路由器不會把它
 * 當成換頁）；popstate 代表使用者按了返回 → 呼叫 onClose。疊層是由 UI 自己關掉的（完成／取消／
 * Esc）時，要把多推的那一項用 history.back() 吃掉，否則使用者之後要多按一次返回。
 *
 * 疊層常駐期間（例如取景對話框佇列多張）可以連按多次返回：每次 popstate 呼叫 onClose 後，
 * **同步**再推一個歷史項重新武裝（不經 history.back()，沒有非同步時序問題）；卸載時
 * 吃掉最後多推的那一項。
 */
export function useOverlayBackClose(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    window.history.pushState(window.history.state, '');
    const handler = () => {
      onCloseRef.current();
      window.history.pushState(window.history.state, '');
    };
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      window.history.back();
    };
  }, [open]);
}
