import { useCallback, useEffect, useRef } from 'react';

/**
 * 「重試」後的焦點落點（ui-ux-guidelines §9 焦點後備落點）。
 *
 * 錯誤框一換成載入中，按下的重試鈕就卸載了，焦點掉到 body、報讀器無聲。這個 hook 記住
 * 「這次載入是使用者按重試觸發的」，等請求落地（loading 變 false）時：焦點若已掉到 body，
 * 失敗交給錯誤框（`errorRef`）、成功交給頁面標題（`headingRef`）。
 *
 * 不搶焦點的兩種情況：首次載入（沒有人按過重試）、落地前焦點已被使用者移到別處。
 *
 * 用法：標題 `<h1 ref={headingRef} tabIndex={-1} className="outline-none">`、錯誤框
 * `<LoadErrorCallout ref={errorRef} onRetry={() => retry(refetch)} />`。
 * `loading` 要在重試期間為 true（錯誤框因此卸載）；若某頁重試時不切載入態，錯誤框不會
 * 卸載、焦點本來就還在重試鈕上，這個 hook 什麼也不做。
 */
export function useRetryFocus({ loading, failed }: { loading: boolean; failed: boolean }) {
  const pending = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const retry = useCallback((fn: () => unknown) => {
    pending.current = true;
    return fn();
  }, []);

  useEffect(() => {
    if (!pending.current || loading) return;
    pending.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    (failed ? errorRef : headingRef).current?.focus();
  }, [loading, failed]);

  return { errorRef, headingRef, retry };
}
