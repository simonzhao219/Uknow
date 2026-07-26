// 把「邀請卡」畫成一張圖：會員名 + QR + 推薦碼 + 邀請連結。
//
// 為什麼自己用 canvas 畫、不引 html2canvas：需要的版面很固定（四段文字＋一張
// 已經是 canvas 的 QR），自己畫零依賴、輸出穩定，且不會把畫面上的按鈕一起
// 截進去——業主要的正是「整張卡，但不要複製鈕與那三顆動作鈕」。

export interface InviteCardOptions {
  /** 畫面上已渲染好的 QR canvas（qrcode.react 的 QRCodeCanvas）。 */
  qrCanvas: HTMLCanvasElement;
  memberName?: string | null;
  code: string;
  link: string;
}

const W = 640;
const PAD = 40;
const QR = 360;

/** 依卡片內容畫出一張正方偏長的邀請卡；回傳新的 canvas（呼叫端負責轉 PNG/Blob）。 */
export function drawInviteCard(options: InviteCardOptions): HTMLCanvasElement {
  const { qrCanvas, memberName, code, link } = options;
  const name = (memberName ?? '').trim();

  const canvas = document.createElement('canvas');
  const headerH = name ? 72 : 24;
  canvas.width = W;
  canvas.height = headerH + QR + 150;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 底：白色（QR 對比與列印都靠它）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';

  // 抬頭：「<會員名> 的Uknow邀請」——名字粗體，其餘一般。
  if (name) {
    const suffix = ' 的Uknow邀請';
    const nameFont = 'bold 30px system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
    const suffixFont = '24px system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
    ctx.font = nameFont;
    const nameW = ctx.measureText(name).width;
    ctx.font = suffixFont;
    const suffixW = ctx.measureText(suffix).width;
    const startX = (W - (nameW + suffixW)) / 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#111111';
    ctx.font = nameFont;
    ctx.fillText(name, startX, 48);
    ctx.fillStyle = '#4b4b55';
    ctx.font = suffixFont;
    ctx.fillText(suffix, startX + nameW, 48);
    ctx.textAlign = 'center';
  }

  // QR（等比縮放到固定尺寸，維持銳利）
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, (W - QR) / 2, headerH, QR, QR);

  // 推薦碼
  ctx.fillStyle = '#7c3aed';
  ctx.font = 'bold 34px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillText(code, W / 2, headerH + QR + 56);

  // 邀請連結（過長就截尾，不讓它撐破卡片）
  ctx.fillStyle = '#6b6976';
  ctx.font = '18px system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
  let shown = link;
  while (ctx.measureText(shown).width > W - PAD * 2 && shown.length > 8) {
    shown = `${shown.slice(0, -4)}…`;
  }
  ctx.fillText(shown, W / 2, headerH + QR + 100);

  return canvas;
}

/** 邀請卡的下載檔名（去掉檔名不接受的字元）。 */
export function inviteCardFileName(memberName: string | null | undefined, code: string): string {
  const safeName = (memberName || 'uknow').replace(/[^\w一-龥-]+/g, '_');
  return `Uknow-推薦邀請-${safeName}-${code}.png`;
}
