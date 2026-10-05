// @vitest-environment jsdom
//
// 我的訂閱卡的續訂入口。到期前續訂暫停開放（業主 2026-10-05，規格書 §14 第 7 列）：
// 結帳頁會把 active 會員導回會員中心，所以 30 天內到期只倒數、不放續訂鈕，
// 提醒文字也不能叫人「儘早續訂」。已失效的老會員照常有續訂鈕。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubscriptionStatusCard } from './SubscriptionStatusCard';
import type { SubscriptionData } from '../../hooks/useSubscription';

afterEach(cleanup);

const DAY = 86_400_000;

function renderCard(data: Partial<SubscriptionData>) {
  render(
    <MemoryRouter>
      <SubscriptionStatusCard subscriptionData={data as SubscriptionData} isLoading={false} />
    </MemoryRouter>,
  );
}

describe('SubscriptionStatusCard', () => {
  it('會籍 30 天內到期時只顯示倒數，沒有續訂鈕', () => {
    renderCard({
      hasSubscription: true,
      status: 'active',
      activeUntil: new Date(Date.now() + 10 * DAY).toISOString(),
    });
    expect(screen.getByText('會籍即將到期')).toBeTruthy();
    expect(screen.getByText(/將於 10 天後到期/)).toBeTruthy();
    expect(screen.queryByText(/儘早續訂/)).toBeNull();
    expect(screen.queryByRole('link', { name: '續訂' })).toBeNull();
  });

  it('已失效的老會員有續訂鈕並連到結帳頁', () => {
    renderCard({
      hasSubscription: false,
      status: 'expired',
      activeUntil: new Date(Date.now() - 3 * DAY).toISOString(),
    });
    expect(screen.getByRole('link', { name: '續訂' }).getAttribute('href')).toBe(
      '/payment/checkout',
    );
  });
});
