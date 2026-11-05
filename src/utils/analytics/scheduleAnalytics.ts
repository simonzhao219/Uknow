// 啟動排程（純函式，依賴全由呼叫端注入，方便測試）。
// 規則：canonical redirect 時不啟動；否則等 window load 之後再等瀏覽器 idle 才載入 SDK。

export interface ScheduleDeps {
  isRedirecting: boolean;
  /** 文件已載入就立即執行，否則等 load 事件。 */
  whenLoaded: (cb: () => void) => void;
  /** requestIdleCallback，無則 setTimeout。 */
  idle: (cb: () => void) => void;
  start: () => void;
}

export function scheduleAnalytics(deps: ScheduleDeps): void {
  if (deps.isRedirecting) return;
  deps.whenLoaded(() => deps.idle(deps.start));
}
