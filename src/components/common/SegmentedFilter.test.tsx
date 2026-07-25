// @vitest-environment jsdom
//
// 分段控制的行為契約：所有選項同時露出（不折疊、不換行）、當前態以 aria-pressed
// 標示、點擊回報對應值、整組有可存取名稱。純呈現元件（狀態由父層持有）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SegmentedFilter, type SegmentedFilterOption } from './SegmentedFilter';

afterEach(cleanup);

const OPTIONS: SegmentedFilterOption<'all' | 'referral' | 'withdrawal'>[] = [
  { value: 'all', label: '全部' },
  { value: 'referral', label: '推薦獎勵' },
  { value: 'withdrawal', label: '點數提領' },
];

describe('SegmentedFilter', () => {
  it('所有選項同時可見（不藏在下拉或捲動區後面）', () => {
    render(<SegmentedFilter options={OPTIONS} value="all" onChange={() => {}} ariaLabel="來源" />);
    for (const option of OPTIONS) {
      expect(screen.getByRole('button', { name: option.label })).toBeTruthy();
    }
  });

  it('以 aria-pressed 標示當前選項', () => {
    const { rerender } = render(
      <SegmentedFilter options={OPTIONS} value="all" onChange={() => {}} ariaLabel="來源" />,
    );
    expect(screen.getByRole('button', { name: '全部' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '推薦獎勵' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    rerender(
      <SegmentedFilter options={OPTIONS} value="referral" onChange={() => {}} ariaLabel="來源" />,
    );
    expect(screen.getByRole('button', { name: '全部' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '推薦獎勵' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('點擊回報該選項的值', () => {
    const onChange = vi.fn();
    render(<SegmentedFilter options={OPTIONS} value="all" onChange={onChange} ariaLabel="來源" />);
    fireEvent.click(screen.getByRole('button', { name: '點數提領' }));
    expect(onChange).toHaveBeenCalledWith('withdrawal');
  });

  it('整組有可存取的群組名稱', () => {
    render(<SegmentedFilter options={OPTIONS} value="all" onChange={() => {}} ariaLabel="來源" />);
    expect(screen.getByRole('group', { name: '來源' })).toBeTruthy();
  });

  it('選項等寬瓜分整行、永不換行（窄欄位版面不會變成鋸齒多列）', () => {
    render(<SegmentedFilter options={OPTIONS} value="all" onChange={() => {}} ariaLabel="來源" />);
    const group = screen.getByRole('group', { name: '來源' });
    expect(group.className).toContain('flex');
    expect(group.className).not.toContain('flex-wrap');
    for (const option of OPTIONS) {
      expect(screen.getByRole('button', { name: option.label }).className).toContain('flex-1');
    }
  });
});
