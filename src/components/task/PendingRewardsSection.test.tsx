// @vitest-environment jsdom
//
// 待領取的任務獎勵（免費續約 1 年 credit）。可領時是綠框（領取獎勵＝次要、容器 success；
// 畫面稿「本月已達標」），不再是會脈動的黃框；領不了時換黃框說明原因——會籍失效有
// 「續訂」引導鈕（全頁唯一實心），停權只有原因文字。領取鈕在領不了時不出現（畫面稿）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PendingRewardsSection } from './PendingRewardsSection';
import type { PendingMissionReward } from '../../hooks/useTaskData';

afterEach(cleanup);

const reward = (id: string): PendingMissionReward => ({
  id,
  type: 'monthly_king',
  rewardType: 'free_renewal_year',
  amount: 0,
  achievedAt: '2026-10-03T00:00:00.000Z',
  status: 'pending',
  description: '2026 年 10 月推薦王任務達成獎勵',
  details: {},
});

function renderSection(
  count: number,
  blocked: 'expired' | 'suspended' | null = null,
  withClaimAll = true,
) {
  return render(
    <MemoryRouter>
      <PendingRewardsSection
        pendingRewards={Array.from({ length: count }, (_, i) => reward(`r${i}`))}
        onClaimReward={vi.fn()}
        onClaimAll={withClaimAll ? vi.fn() : undefined}
        blocked={blocked}
      />
    </MemoryRouter>,
  );
}

const root = () => screen.getByTestId('pending-rewards');

describe('PendingRewardsSection 可領取', () => {
  it('沒有待領取獎勵時整塊不渲染', () => {
    const { container } = renderSection(0);
    expect(container.firstChild).toBeNull();
  });

  it('是綠框，不再脈動、不用黃色', () => {
    renderSection(2);
    for (const c of ['bg-success-subtle', 'border-success-border']) {
      expect(root().classList.contains(c), c).toBe(true);
    }
    expect(root().className).not.toContain('animate-pulse');
    expect(root().className).not.toContain('warning');
  });

  it('每筆獎勵一顆「領取獎勵」，是綠框次要鈕', () => {
    renderSection(2);
    const buttons = screen.getAllByRole('button', { name: '領取獎勵' });
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b.classList.contains('border-success-border'), 'border').toBe(true);
      expect(b.classList.contains('text-success-subtle-foreground'), 'text').toBe(true);
      expect(b.classList.contains('bg-primary')).toBe(false);
    }
  });

  it('兩張以上才有「一次領取全部」，同樣是綠框次要鈕並寫出張數', () => {
    renderSection(2);
    const all = screen.getByRole('button', { name: '一次領取全部（2 張）' });
    expect(all.classList.contains('border-success-border')).toBe(true);
    cleanup();
    renderSection(1);
    expect(screen.queryByRole('button', { name: /一次領取全部/ })).toBeNull();
  });

  it('父層沒有提供批次領取時不顯示「一次領取全部」', () => {
    renderSection(3, null, false);
    expect(screen.queryByRole('button', { name: /一次領取全部/ })).toBeNull();
  });

  it('可領取時沒有續訂鈕（頁面上沒有實心引導鈕）', () => {
    renderSection(2);
    expect(screen.queryByRole('link', { name: '續訂' })).toBeNull();
  });
});

describe('PendingRewardsSection 領不了', () => {
  it('會籍失效：黃框說明原因，續訂是唯一實心鈕（品牌色引導、取黃容器色），不出現領取鈕', () => {
    renderSection(2, 'expired');
    for (const c of ['bg-warning-subtle', 'border-warning-border']) {
      expect(root().classList.contains(c), c).toBe(true);
    }
    expect(screen.getByText('會籍已失效')).toBeTruthy();
    expect(screen.getByText(/請先續訂後再領取/)).toBeTruthy();
    const renew = screen.getByRole('link', { name: '續訂' });
    expect(renew.getAttribute('href')).toBe('/payment/checkout');
    expect(renew.classList.contains('bg-warning')).toBe(true);
    expect(screen.queryByRole('button', { name: '領取獎勵' })).toBeNull();
    expect(screen.queryByRole('button', { name: /一次領取全部/ })).toBeNull();
  });

  it('會籍失效時仍說出有幾個獎勵在等', () => {
    renderSection(2, 'expired');
    expect(root().textContent).toContain('2 個');
  });

  it('停權：只有原因文字，沒有續訂鈕也沒有領取鈕', () => {
    renderSection(1, 'suspended');
    expect(root().classList.contains('bg-warning-subtle')).toBe(true);
    expect(screen.getByText('帳號已停權')).toBeTruthy();
    expect(screen.getByText(/請聯繫客服/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: '續訂' })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
