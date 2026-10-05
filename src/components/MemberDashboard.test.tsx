// @vitest-environment jsdom
//
// 會員中心狀態總覽的契約（plan F4、ui-ux-guidelines §13）：
// - 四張狀態卡各自有載入（骨架、不閃 0）／錯誤（中性字、不整頁報錯）／有資料三態；
// - 「需要注意」有事才出現，推薦那條只算即將到期（業主裁決 2026-10-04）；
// - 整頁至多一顆黑色主按鈕，申請提領與立即刊登同時成立時提領優先。
// 資料 hook 全部 mock 成可變狀態：這裡驗的是版面與推導，不是取數。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { UserCtx, state } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<any>(null),
    state: {
      flags: {} as Record<string, boolean>,
      subscription: {} as any,
      listing: {} as any,
      referral: {} as any,
      task: {} as any,
      reward: {} as any,
    },
  };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../contexts/FeatureContext', () => ({
  useFeatures: () => ({ isFeatureEnabled: (k: string) => state.flags[k] ?? true }),
}));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showInfo: vi.fn() }),
}));
vi.mock('../hooks/useBackNavigation', () => ({ useBackNavigation: () => vi.fn() }));
vi.mock('../hooks/useSubscription', () => ({ useSubscription: () => state.subscription }));
vi.mock('../hooks/useUserListing', () => ({ useUserListing: () => state.listing }));
vi.mock('../hooks/useReferralData', () => ({ useReferralData: () => state.referral }));
vi.mock('../hooks/useTaskData', () => ({ useTaskData: () => state.task }));
vi.mock('../hooks/useRewardData', () => ({ useRewardData: () => state.reward }));
vi.mock('./referral/MyQrEntry', () => ({ MyQrEntry: () => <div data-testid="my-qr-entry" /> }));

import { MemberDashboard } from './MemberDashboard';

const node = (status: string) => ({ status });

function setLoaded() {
  state.flags = {};
  state.subscription = {
    subscriptionData: {
      hasSubscription: true,
      status: 'active',
      activeUntil: '2027-01-01T04:00:00.000Z',
    },
    isLoading: false,
  };
  state.listing = { listing: { name: '台北好店' }, loading: false, error: null };
  state.referral = {
    overview: {
      summary: { totalReferrals: 12 },
      attention: { total: 0, items: [] },
    },
    loading: false,
    error: null,
  };
  state.task = {
    tasks: [
      { id: 't1', type: 'monthly_king', title: '推薦王', current: 3, target: 8, completed: false },
    ],
    isLoading: false,
    error: null,
  };
  state.reward = {
    rewardsData: { availableRewards: 500, hasWithdrawnToday: false },
    withdrawals: [],
    isLoading: false,
    error: null,
  };
}

function renderPage(user: any = { name: '王小明', referralProgramJoined: true }) {
  return render(
    <MemoryRouter>
      <UserCtx.Provider value={{ user }}>
        <MemberDashboard />
      </UserCtx.Provider>
    </MemoryRouter>,
  );
}

const card = (name: RegExp) => screen.getByRole('link', { name });

beforeEach(setLoaded);
afterEach(cleanup);

describe('MemberDashboard 狀態卡', () => {
  it('四張卡載入中時是骨架且不先顯示 0', () => {
    state.listing = { listing: null, loading: true, error: null };
    state.referral = { overview: null, loading: true, error: null };
    state.task = { tasks: [], isLoading: true, error: null };
    state.reward = { rewardsData: null, withdrawals: [], isLoading: true, error: null };
    const { container } = renderPage();

    for (const name of [/^刊登/, /^推薦網絡/, /^本月任務/, /^可提領點數/]) {
      expect(card(name).getAttribute('aria-busy')).toBe('true');
    }
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(8);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('單卡讀取失敗只在該卡顯示中性錯誤態', () => {
    state.referral = { overview: null, loading: false, error: '網路錯誤' };
    renderPage();

    expect(within(card(/^推薦網絡：/)).getByText('暫時無法取得推薦資料')).toBeTruthy();
    expect(within(card(/^可提領點數/)).getByText('500')).toBeTruthy();
  });

  it('沒有刊登時刊登卡連到建立頁並出現立即刊登', () => {
    state.listing = { listing: null, loading: false, error: null };
    renderPage();

    const listing = card(/^刊登：尚未建立刊登/);
    expect(listing.getAttribute('href')).toBe('/service-providers/create');
    expect(within(listing).getByText('立即刊登')).toBeTruthy();
  });

  it('會籍有效時刊登卡顯示名稱與會籍到期日且沒有狀態徽章', () => {
    renderPage();

    const listing = card(/^刊登：台北好店/);
    expect(listing.getAttribute('href')).toBe('/service-providers');
    expect(listing.getAttribute('aria-label')).toBe('刊登：台北好店，會籍至 2027/01/01');
    expect(within(listing).getByText('會籍至 2027/01/01')).toBeTruthy();
    expect(within(listing).queryByText('已隱藏')).toBeNull();
  });

  it('會籍失效時刊登卡標示已隱藏', () => {
    state.subscription = {
      subscriptionData: {
        hasSubscription: false,
        status: 'expired',
        activeUntil: '2026-09-01T04:00:00.000Z',
      },
      isLoading: false,
    };
    renderPage();

    expect(within(card(/^刊登：台北好店/)).getByText('已隱藏')).toBeTruthy();
  });

  it('刊登讀取失敗時不喊尚未刊登', () => {
    state.listing = { listing: null, loading: false, error: '查詢失敗' };
    renderPage();

    const listing = card(/^刊登/);
    expect(within(listing).getByText('暫時無法取得刊登狀態')).toBeTruthy();
    expect(within(listing).queryByText('立即刊登')).toBeNull();
  });

  it('推薦網絡卡的徽章只計即將到期的人數', () => {
    state.referral.overview.attention = {
      total: 4,
      items: [node('expiring'), node('expiring'), node('expiring'), node('expired')],
    };
    renderPage();

    const referral = card(/^推薦網絡：/);
    expect(within(referral).getByText('12')).toBeTruthy();
    expect(within(referral).getByText('3 位即將到期')).toBeTruthy();
    expect(referral.getAttribute('aria-label')).toBe('推薦網絡：12 位，3 位即將到期');
  });

  it('推薦網絡沒有人即將到期時卡片不顯示徽章', () => {
    state.referral.overview.attention = { total: 2, items: [node('expired'), node('suspended')] };
    renderPage();

    expect(within(card(/^推薦網絡：/)).queryByText(/即將到期/)).toBeNull();
  });

  it('本月任務卡以本輪顯示推薦進度並標明單位', () => {
    renderPage();

    const taskCard = card(/^本月任務/);
    expect(taskCard.textContent).toContain('本輪推薦3 / 8位');
    expect(within(taskCard).queryByText(/本月已完成/)).toBeNull();
    expect(taskCard.getAttribute('aria-label')).toBe('本月任務：推薦王本輪推薦 3 / 8 位');
  });

  it('本月推薦超過一輪時與任務中心同口徑顯示本輪與已完成次數', () => {
    state.task.tasks = [
      { id: 't1', type: 'monthly_king', title: '推薦王', current: 17, target: 8, completed: true },
    ];
    renderPage();

    const taskCard = card(/^本月任務/);
    expect(taskCard.textContent).toContain('1 / 8位');
    expect(taskCard.textContent).not.toContain('17 / 8');
    expect(within(taskCard).getByText('本月已完成 2 次')).toBeTruthy();
    expect(within(taskCard).getByText('本月已達標')).toBeTruthy();
  });

  it('只取推薦王任務，沒有時顯示空態而非錯誤態', () => {
    state.task.tasks = [{ id: 'x', type: 'other', title: '其他', current: 1, target: 2 }];
    renderPage();

    const taskCard = card(/^本月任務：目前沒有任務/);
    expect(within(taskCard).getByText('目前沒有任務').className).toContain('text-foreground');
  });

  it('任務讀取失敗時本月任務卡顯示中性錯誤態', () => {
    state.task = { tasks: [], isLoading: false, error: '網路錯誤' };
    renderPage();
    expect(within(card(/^本月任務/)).getByText('暫時無法取得任務進度')).toBeTruthy();
  });

  it('點數讀取失敗時可提領點數卡顯示中性錯誤態且沒有申請提領', () => {
    state.reward = { rewardsData: null, withdrawals: [], isLoading: false, error: '網路錯誤' };
    renderPage();
    expect(within(card(/^可提領點數/)).getByText('暫時無法取得點數')).toBeTruthy();
    expect(screen.queryByText('申請提領')).toBeNull();
  });

  it('可提領點數卡顯示待查收筆數', () => {
    state.reward.withdrawals = [node('awaiting_collection'), node('completed')];
    renderPage();

    expect(within(card(/^可提領點數/)).getByText('待查收 1 筆')).toBeTruthy();
  });

  it('餘額未達提領門檻時不出現申請提領', () => {
    renderPage();
    expect(screen.queryByText('申請提領')).toBeNull();
  });

  it('今日已提領過時即使餘額足夠也不出現申請提領', () => {
    state.reward.rewardsData = { availableRewards: 5000, hasWithdrawnToday: true };
    renderPage();
    expect(screen.queryByText('申請提領')).toBeNull();
  });

  it('會籍已失效時即使餘額足夠也不出現申請提領', () => {
    state.reward.rewardsData = { availableRewards: 5000, hasWithdrawnToday: false };
    state.subscription.subscriptionData = {
      hasSubscription: false,
      status: 'expired',
      activeUntil: '2026-09-01T04:00:00.000Z',
    };
    renderPage();
    expect(screen.queryByText('申請提領')).toBeNull();
  });

  it('未加入推薦計畫時即使餘額足夠也不出現申請提領', () => {
    state.reward.rewardsData = { availableRewards: 5000, hasWithdrawnToday: false };
    renderPage({ name: '王小明', referralProgramJoined: false });
    expect(screen.queryByText('申請提領')).toBeNull();
  });
});

describe('MemberDashboard 需要注意區', () => {
  it('沒有需要處理的事時整塊不渲染', () => {
    renderPage();
    expect(screen.queryByRole('heading', { name: '需要注意' })).toBeNull();
  });

  it('有人即將到期與有待查收提領時各列一條動作連結', () => {
    state.referral.overview.attention = {
      total: 3,
      items: [node('expiring'), node('expired'), node('suspended')],
    };
    state.reward.withdrawals = [node('awaiting_collection'), node('awaiting_collection')];
    renderPage();

    expect(screen.getByRole('heading', { name: '需要注意' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '推薦網絡 1 位即將到期' }).getAttribute('href')).toBe(
      '/referrals',
    );
    expect(screen.getByRole('link', { name: '2 筆提領待查收' }).getAttribute('href')).toBe(
      '/rewards',
    );
  });

  it('推薦網絡只有已失效與停權時不列推薦那條', () => {
    state.referral.overview.attention = { total: 2, items: [node('expired'), node('suspended')] };
    renderPage();
    expect(screen.queryByRole('heading', { name: '需要注意' })).toBeNull();
  });

  it('即將到期人數被後端截斷時顯示至少幾位', () => {
    state.referral.overview.attention = {
      total: 9,
      items: Array.from({ length: 6 }, () => node('expiring')),
    };
    renderPage();
    expect(screen.getByRole('link', { name: '推薦網絡 至少 6 位即將到期' })).toBeTruthy();
  });

  it('功能旗標關閉時不列該功能的注意事項', () => {
    state.flags = { rewardSystem: false };
    state.reward.withdrawals = [node('awaiting_collection')];
    renderPage();
    expect(screen.queryByRole('heading', { name: '需要注意' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^可提領點數/ })).toBeNull();
  });
});

describe('MemberDashboard 卡片區按鈕', () => {
  const cardActions = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-testid="stat-card-action"]'));

  it('可提領且尚未刊登時兩顆都是次要外框鈕，卡片區沒有實心鈕', () => {
    state.listing = { listing: null, loading: false, error: null };
    state.reward.rewardsData = { availableRewards: 5000, hasWithdrawnToday: false };
    const { container } = renderPage();

    const actions = cardActions(container);
    expect(actions.map((a) => a.textContent)).toEqual(['立即刊登', '申請提領']);
    for (const action of actions) {
      expect(action.classList.contains('bg-card')).toBe(true);
      expect(action.classList.contains('bg-primary')).toBe(false);
    }
  });

  it('只有尚未刊登時卡片區只有立即刊登一顆行動鈕', () => {
    state.listing = { listing: null, loading: false, error: null };
    const { container } = renderPage();
    expect(cardActions(container).map((a) => a.textContent)).toEqual(['立即刊登']);
  });

  it('有刊登且不能提領時卡片區沒有行動鈕', () => {
    const { container } = renderPage();
    expect(cardActions(container)).toHaveLength(0);
  });
});
