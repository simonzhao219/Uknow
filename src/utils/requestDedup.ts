/**
 * Module-scope in-flight request map——同一個 dedup key 若已經有一個
 * revalidate 在飛行中，後續呼叫直接加入同一個 promise，不會重複打
 * API。存活在 React 元件生命週期之外，才能同時擋住：
 *   - React 18 StrictMode 開發模式的雙重 effect
 *   - 同一頁多個元件掛載同一個 hook（例如 useSubscription 被
 *     MemberDashboard 和其他頁面同時使用）
 *   - focus revalidate 與 mount revalidate 幾乎同時觸發
 */
const inflight = new Map<string, Promise<void>>();

export function dedupe(key: string, fn: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
