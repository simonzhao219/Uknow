// @vitest-environment jsdom
//
// 邀請卡圖片的組成契約：下載/分享要的是「整張卡」（抬頭＋QR＋說明行與推薦碼＋連結＋
// 推薦人揭露句），而不是只有 QR，也不含畫面上的按鈕。揭露句與說明行是法遵文字，
// 放不下就換行、不縮字級也不截尾；只有連結行可截尾（QR 已承載連結）。
//
// jsdom 沒有真正的 canvas 2D context：版面案例換成記錄 fillText 當下狀態的假 context，
// 字寬用「全形 1em、半形 0.6em」近似真字型，斷言「畫了什麼、畫在哪」，不驗像素。
// 不裝假 context 的案例走 getContext 回 null 的路徑，只驗尺寸與檔名規則。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findForbiddenWord } from '@recruitment-copy';
import { drawInviteCard, inviteCardFileName } from './inviteCardImage';
import { PIXEL_INK, PIXEL_INK_MUTED, PIXEL_PAPER } from './pixelColors';

function fakeQrCanvas(size = 200): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

/** 卡片左右留白（inviteCardImage.ts 的 PAD）：每一行字都要落在這之內。 */
const PAD = 40;
const LINK = 'https://example.com/register?ref=abc123';
const TEN_ZH = '司馬相如諸葛孔明歐陽';
// 50 字外文名（姓名上限）：揭露句與抬頭都放不下一行。
const LONG_FOREIGN = 'Maximilian Alexander Christopher Bartholomew Smith';
// 沒有空白可斷的長字串（驗證前的舊資料）：只能逐字折行。
const NO_SPACE = 'Abcdefghijklmnopqrstuvwxyz'.repeat(2);

function fontSize(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match ? Number(match[1]) : 10;
}

/** 假字寬：全形字 1em、其餘 0.6em——讓「幾個字開始換行」的門檻接近真字型。 */
function fakeWidth(text: string, font: string): number {
  const size = fontSize(font);
  return Array.from(text).reduce(
    (sum, ch) => sum + (/[\u2e80-\uffef]/.test(ch) ? size : size * 0.6),
    0,
  );
}

interface DrawnText {
  text: string;
  x: number;
  y: number;
  font: string;
  fill: string;
  align: string;
}

/** HTML 規格：設定 canvas 的 width/height 會把 context 狀態重置成這組預設值。 */
const DEFAULT_STATE = {
  font: '10px sans-serif',
  fillStyle: '#000000',
  textAlign: 'start',
  imageSmoothingEnabled: true,
};

/**
 * 換上記錄用的假 context。寬高被設定時照規格重置狀態——真瀏覽器就是這樣，
 * 不模擬的話「先設字型、再改尺寸」的回歸在這裡全綠、只有真機才看得到。
 */
function installFakeContext() {
  const texts: DrawnText[] = [];
  const images: { y: number; h: number; smoothing: boolean }[] = [];
  const ctx = {
    ...DEFAULT_STATE,
    fillRect: () => {},
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: ctx.font, fill: ctx.fillStyle, align: ctx.textAlign });
    },
    drawImage(_image: unknown, _x: number, y: number, _w: number, h: number) {
      images.push({ y, h, smoothing: ctx.imageSmoothingEnabled });
    },
    measureText: (text: string) => ({ width: fakeWidth(text, ctx.font) }),
  };
  for (const prop of ['width', 'height'] as const) {
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
    vi.spyOn(HTMLCanvasElement.prototype, prop, 'set').mockImplementation(function (
      this: HTMLCanvasElement,
      value: number,
    ) {
      original?.set?.call(this, value);
      Object.assign(ctx, DEFAULT_STATE);
    });
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  return { texts, images };
}

function drawWithFakeContext(memberName: string | null, link = LINK) {
  const { texts, images } = installFakeContext();
  const card = drawInviteCard({ qrCanvas: fakeQrCanvas(), memberName, code: 'abc123', link });
  const qr = images[0];
  const linkY = texts.find((t) => t.text.startsWith('https://'))?.y ?? Number.NaN;
  return {
    card,
    texts,
    qr,
    header: texts.filter((t) => t.y < qr.y),
    disclosure: texts.filter((t) => t.y > linkY),
  };
}

describe('drawInviteCard', () => {
  it('產生比 QR 本身更大的卡片畫布（容納抬頭、說明行、連結與揭露句）', () => {
    const qr = fakeQrCanvas(200);
    const card = drawInviteCard({ qrCanvas: qr, memberName: '小明', code: 'abc123', link: LINK });
    expect(card.width).toBeGreaterThan(qr.width);
    expect(card.height).toBeGreaterThan(qr.height);
  });

  it('連結過長時仍產出卡片（內部截尾，不撐破版面）', () => {
    const card = drawInviteCard({
      qrCanvas: fakeQrCanvas(),
      memberName: '小明',
      code: 'abc123',
      link: `https://example.com/register?ref=${'x'.repeat(400)}`,
    });
    expect(card.width).toBeGreaterThan(0);
  });

  it('沒有會員名時仍可產生卡片（抬頭留白，不當機）', () => {
    const card = drawInviteCard({
      qrCanvas: fakeQrCanvas(),
      memberName: null,
      code: 'abc123',
      link: LINK,
    });
    expect(card.width).toBeGreaterThan(0);
    expect(card.height).toBeGreaterThan(0);
  });
});

describe('drawInviteCard 版面', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('抬頭放得下時名字粗體與「的Uknow邀請」同一行', () => {
    const { header } = drawWithFakeContext('小明');
    expect(header.map((t) => t.text)).toEqual(['小明', ' 的Uknow邀請']);
    expect(header[0].y).toBe(header[1].y);
    expect(header[0].font).toContain('bold');
    expect(header[0].fill).toBe(PIXEL_INK);
    expect(header[1].fill).toBe(PIXEL_INK_MUTED);
  });

  it('QR 下方同一條基線畫出灰字「掃描加入 Uknow・推薦碼」與粗體碼', () => {
    const { texts, qr } = drawWithFakeContext('小明');
    const label = texts.find((t) => t.text.trim() === '掃描加入 Uknow・推薦碼');
    const code = texts.find((t) => t.text === 'abc123');
    expect(label).toBeDefined();
    expect(code).toBeDefined();
    if (!label || !code) return;
    expect(label.y).toBe(code.y);
    expect(label.y).toBeGreaterThan(qr.y + qr.h);
    expect(label.fill).toBe(PIXEL_INK_MUTED);
    expect(code.fill).toBe(PIXEL_INK);
    expect(code.font).toContain('bold');
    expect(code.font).toContain('monospace');
    // 碼接在說明行右邊，不疊在一起。
    expect(label.x + fakeWidth(label.text, label.font)).toBeLessThanOrEqual(code.x);
  });

  it('連結下方以灰字 18px 畫出揭露句全文', () => {
    const { disclosure } = drawWithFakeContext('小明');
    expect(disclosure).toHaveLength(1);
    expect(disclosure[0].text).toBe('本邀請由 Uknow 推薦人 小明 發送');
    expect(disclosure[0].fill).toBe(PIXEL_INK_MUTED);
    expect(fontSize(disclosure[0].font)).toBe(18);
  });

  it('十字中文名的揭露句一行畫完', () => {
    const { disclosure } = drawWithFakeContext(TEN_ZH);
    expect(disclosure.map((t) => t.text)).toEqual([`本邀請由 Uknow 推薦人 ${TEN_ZH} 發送`]);
  });

  it('沒有會員名時不畫抬頭，揭露句用不帶名字的句子', () => {
    const { header, disclosure } = drawWithFakeContext(null);
    expect(header).toEqual([]);
    expect(disclosure.map((t) => t.text)).toEqual(['本邀請由 Uknow 推薦人發送']);
  });

  it('揭露句一行放不下時在空白處換行，字級不縮也不截尾', () => {
    const { disclosure } = drawWithFakeContext(LONG_FOREIGN);
    expect(disclosure.length).toBeGreaterThan(1);
    expect(disclosure.map((t) => t.text).join(' ')).toBe(
      `本邀請由 Uknow 推薦人 ${LONG_FOREIGN} 發送`,
    );
    for (const row of disclosure) {
      expect(fontSize(row.font)).toBe(18);
      expect(row.text).not.toContain('…');
    }
  });

  it('換行時「發送」不單獨掉成最後一行，帶著前一個詞一起換', () => {
    // 假字寬下「本邀請由 Uknow 推薦人 Alexander Montgomery Wellington」剛好塞滿第一行，
    // 逐詞填滿會只剩「發送」落單。
    const { disclosure } = drawWithFakeContext('Alexander Montgomery Wellington');
    expect(disclosure.map((t) => t.text)).toEqual([
      '本邀請由 Uknow 推薦人 Alexander Montgomery',
      'Wellington 發送',
    ]);
  });

  it('沒有空白可斷的長名字逐字折行，字一個都不少', () => {
    const { disclosure } = drawWithFakeContext(NO_SPACE);
    expect(disclosure.length).toBeGreaterThan(1);
    const joined = disclosure.map((t) => t.text).join('');
    expect(joined.replace(/\s/g, '')).toBe(`本邀請由Uknow推薦人${NO_SPACE}發送`);
  });

  it('抬頭名字過長時換行，名字完整且 QR 隨之下移', () => {
    const short = drawWithFakeContext('小明');
    vi.restoreAllMocks();
    const long = drawWithFakeContext(LONG_FOREIGN);
    const rows = long.header.map((t) => t.text);
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.at(-1)).toBe('的Uknow邀請');
    expect(rows.slice(0, -1).join(' ')).toBe(LONG_FOREIGN);
    expect(long.qr.y).toBeGreaterThan(short.qr.y);
    expect(long.card.height).toBeGreaterThan(short.card.height);
  });

  it.each([
    ['兩字中文名', '小明'],
    ['十字中文名', TEN_ZH],
    ['50 字外文名', LONG_FOREIGN],
    ['無空白長字串', NO_SPACE],
    ['沒有會員名', null],
  ])('%s：每行字都在左右留白之內、上下不重疊也不出畫布', (_label, name) => {
    const { card, texts, qr } = drawWithFakeContext(name);
    for (const t of texts) {
      expect(t.x).toBeGreaterThanOrEqual(PAD - 0.5);
      expect(t.x + fakeWidth(t.text, t.font)).toBeLessThanOrEqual(card.width - PAD + 0.5);
      expect(t.y + fontSize(t.font) * 0.3).toBeLessThanOrEqual(card.height);
      // 字不壓到 QR：QR 上方的行字尾在 QR 之上，下方的行字頂在 QR 之下。
      if (t.y < qr.y) expect(t.y + fontSize(t.font) * 0.3).toBeLessThanOrEqual(qr.y);
      else expect(t.y - fontSize(t.font)).toBeGreaterThanOrEqual(qr.y + qr.h);
    }
    const rowSizes = new Map<number, number>();
    for (const t of texts) rowSizes.set(t.y, Math.max(rowSizes.get(t.y) ?? 0, fontSize(t.font)));
    const ys = [...rowSizes.keys()].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(rowSizes.get(ys[i]) ?? 0);
    }
  });

  it('連結過長時只有連結行截尾加「…」，且不超出卡片寬度', () => {
    const { card, texts } = drawWithFakeContext(
      '小明',
      `https://example.com/register?ref=${'x'.repeat(400)}`,
    );
    const link = texts.find((t) => t.text.startsWith('https://'));
    expect(link?.text.endsWith('…')).toBe(true);
    if (!link) return;
    expect(link.x + fakeWidth(link.text, link.font)).toBeLessThanOrEqual(card.width - PAD + 0.5);
    expect(texts.filter((t) => t.text.includes('…'))).toEqual([link]);
  });

  it('改完畫布尺寸才設定狀態：QR 關閉平滑、每行字都有指定字型與顏色', () => {
    const { texts, qr } = drawWithFakeContext(LONG_FOREIGN);
    expect(qr.smoothing).toBe(false);
    for (const t of texts) {
      expect(t.font).not.toBe(DEFAULT_STATE.font);
      expect(t.fill).not.toBe(DEFAULT_STATE.fillStyle);
      expect(t.align).toBe('left');
    }
  });

  it.each([
    ['兩字中文名', '小明'],
    ['50 字外文名', LONG_FOREIGN],
    ['沒有會員名', null],
  ])('%s：卡片上的字都不含招募禁用字樣', (_label, name) => {
    const { texts } = drawWithFakeContext(name);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(findForbiddenWord(t.text)).toBeUndefined();
  });
});

describe('drawInviteCard 用色', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('只用現行色票上色：墨字、灰字與白底，沒有舊紫或非色票灰', () => {
    // jsdom 沒有 2D context：換成只記錄 fillStyle 的假 context，看卡片畫了哪些顏色。
    const fills: string[] = [];
    const ctx = {
      set fillStyle(value: string) {
        fills.push(value);
      },
      font: '',
      textAlign: 'left',
      imageSmoothingEnabled: true,
      fillRect: () => {},
      fillText: () => {},
      drawImage: () => {},
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );

    drawInviteCard({
      qrCanvas: fakeQrCanvas(),
      memberName: '小明',
      code: 'abc123',
      link: 'https://example.com/register?ref=abc123',
    });

    expect(new Set(fills)).toEqual(new Set([PIXEL_PAPER, PIXEL_INK, PIXEL_INK_MUTED]));
  });
});

describe('inviteCardFileName', () => {
  it('檔名帶會員名與推薦碼', () => {
    expect(inviteCardFileName('小明', 'abc123')).toBe('Uknow-推薦邀請-小明-abc123.png');
  });

  it('會員名缺漏時退回預設名', () => {
    expect(inviteCardFileName(null, 'abc123')).toBe('Uknow-推薦邀請-uknow-abc123.png');
  });

  it('會員名含檔名不接受的字元時被淨化', () => {
    expect(inviteCardFileName('a/b c', 'x1')).toBe('Uknow-推薦邀請-a_b_c-x1.png');
  });
});
