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
