// @vitest-environment jsdom
//
// 獎勵頁的「會籍已到期」橫幅只認後端明說的 expired。/subscriptions/status 讀取
// 失敗時 subscriptionData 是 null——那是「不知道」，不是「失效」，不得出現橫幅
// （B1：查詢失敗改回 500 之後，失敗不再被說成已失效，前端也不能自己說）。
// 子區塊全部 stub：這裡只驗橫幅的出現條件。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { UserCtx, state } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return { UserCtx: createContext<any>(null), state: { subscription: {} as any } };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showError: vi.fn() }),
}));
vi.mock('../hooks/useBackNavigation', () => ({ useBackNavigation: () => vi.fn() }));
vi.mock('../hooks/usePageRestoration', () => ({ usePageRestoration: () => undefined }));
vi.mock('../hooks/useSubscription', () => ({ useSubscription: () => state.subscription }));
vi.mock('../hooks/useRewardData', () => ({
  useRewardData: () => ({
    rewardsData: { available: 0, totalEarned: 0, withdrawn: 0 },
    withdrawals: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
  }),
}));
vi.mock('./reward/RewardStats', () => ({ RewardStats: () => null }));
vi.mock('./reward/WithdrawalSection', () => ({ WithdrawalSection: () => null }));
vi.mock('./reward/WithdrawalProcess', () => ({ WithdrawalProcess: () => null }));
vi.mock('./reward/RewardHistory', () => ({ RewardHistory: () => null }));
vi.mock('./reward/IdVerificationSection', () => ({ IdVerificationSection: () => null }));

import { RewardDashboard } from './RewardDashboard';

afterEach(cleanup);

function renderPage() {
  render(
    <UserCtx.Provider value={{ user: { id: 'u1' } }}>
      <MemoryRouter>
        <RewardDashboard />
      </MemoryRouter>
    </UserCtx.Provider>,
  );
}

describe('RewardDashboard 會籍到期橫幅', () => {
  it('後端回已失效時顯示橫幅', () => {
    state.subscription = { subscriptionData: { status: 'expired' }, lastFetchFailed: false };
    renderPage();
    expect(screen.getByTestId('expired-renewal-banner')).toBeTruthy();
  });

  it('訂閱狀態讀取失敗、沒有資料時不顯示橫幅', () => {
    state.subscription = { subscriptionData: null, lastFetchFailed: true };
    renderPage();
    expect(screen.queryByTestId('expired-renewal-banner')).toBeNull();
  });
});
