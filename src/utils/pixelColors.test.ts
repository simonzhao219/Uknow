// 像素色常數與色票同一份：邀請卡圖與 QR 不能吃 CSS 變數（深色模式會翻成淺色、
// 畫在白底上就消失），只好另存常數——這支測試讓那份常數不會跟 globals.css 漂開。
// 改色票時這裡先紅，提醒同步改 pixelColors.ts。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pixelColors from './pixelColors';
import { PIXEL_INK, PIXEL_INK_MUTED, PIXEL_PAPER } from './pixelColors';

const css = readFileSync(resolve(__dirname, '../styles/globals.css'), 'utf-8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** 取 :root 區塊裡某個 token 的字面值（:root 本身不含巢狀 `{`）。 */
function rootToken(name: string): string {
  const start = css.indexOf(':root {');
  const block = css.slice(start, css.indexOf('}', start));
  const match = new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm').exec(block);
  if (!match) throw new Error(`globals.css :root 找不到 --${name}`);
  return match[1].trim().toLowerCase();
}

describe('pixelColors', () => {
  it('墨字等於 :root 的 --foreground', () => {
    expect(PIXEL_INK).toBe(rootToken('foreground'));
  });

  it('灰字等於 :root 的 --muted-foreground', () => {
    expect(PIXEL_INK_MUTED).toBe(rootToken('muted-foreground'));
  });

  it('白底固定純白，不跟 --card 走', () => {
    // QR 靜區與列印要純白：QR 容器寫死 bg-white，--card 哪天調成淡灰，跟著變的話
    // QR 四周會露出色差、下載的邀請卡底也會變灰。
    expect(PIXEL_PAPER).toBe('#ffffff');
  });

  it('只有這三個色——整檔被色彩守門排除，多一個色值只有這裡擋得到', () => {
    // scripts/check-color-usage.py 的 EXCLUDED_PATHS 收了 pixelColors.ts；第四個色值
    // 要加進來，就得在這裡（與上面三條）說清楚它對應 :root 的哪個 token。
    expect(Object.keys(pixelColors).sort()).toEqual([
      'PIXEL_INK',
      'PIXEL_INK_MUTED',
      'PIXEL_PAPER',
    ]);
  });
});
