// @vitest-environment jsdom
//
// 輸入格的聚焦＝有框元件的選取態（ui-ux-guidelines §12.12）：框線變灰字 --sel、外加 1px
// 同色環，合成單圈 2px，不疊 3px 焦點環（文字輸入框滑鼠點也算 focus-visible）。錯誤欄位
// 聚焦時環換成全不透明的 destructive-border——兩成透明的紅等於沒有環（業主裁決 D1，#354）。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Input } from './input';

afterEach(cleanup);

describe('Input', () => {
  it('聚焦時框線與 1px 環同為灰字 --sel，合成單圈', () => {
    render(<Input aria-label="手機號碼" />);
    const input = screen.getByRole('textbox', { name: '手機號碼' });
    for (const c of ['focus-visible:border-sel', 'focus-visible:ring-1', 'focus-visible:ring-sel']) {
      expect(input.classList.contains(c), c).toBe(true);
    }
    expect(input.classList.contains('focus-visible:ring-[3px]')).toBe(false);
  });

  it('錯誤欄位聚焦時環與框線同為全不透明的 destructive-border', () => {
    render(<Input aria-label="手機號碼" aria-invalid />);
    const input = screen.getByRole('textbox', { name: '手機號碼' });
    for (const c of ['aria-invalid:ring-destructive-border', 'aria-invalid:border-destructive-border']) {
      expect(input.classList.contains(c), c).toBe(true);
    }
    expect(input.className).not.toMatch(/destructive\/\d/);
  });

  // 業主裁決 E1：休息態框線走 --input（對底 ≥3:1）；深色的底色走 --input-background，
  // 不再用 dark:bg-input/30 疊——否則框線色一加深，填色也跟著變亮。
  it('休息態框線走 --input，底色走 --input-background 不疊框線色', () => {
    render(<Input aria-label="手機號碼" />);
    const input = screen.getByRole('textbox', { name: '手機號碼' });
    for (const c of ['border-input', 'bg-input-background']) {
      expect(input.classList.contains(c), c).toBe(true);
    }
    expect(input.className).not.toMatch(/bg-input\//);
  });
});
