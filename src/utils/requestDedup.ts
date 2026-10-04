/**
 * Module-scope in-flight request map——同一個 dedup key 若已經有一個
 * revalidate 在飛行中，後續呼叫直接加入同一個 promise，不會重複打
 * API。存活在 React 元件生命週期之外，才能同時擋住：
 *   - React 18 StrictMode 開發模式的雙重 effect
 *   - 同一頁多個元件掛載同一個 hook（例如 useSubscription 被
 *     MemberDashboard 和其他頁面同時使用）
 *   - focus revalidate 與 mount revalidate 幾乎同時觸發
 *
 * ⚠️ 接上別人請求的呼叫端，自己的 fn **不會執行**——fn 裡的 setState 只會
 * 更新「先到者」那個 hook 實例。後到者要拿到結果，必須傳 onJoined：請求結束
 * 後它會被呼叫，呼叫端在裡面從 DataCache 讀回結果補進自己的 state。少了這一步，
 * 後到的實例會永遠停在載入中（例：會員中心冷啟動請求還在飛時點卡片進目的頁）。
 */
const inflight = new Map<string, Promise<void>>();

export function dedupe(key: string, fn: () => Promise<void>, onJoined?: () => void): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return onJoined ? existing.finally(onJoined) : existing;

  const promise = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
