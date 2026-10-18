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
  // 複製要把焦點借給暫存 textarea;記下原本的焦點,用完還回去——鍵盤使用者按完
  // 複製鈕不該掉到頁首。
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textArea = document.createElement('textarea');
  textArea.value = text;
  // 唯讀:iOS 聚焦時不跳鍵盤;16px:低於 16px 的輸入元件聚焦時 iOS 會放大整頁。
  textArea.readOnly = true;
  textArea.style.fontSize = '16px';
  // 不能用 display:none 或 hidden——那樣 select() 選不到內容。移到畫面外
  // 並用 fixed 定位,避免 focus 時把頁面捲走。
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  // iOS Safari 的 select() 不一定選得到唯讀欄位,再明確選一次全段。
  textArea.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    // finally 而非 try 之後:擲錯路徑也必須清掉暫存節點、還回焦點。
    textArea.remove();
    previousFocus?.focus({ preventScroll: true });
  }
  return copied;
}
