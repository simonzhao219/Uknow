// 畫進像素裡的顏色：邀請卡圖（canvas 2D）與 QR Code（QRCodeCanvas）。
//
// 為什麼是常數、不讀 CSS 變數：這兩者都畫在白底上、也會被下載或分享出站，
// 永遠是淺色主題的樣子。--foreground 在 .dark 是淺色（#f2f2f7），若執行期讀
// 變數，深色模式下白底卡上的字與 QR 會整個消失。值與 globals.css :root 的
// 同步由 pixelColors.test.ts 釘住——改色票時那支測試會先紅。

/** 墨字＝:root 的 --foreground。QR 前景、邀請卡的會員名與推薦碼。 */
export const PIXEL_INK = '#121223';

/** 灰字＝:root 的 --muted-foreground。邀請卡的次要文字與連結。 */
export const PIXEL_INK_MUTED = '#646478';

/** 白底＝:root 的 --card。QR 對比與列印都靠它。 */
export const PIXEL_PAPER = '#ffffff';
