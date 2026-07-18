import { useEffect, useRef } from 'react';

/**
 * 分頁重新取得焦點（或從背景分頁切回）時，若呼叫端判斷資料已經 stale
 * 就觸發重新請求——接住「使用者切到別的分頁等下線付款，切回來看
 * 這頁」的情境，不必等使用者按 F5。
 *
 * `focus` 與 `visibilitychange` 常常在同一次切回動作中幾乎同時觸發：
 * 兩者都呼叫同一個 dedupe 過的 revalidate，第二次呼叫直接加入
 * inflight 的第一次呼叫，不會重複打 API（見 src/utils/requestDedup.ts）。
 *
 * @param shouldRevalidate 回傳 true 才觸發（呼叫端自己決定 staleness 判斷，
 *   通常是 `keys.some(k => isStale(k))`）
 * @param revalidate 實際觸發重新請求的函式（呼叫端自己包 dedupe）
 */
export function useRevalidateOnFocus(shouldRevalidate: () => boolean, revalidate: () => void) {
  // 用 ref 存最新的 callback，effect 只註冊一次 listener，
  // 但永遠呼叫最新版本的判斷/請求邏輯（避免每次 re-render 都要
  // 重新掛 listener）。
  const shouldRef = useRef(shouldRevalidate);
  const revalidateRef = useRef(revalidate);
  shouldRef.current = shouldRevalidate;
  revalidateRef.current = revalidate;

  useEffect(() => {
    const trigger = () => {
      if (document.visibilityState === 'visible' && shouldRef.current()) {
        revalidateRef.current();
      }
    };
    window.addEventListener('focus', trigger);
    document.addEventListener('visibilitychange', trigger);
    return () => {
      window.removeEventListener('focus', trigger);
      document.removeEventListener('visibilitychange', trigger);
    };
  }, []);
}
