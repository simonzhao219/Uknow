// @vitest-environment jsdom
//
// 篩選 chip 的寬度界限。自訂類別上線後,chip 的文字長度不再由開發者決定
// ——內建類別最長 6 字,自訂上限 10 字,而 chip 原本沒有任何寬度上限。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilterChip } from './FilterChip';

afterEach(cleanup);

function chipOf(label: string) {
  render(<FilterChip label={label} selected={false} onToggle={() => {}} />);
  return screen.getByRole('button', { name: label });
}

describe('FilterChip', () => {
  it('渲染標籤文字', () => {
    expect(chipOf('美髮').textContent).toBe('美髮');
  });

  it('長標籤有寬度上限，不會撐破篩選面板', () => {
    expect(chipOf('十個字的超長自訂類別').className).toMatch(/max-w-/);
  });

  it('超出上限時單行截斷', () => {
    const chip = chipOf('十個字的超長自訂類別');
    expect(chip.querySelector('.truncate')).toBeTruthy();
  });

  it('點擊觸發切換', () => {
    const onToggle = vi.fn();
    render(<FilterChip label="美髮" selected={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: '美髮' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('選取狀態以 aria-pressed 表達', () => {
    render(<FilterChip label="美髮" selected onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: '美髮' }).getAttribute('aria-pressed')).toBe('true');
  });
});
