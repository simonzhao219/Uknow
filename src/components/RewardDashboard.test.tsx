// @vitest-environment jsdom
//
// 獎勵回饋頁（S7a）：
// - 「會籍已到期」橫幅只認後端明說的 expired。/subscriptions/status 讀取失敗時
//   subscriptionData 是 null——那是「不知道」，不是「失效」，不得出現橫幅（B1）；
// - 「可提領」是本頁唯一的淡底主區，申請提領鈕收進這張卡；手機順序是 主區 → 提領申請 →
//   獎勵明細（桌機左右不變）；
// - 「已付費、未加入推薦計畫」(P3′)：點數照常顯示，申請提領停用並以說明文字＋連結引導，
//   還不知道不畫成未加入；
// - 主資料讀取失敗＝LoadErrorCallout，重試只重發請求，焦點落點。
// 子區塊（提領申請、明細、證件）stub：它們各有自己的測試。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { UserCtx, state } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<any>(null),
    state: { subscription: {} as any, reward: {} as any },
  };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showError: vi.fn() }),
}));
vi.mock('../hooks/useBackNavigation', () => ({ useBackNavigation: () => vi.fn() }));
vi.mock('../hooks/usePageRestoration', () => ({ usePageRestoration: () => undefined }));
vi.mock('../hooks/useSubscription', () => ({ useSubscription: () => state.subscription }));
vi.mock('../hooks/useRewardData', () => ({ useRewardData: () => state.reward }));
vi.mock('./reward/WithdrawalSection', () => ({
  WithdrawalSection: () => <section data-testid="withdrawal-section" />,
}));
vi.mock('./reward/WithdrawalProcess', () => ({ WithdrawalProcess: () => null }));
vi.mock('./reward/RewardHistory', () => ({
  RewardHistory: () => <section data-testid="reward-history" />,
}));
vi.mock('./reward/IdVerificationSection', () => ({ IdVerificationSection: () => null }));

import { RewardDashboard } from './RewardDashboard';

function setLoaded() {
  state.subscription = { subscriptionData: { status: 'active' }, lastFetchFailed: false };
  state.reward = {
    rewardsData: {
      availableRewards: 5000,
      pendingRewards: 0,
      withdrawnRewards: 0,
      totalEarned: 8000,
      hasWithdrawnToday: false,
    },
    withdrawals: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
  };
}

beforeEach(setLoaded);
afterEach(cleanup);

function tree(user: Record<string, unknown>) {
  return (
    <UserCtx.Provider value={{ user }}>
      <MemoryRouter>
        <RewardDashboard />
      </MemoryRouter>
    </UserCtx.Provider>
  );
}

function renderPage(user: Record<string, unknown> = { id: 'u1', referralProgramJoined: true }) {
  return render(tree(user));
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

  it('失效時續訂是全頁唯一的實心引導鈕，取黃框容器色', () => {
    state.subscription = { subscriptionData: { status: 'expired' }, lastFetchFailed: false };
    renderPage();
    const renew = within(screen.getByTestId('expired-renewal-banner')).getByRole('button', {
      name: '續訂',
    });
    expect(renew.classList.contains('bg-warning')).toBe(true);
    // 提領停用且不再另有第二顆實心鈕（確認收款在 WithdrawalSection，失效時全降次要）
    expect(
      screen
        .getAllByRole('button')
        .filter((b) => b.classList.contains('bg-brand') || b.classList.contains('bg-primary')),
    ).toHaveLength(0);
  });
});

describe('RewardDashboard 可提領主區', () => {
  it('申請提領鈕在「可提領」主區內，符合資格時可按', () => {
    renderPage();
    const card = screen.getByTestId('available-rewards-card');
    const button = within(card).getByRole('button', { name: '申請Point提領' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('手機順序是主區 → 提領申請 → 獎勵明細，桌機維持明細在左、提領在右', () => {
    renderPage();
    const stats = screen.getByTestId('available-rewards-card');
    const withdrawal = screen.getByTestId('withdrawal-section');
    const history = screen.getByTestId('reward-history');
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(stats, withdrawal)).toBe(true);
    expect(follows(withdrawal, history)).toBe(true);
    expect(history.className).toContain('lg:order-1');
    expect(withdrawal.className).toContain('lg:order-2');
  });
});

describe('RewardDashboard 已付費、未加入推薦計畫（P3′）', () => {
  it('點數照常顯示，申請提領停用並說明、連到推薦管理', () => {
    renderPage({ id: 'u1', referralProgramJoined: false });
    const card = screen.getByTestId('available-rewards-card');
    expect(within(card).getByText('5000P')).toBeTruthy();
    expect(
      (within(card).getByRole('button', { name: '申請Point提領' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(card).getByText('尚未加入推薦計畫，無法申請提領')).toBeTruthy();
    expect(within(card).getByRole('link', { name: '前往推薦管理加入' }).getAttribute('href')).toBe(
      '/referrals',
    );
  });

  it('會員資料還沒取得（不知道）時不畫成未加入', () => {
    renderPage({ id: 'u1' });
    expect(screen.queryByText(/尚未加入推薦計畫/)).toBeNull();
  });
});

describe('RewardDashboard 讀取失敗', () => {
  const failed = () => {
    state.reward = { ...state.reward, rewardsData: null, error: '獲取獎勵資料失敗' };
  };

  it('顯示黃框、原因與重新載入，點了只重發請求', () => {
    failed();
    renderPage();
    expect(screen.getByText('暫時無法取得獎勵資料')).toBeTruthy();
    expect(screen.getByText('獲取獎勵資料失敗')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(state.reward.clearAndRefetch).toHaveBeenCalledTimes(1);
  });

  it('重試成功後焦點落到頁面標題', () => {
    failed();
    const view = renderPage();
    const retry = screen.getByRole('button', { name: '重新載入' });
    act(() => retry.focus());
    fireEvent.click(retry);

    state.reward = { ...state.reward, isLoading: true, error: null };
    view.rerender(tree({ id: 'u1', referralProgramJoined: true }));
    setLoaded();
    view.rerender(tree({ id: 'u1', referralProgramJoined: true }));

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '獎勵回饋' }));
  });
});
