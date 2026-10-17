// @vitest-environment jsdom
//
// 邀請卡圖片的組成契約：下載/分享要的是「整張卡」（會員名＋QR＋推薦碼＋連結），
// 而不是只有 QR，也不含畫面上的按鈕。jsdom 沒有真正的 canvas 2D context，
// 因此只驗「有畫出一張尺寸合理、比 QR 大的卡」與檔名規則，不驗像素。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawInviteCard, inviteCardFileName } from './inviteCardImage';
import { PIXEL_INK, PIXEL_INK_MUTED, PIXEL_PAPER } from './pixelColors';

function fakeQrCanvas(size = 200): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

describe('drawInviteCard', () => {
  it('產生比 QR 本身更大的卡片畫布（容納名字、推薦碼與連結）', () => {
    const qr = fakeQrCanvas(200);
    const card = drawInviteCard({
      qrCanvas: qr,
      memberName: '小明',
      code: 'abc123',
      link: 'https://example.com/register?ref=abc123',
    });
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
      link: 'https://example.com/register?ref=abc123',
    });
    expect(card.width).toBeGreaterThan(0);
    expect(card.height).toBeGreaterThan(0);
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
