// @vitest-environment jsdom
//
// 手機首頁「檢視方式」分段控制的行為契約：兩個選項都露出、當前態以
// aria-pressed 標示、點擊回報對應模式。純呈現元件（狀態由父層持有），
// 因此測試只針對可存取名稱、aria-pressed 與 onChange 回呼。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomeViewToggle } from './HomeViewToggle';

// vitest 未開 globals，testing-library 不會自動在測試間清 DOM，需手動 cleanup，
// 否則前一個測試殘留的節點會讓 getByRole 撞到「多個相同元素」。
afterEach(cleanup);

describe('HomeViewToggle', () => {
  it('兩種檢視都以具名按鈕呈現（icon-only 仍要有可存取名稱）', () => {
    render(<HomeViewToggle value="photo" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '照片檢視' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '詳細檢視' })).toBeTruthy();
  });

  it('以 aria-pressed 標示當前模式', () => {
    const { rerender } = render(<HomeViewToggle value="photo" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '照片檢視' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '詳細檢視' }).getAttribute('aria-pressed')).toBe('false');

    rerender(<HomeViewToggle value="detailed" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '照片檢視' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '詳細檢視' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('點另一個模式會回報該模式', () => {
    const onChange = vi.fn();
    render(<HomeViewToggle value="photo" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '詳細檢視' }));
    expect(onChange).toHaveBeenCalledWith('detailed');
  });

  it('整組有可存取的群組名稱', () => {
    render(<HomeViewToggle value="photo" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: '檢視方式' })).toBeTruthy();
  });
});
