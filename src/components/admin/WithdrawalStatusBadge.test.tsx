// @vitest-environment jsdom
//
// 後台提領狀態的**單一對照表**。提領管理（表格、手機卡片、CSV、轉換歷史）與
// 會員詳情的近期提領都從這裡取——同一筆在兩頁顏色不同，admin 會以為是兩種狀態。
// 顏色斷言落在 Badge variant 的 class 上：variant 一換，這裡就紅。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WithdrawalStatusBadge, withdrawalStatusLabel } from './WithdrawalStatusBadge';

afterEach(cleanup);

function badgeOf(status: string) {
  render(<WithdrawalStatusBadge status={status} />);
  return screen.getByText(withdrawalStatusLabel(status));
}

describe('WithdrawalStatusBadge', () => {
  it('四個狀態各有中文標籤', () => {
    expect(withdrawalStatusLabel('pending')).toBe('待處理');
    expect(withdrawalStatusLabel('awaiting_collection')).toBe('待查收');
    expect(withdrawalStatusLabel('completed')).toBe('已完成');
    expect(withdrawalStatusLabel('rejected')).toBe('已退件');
  });

  it('待查收在後台是 warning 黃', () => {
    expect(badgeOf('awaiting_collection').className).toContain('bg-warning');
  });

  it('已退件是 destructive 紅、待處理是中性灰', () => {
    expect(badgeOf('rejected').className).toContain('bg-destructive');
    cleanup();
    expect(badgeOf('pending').className).toContain('bg-secondary');
  });

  it('未知狀態原樣顯示原字，不丟成空白', () => {
    expect(withdrawalStatusLabel('on_hold')).toBe('on_hold');
    expect(badgeOf('on_hold').className).toContain('bg-secondary');
  });
});
