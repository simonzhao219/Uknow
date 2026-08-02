// 複製到剪貼簿的共用實作。
//
// 用隱藏 textarea + execCommand 而不是 navigator.clipboard:後者在
// LINE 等 in-app 瀏覽器與非 HTTPS 情境會被權限擋掉,而本專案的使用者
// 大量從 LINE 進來(見 src/utils/browserDetection.ts)。
//
// 刻意**不呼叫 showToast**——通知是呼叫端的責任。把兩者綁在一起正是
// 這段程式原本卡在 InviteFriendPanelContent 裡出不來的原因。

/**
 * 複製文字到剪貼簿,回傳是否成功。
 *
 * `execCommand` 有兩種失敗方式:擲錯,以及**回傳 false**。只 catch 例外
 * 會在後者的瀏覽器上顯示「已複製」卻什麼都沒複製到,所以兩種都要看。
 */
export function copyToClipboard(text: string): boolean {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  // 不能用 display:none 或 hidden——那樣 select() 選不到內容。移到畫面外
  // 並用 fixed 定位,避免 focus 時把頁面捲走。
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    // finally 而非 try 之後:擲錯路徑也必須清掉暫存節點。
    textArea.remove();
  }
  return copied;
}
