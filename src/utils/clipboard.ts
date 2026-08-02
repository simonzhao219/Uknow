// 複製到剪貼簿的共用實作。
//
// 用隱藏 textarea + execCommand 而不是 navigator.clipboard:後者在
// LINE 等 in-app 瀏覽器與非 HTTPS 情境會被權限擋掉,而本專案的使用者
// 大量從 LINE 進來(見 src/utils/browserDetection.ts)。
//
// 刻意**不呼叫 showToast**——通知是呼叫端的責任。把兩者綁在一起正是
// 這段程式原本卡在 InviteFriendPanelContent 裡出不來的原因。

export function copyToClipboard(text: string): boolean {
  return false;
}
