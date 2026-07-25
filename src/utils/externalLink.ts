// 外部聯絡連結（LINE / IG / FB）一律在原分頁開啟，不開新分頁/視窗。
//
// 背景：window.open(url, '_blank') 曾在多個檔案各自複製貼上，與產品預期
// （原頁開啟）不符；且無共用實作，同一錯誤模式重複出現卻沒有單一修改點。
export function openExternalLink(url: string): void {
  // TDD 紅燈期 stub：故意先留空，讓型別通過、斷言失敗。
  void url;
}
