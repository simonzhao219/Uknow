// jsdom 沒有 `window.matchMedia`，而 `useMediaQuery` 在 `useState` initializer
// 裡就會讀它——沒有替身的話，任何用到它的元件一掛載就炸，而那個紅燈不代表
// 任何真實缺陷。
//
// **為什麼抽出來**：階段 2–4 會有三個 admin 元件各自呼叫
// `useMediaQuery('(min-width: 768px)')`，測試側若各自重貼一份，就是
// `useMediaQuery.ts` 檔頭註解點名要避免的模式（複製貼上、兩份各自演化到
// 某天行為不一致）。這裡放一份，全部共用。（審查 F9）
//
// 只實作 `matches` 與空的訂閱介面：元件讀的是 `matches`，訂閱只是為了不讓
// `addEventListener` 爆掉。要測「跨越斷點時的行為」得另外做可觸發的版本，
// 目前沒有任何測試需要，不預先發明。

export function stubMediaQuery(isDesktop: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: isDesktop,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * 可觸發版本：回傳一個把 `matches` 切換掉並派送 `change` 的函式。
 *
 * `stubMediaQuery` 換掉的是 `window.matchMedia` 這個**函式**，而
 * `useMediaQuery`（`hooks/useMediaQuery.ts:16`）在 effect 裡拿到 MediaQueryList
 * 物件後就只訂閱它——事後替換那個函式不會讓已經掛上的元件重讀，所以
 * 「跨越斷點」測不出來。這裡把同一個 MediaQueryList 實例留著，切換
 * `matches` 之後對它派送 `change`，走的正是瀏覽器真實的那條路徑。
 */
export function stubMediaQueryWithControl(initialIsDesktop: boolean): (next: boolean) => void {
  const listeners = new Set<() => void>();
  let matches = initialIsDesktop;
  const mql = {
    get matches() {
      return matches;
    },
    media: '',
    onchange: null,
    addEventListener: (_: string, cb: () => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: () => void) => {
      listeners.delete(cb);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    matches = next;
    for (const cb of listeners) cb();
  };
}
