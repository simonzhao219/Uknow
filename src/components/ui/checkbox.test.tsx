// @vitest-environment jsdom
//
// 勾選框是「值」，不走選取的灰字規則（ui-ux-guidelines §12.12）：未勾＝白底框線，
// 已勾＝--primary 墨黑底配反白勾。焦點只有鍵盤焦點環。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Checkbox } from './checkbox';

afterEach(cleanup);

describe('Checkbox', () => {
  it('未勾時是白底框線，不再是淡灰底', () => {
    render(<Checkbox aria-label="同意條款" />);
    const box = screen.getByRole('checkbox', { name: '同意條款' });
    expect(box.getAttribute('data-state')).toBe('unchecked');
    expect(box.classList.contains('bg-card')).toBe(true);
    expect(box.classList.contains('border')).toBe(true);
    // 業主裁決 E1：未勾的勾選框只有這圈線可辨識，框線走 --input（對底 ≥3:1），不是版面分隔的 --border。
    expect(box.classList.contains('border-input')).toBe(true);
    expect(box.className).not.toMatch(/bg-input-background/);
  });

  it('已勾時是 primary 墨黑底配反白勾，不改走 --sel', () => {
    render(<Checkbox aria-label="同意條款" defaultChecked />);
    const box = screen.getByRole('checkbox', { name: '同意條款' });
    expect(box.getAttribute('data-state')).toBe('checked');
    for (const c of [
      'data-[state=checked]:bg-primary',
      'data-[state=checked]:text-primary-foreground',
      'data-[state=checked]:border-primary',
    ]) {
      expect(box.classList.contains(c), c).toBe(true);
    }
    expect(box.className).not.toMatch(/bg-sel/);
  });

  it('焦點只有鍵盤焦點環，不另改框線色', () => {
    render(<Checkbox aria-label="同意條款" />);
    const box = screen.getByRole('checkbox', { name: '同意條款' });
    expect(box.classList.contains('focus-visible:ring-ring')).toBe(true);
    expect(box.className).not.toMatch(/focus-visible:border-ring/);
  });

  it('錯誤態聚焦環用全不透明的 destructive-border', () => {
    render(<Checkbox aria-label="同意條款" aria-invalid />);
    const box = screen.getByRole('checkbox', { name: '同意條款' });
    expect(box.classList.contains('aria-invalid:ring-destructive-border')).toBe(true);
    expect(box.className).not.toMatch(/destructive\/\d/);
  });
});
