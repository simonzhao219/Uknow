// 外部聯絡連結（LINE / IG / FB）一律在原分頁開啟，不開新分頁/視窗。
//
// 背景：呼叫 window.open 並指定分頁目標為「開新視窗」的寫法，曾在多個
// 檔案各自複製貼上，與產品預期（原頁開啟）不符；且無共用實作，同一錯誤
// 模式重複出現卻沒有單一修改點。
export function openExternalLink(url: string): void {
  window.location.href = url;
}
