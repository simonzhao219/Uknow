// 把「邀請卡」畫成一張圖：抬頭（會員名）＋ QR ＋說明行與推薦碼＋邀請連結＋推薦人揭露句。
//
// 為什麼自己用 canvas 畫、不引 html2canvas：需要的版面很固定（幾行文字＋一張
// 已經是 canvas 的 QR），自己畫零依賴、輸出穩定，且不會把畫面上的按鈕一起
// 截進去——業主要的正是「整張卡，但不要複製鈕與那三顆動作鈕」。
//
// 抬頭名字、說明行與揭露句放不下就換行、不縮字級也不截尾，只有連結行截尾——規則見
// docs/ui-ux-guidelines.md §13 第 5 條。
//
// 先排版（量字寬、算出每行位置與畫布高度）、再設畫布尺寸、最後一次畫完：設定 canvas
// 的寬高會把 context 的狀態（字型、顏色、對齊、平滑）全部重置。
//
// 顏色取 pixelColors（與站上色票同一份，見該檔為何不讀 CSS 變數）。

import { referralDisclosureSentence } from '@recruitment-copy';
import { PIXEL_INK, PIXEL_INK_MUTED, PIXEL_PAPER } from './pixelColors';

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
/** 每一行字可用的寬度：左右各留 PAD。 */
const CONTENT_W = W - PAD * 2;

/**
 * 揭露句字級：卡片在手機上約縮成 0.6 倍看，22px ≈ 13px，比連結（18px）大一級
 * （業主 2026-10-26 裁決）。
 */
const DISCLOSURE_PX = 22;

const SANS = 'system-ui, "PingFang TC", "Noto Sans TC", sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

interface TextStyle {
  size: number;
  bold?: boolean;
  mono?: boolean;
}

/** 一行裡的一段字：同一行可混兩種字型（名字粗體＋後綴一般字、說明＋粗體碼）。 */
interface Run extends TextStyle {
  text: string;
  color: string;
}

interface PlacedText {
  text: string;
  font: string;
  color: string;
  /** 左緣（畫的時候 textAlign 是 left）。 */
  x: number;
  /** 基線。 */
  y: number;
}

interface CardLayout {
  height: number;
  qrY: number;
  texts: PlacedText[];
}

type Measure = (text: string, style: TextStyle) => number;

function fontOf(style: TextStyle): string {
  return `${style.bold ? 'bold ' : ''}${style.size}px ${style.mono ? MONO : SANS}`;
}

/** 沒有 2D context（jsdom 之類）時的字寬估計：全形 1em、其餘 0.6em，只用來算畫布高度。 */
const estimateWidth: Measure = (text, style) =>
  Array.from(text).reduce(
    (sum, ch) => sum + (/[\u2e80-\uffef]/.test(ch) ? style.size : style.size * 0.6),
    0,
  );

/**
 * 把一段字切成放得進 CONTENT_W 的幾行：優先在空白處斷，一個詞本身就放不下才逐字
 * 折（每行至少一個字，保證會結束；以 code point 切，不拆字）。最後一行若只剩一個詞
 * （例：「發送」），把前一行的最後一個詞一起帶下來，不讓它落單。
 */
function wrapText(text: string, style: TextStyle, measure: Measure): string[] {
  const fits = (words: string[]) => measure(words.join(' '), style) <= CONTENT_W;
  const rows: string[][] = [];
  let row: string[] = [];
  for (const word of text.split(' ').filter(Boolean)) {
    if (row.length > 0 && fits([...row, word])) {
      row.push(word);
      continue;
    }
    if (row.length > 0) rows.push(row);
    if (fits([word])) {
      row = [word];
      continue;
    }
    let piece = '';
    for (const ch of Array.from(word)) {
      if (piece && !fits([piece + ch])) {
        rows.push([piece]);
        piece = '';
      }
      piece += ch;
    }
    row = [piece];
  }
  if (row.length > 0) rows.push(row);

  const last = rows.at(-1);
  const prev = rows.at(-2);
  if (last && prev && last.length === 1 && prev.length > 1) {
    const carried = [prev[prev.length - 1], ...last];
    if (fits(carried)) {
      rows[rows.length - 2] = prev.slice(0, -1);
      rows[rows.length - 1] = carried;
    }
  }
  return rows.map((words) => words.join(' '));
}

/**
 * 排一列字：所有段合起來放得下就同一行；放不下就每段各自成行（段內再依 wrapText
 * 換行）。回傳的每一行是若干段，置中與基線交給 layoutInviteCard。
 */
function layoutRows(runs: Run[], measure: Measure): Run[][] {
  const total = runs.reduce((sum, run) => sum + measure(run.text, run), 0);
  if (total <= CONTENT_W) return [runs];
  return runs.flatMap((run) =>
    wrapText(run.text.trim(), run, measure).map((text) => [{ ...run, text }]),
  );
}

/** 連結過長就截尾，不讓它撐破卡片（連結是唯一可截尾的一行）。 */
function truncateLink(link: string, style: TextStyle, measure: Measure): string {
  let shown = link;
  while (measure(shown, style) > CONTENT_W && shown.length > 8) {
    shown = `${shown.slice(0, -4)}…`;
  }
  return shown;
}

/** 由上往下排出每一行字的位置與畫布高度。name 已 trim，空字串表示沒有會員名。 */
function layoutInviteCard(name: string, code: string, link: string, measure: Measure): CardLayout {
  const texts: PlacedText[] = [];
  let y = 0;

  // 每行置中；行高取該行最大字級的 1.4 倍，基線在行頂往下一個字級處、下方留給字尾。
  const place = (rows: Run[][]) => {
    for (const row of rows) {
      const size = Math.max(...row.map((run) => run.size));
      const widths = row.map((run) => measure(run.text, run));
      let x = (W - widths.reduce((sum, w) => sum + w, 0)) / 2;
      for (const [i, run] of row.entries()) {
        texts.push({ text: run.text, font: fontOf(run), color: run.color, x, y: y + size });
        x += widths[i];
      }
      y += Math.ceil(size * 1.4);
    }
  };

  // 抬頭：「<會員名> 的Uknow邀請」——名字粗體，其餘一般。沒有名字就只留白。
  if (name) {
    y = 16;
    place(
      layoutRows(
        [
          { text: name, size: 30, bold: true, color: PIXEL_INK },
          { text: ' 的Uknow邀請', size: 24, color: PIXEL_INK_MUTED },
        ],
        measure,
      ),
    );
    y += 14;
  } else {
    y = 24;
  }
  const qrY = y;
  y += QR + 22;

  // 說明行＋推薦碼（碼是粗體等寬墨字，其餘灰字）
  place(
    layoutRows(
      [
        { text: '掃描加入 Uknow・推薦碼 ', size: 24, color: PIXEL_INK_MUTED },
        { text: code, size: 34, bold: true, mono: true, color: PIXEL_INK },
      ],
      measure,
    ),
  );
  y += 12;

  const linkStyle: TextStyle = { size: 18 };
  place([[{ text: truncateLink(link, linkStyle, measure), ...linkStyle, color: PIXEL_INK_MUTED }]]);
  // 揭露句與連結分成兩組：這段距離要明顯大於揭露句自己換行的行距。
  y += 10;

  place(
    layoutRows(
      [{ text: referralDisclosureSentence(name), size: DISCLOSURE_PX, color: PIXEL_INK_MUTED }],
      measure,
    ),
  );

  return { height: y + 32, qrY, texts };
}

/** 依卡片內容畫出一張直式邀請卡；回傳新的 canvas（呼叫端負責轉 PNG/Blob）。 */
export function drawInviteCard(options: InviteCardOptions): HTMLCanvasElement {
  const { qrCanvas, memberName, code, link } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const measure: Measure = ctx
    ? (text, style) => {
        ctx.font = fontOf(style);
        return ctx.measureText(text).width;
      }
    : estimateWidth;
  const layout = layoutInviteCard((memberName ?? '').trim(), code, link, measure);

  // 設定寬高會重置 context 的全部狀態：排完版才設，設完才開始畫。
  canvas.width = W;
  canvas.height = layout.height;
  if (!ctx) return canvas;

  // 底：白色（QR 對比與列印都靠它）
  ctx.fillStyle = PIXEL_PAPER;
  ctx.fillRect(0, 0, W, layout.height);

  // QR（等比縮放到固定尺寸，維持銳利）
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, (W - QR) / 2, layout.qrY, QR, QR);

  ctx.textAlign = 'left';
  for (const text of layout.texts) {
    ctx.font = text.font;
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
  }

  return canvas;
}

/** 邀請卡的下載檔名（去掉檔名不接受的字元）。 */
export function inviteCardFileName(memberName: string | null | undefined, code: string): string {
  const safeName = (memberName || 'uknow').replace(/[^\w一-龥-]+/g, '_');
  return `Uknow-推薦邀請-${safeName}-${code}.png`;
}
