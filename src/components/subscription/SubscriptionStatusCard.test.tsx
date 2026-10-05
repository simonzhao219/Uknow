// @vitest-environment jsdom
//
// 我的訂閱卡的續訂入口。到期前續訂暫停開放（業主 2026-10-05，規格書 §14 第 7 列）：
// 結帳頁會把 active 會員導回會員中心，所以 30 天內到期只倒數、不放續訂鈕，
// 提醒文字也不能叫人「儘早續訂」。已失效的老會員照常有續訂鈕。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('讀取失敗且沒有資料時顯示中性錯誤與重新載入，不說尚未訂閱', () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <SubscriptionStatusCard
          subscriptionData={null}
          isLoading={false}
          loadFailed
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('暫時無法取得訂閱狀態')).toBeTruthy();
    expect(screen.queryByText('您尚未訂閱任何服務')).toBeNull();
    expect(screen.queryByRole('link', { name: '開始訂閱' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
