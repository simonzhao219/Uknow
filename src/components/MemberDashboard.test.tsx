// @vitest-environment jsdom
//
// 會員中心狀態總覽的契約（plan F4、ui-ux-guidelines §13）：
// - 四張狀態卡各自有載入（骨架、不閃 0）／錯誤（中性字、不整頁報錯）／有資料三態；
// - 四張卡的標題是目的頁名（刊登管理／推薦管理／任務中心／獎勵回饋），不設集中的
//   「需要注意」區（§13 第 3 條在會員中心不適用，業主 2026-10-04 裁決）；
// - 推薦卡的徽章只算一代即將到期，寫「N 位一代即將到期」；
// - 卡片區的行動提示（申請提領、立即刊登）一律是次要外框鈕（ui-ux-guidelines §12.11）。
// 資料 hook 全部 mock 成可變狀態：這裡驗的是版面與推導，不是取數。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
const showNotification = vi.hoisted(() => vi.fn());
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showNotification }),
}));
vi.mock('../hooks/useBackNavigation', () => ({ useBackNavigation: () => vi.fn() }));
vi.mock('../hooks/useSubscription', () => ({ useSubscription: () => state.subscription }));
vi.mock('../hooks/useUserListing', () => ({ useUserListing: () => state.listing }));
vi.mock('../hooks/useReferralData', () => ({ useReferralData: () => state.referral }));
vi.mock('../hooks/useTaskData', () => ({ useTaskData: () => state.task }));
vi.mock('../hooks/useRewardData', () => ({ useRewardData: () => state.reward }));
// 三顆推薦入口有各自的測試（閘門、導向、分享、複製）；這裡只驗放在哪、傳了什麼。
vi.mock('./referral/InviteFriendButton', () => ({
  InviteFriendButton: ({ yieldsGuide }: { yieldsGuide?: boolean }) => (
    <button
      type="button"
      data-testid="invite-friend-entry"
      data-yields-guide={String(Boolean(yieldsGuide))}
    >
      邀請好友
    </button>
  ),
}));
vi.mock('./referral/MyQrButton', () => ({
  MyQrButton: () => <span data-testid="my-qr-button-entry" />,
}));
vi.mock('./referral/ReferralCodeWithCopy', () => ({
  ReferralCodeWithCopy: () => <span data-testid="referral-code-entry" />,
}));

import { MemberDashboard } from './MemberDashboard';
import {
  PROFILE_LOCKED_CONFIRM_TEXT,
  PROFILE_LOCKED_DETAILS,
  PROFILE_LOCKED_MESSAGE,
} from '../utils/constants';

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
/** 整張卡的外殼——推薦格的按鈕在連結外，要從卡片外殼找。 */
const cardBox = (name: RegExp) => card(name).closest('[data-slot="card"]') as HTMLElement;

beforeEach(setLoaded);
afterEach(cleanup);

describe('MemberDashboard 狀態卡', () => {
  it('四張卡載入中時是骨架且不先顯示 0', () => {
    state.listing = { listing: null, loading: true, error: null };
    state.referral = { overview: null, loading: true, error: null };
    state.task = { tasks: [], isLoading: true, error: null };
    state.reward = { rewardsData: null, withdrawals: [], isLoading: true, error: null };
    const { container } = renderPage();

    for (const name of [/^刊登管理/, /^推薦管理/, /^任務中心/, /^獎勵回饋/]) {
      expect(card(name).getAttribute('aria-busy')).toBe('true');
    }
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(8);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('單卡讀取失敗只在該卡顯示中性錯誤態', () => {
    state.referral = { overview: null, loading: false, error: '網路錯誤' };
    renderPage();

    expect(within(card(/^推薦管理：/)).getByText('暫時無法取得推薦資料')).toBeTruthy();
    expect(within(card(/^獎勵回饋/)).getByText('500')).toBeTruthy();
  });

  it('沒有刊登時刊登卡連到建立頁並出現立即刊登', () => {
    state.listing = { listing: null, loading: false, error: null };
    renderPage();

    const listing = card(/^刊登管理：尚未建立刊登/);
    expect(listing.getAttribute('href')).toBe('/service-providers/create');
    expect(within(listing).getByText('立即刊登')).toBeTruthy();
  });

  it('會籍有效時刊登卡顯示名稱與會籍到期日且沒有狀態徽章', () => {
    renderPage();

    const listing = card(/^刊登管理：台北好店/);
    expect(listing.getAttribute('href')).toBe('/service-providers');
    expect(listing.getAttribute('aria-label')).toBe('刊登管理：台北好店，會籍至 2027/01/01');
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

    const badge = within(card(/^刊登管理：台北好店/)).getByText('已隱藏');
    // 已隱藏是會籍失效的結果，與失效框同為 warning 族（plan.md §4 第 10 點：失效用黃不用紅）
    expect(badge.classList.contains('bg-warning-subtle')).toBe(true);
  });

  it('刊登讀取失敗時不喊尚未刊登', () => {
    state.listing = { listing: null, loading: false, error: '查詢失敗' };
    renderPage();

    const listing = card(/^刊登管理/);
    expect(within(listing).getByText('暫時無法取得刊登狀態')).toBeTruthy();
    expect(within(listing).queryByText('立即刊登')).toBeNull();
  });

  it('推薦管理卡的徽章顯示一代即將到期的人數', () => {
    state.referral.overview.attention = {
      total: 3,
      items: [node('expiring'), node('expiring'), node('expiring')],
    };
    renderPage();

    const referral = card(/^推薦管理：/);
    expect(within(referral).getByText('12')).toBeTruthy();
    expect(within(referral).getByText('3 位一代即將到期')).toBeTruthy();
    expect(referral.getAttribute('aria-label')).toBe(
      '推薦管理：推薦總人數 12 位，3 位一代即將到期',
    );
  });

  it('推薦管理沒有人即將到期時卡片不顯示徽章', () => {
    state.referral.overview.attention = { total: 0, items: [] };
    renderPage();

    expect(within(card(/^推薦管理：/)).queryByText(/即將到期/)).toBeNull();
  });

  it('推薦管理卡的人數與「位」在同一行', () => {
    renderPage();
    const value = within(card(/^推薦管理：/)).getByText('12');
    expect(value.textContent).toBe('12位');
  });

  it('推薦格的邀請鈕在卡片連結之外，連結名稱照舊說完卡上狀態', () => {
    renderPage();
    const link = card(/^推薦管理：/);
    const invite = within(cardBox(/^推薦管理：/)).getByTestId('invite-friend-entry');
    expect(link.contains(invite)).toBe(false);
    expect(link.getAttribute('aria-label')).toBe('推薦管理：推薦總人數 12 位');
  });

  it('推薦資料讀取失敗時錯誤字照舊，邀請鈕照常顯示', () => {
    state.referral = { overview: null, loading: false, error: '網路錯誤' };
    renderPage();
    const box = cardBox(/^推薦管理：/);
    expect(within(box).getByText('暫時無法取得推薦資料')).toBeTruthy();
    expect(within(box).getByTestId('invite-friend-entry')).toBeTruthy();
  });

  it('其他三張卡仍是整卡一個連結，名稱照舊', () => {
    renderPage();
    for (const [name, label] of [
      [/^刊登管理：/, '刊登管理：台北好店，會籍至 2027/01/01'],
      [/^任務中心：/, '任務中心：推薦王本輪推薦 3 / 8 位'],
      [/^獎勵回饋：/, '獎勵回饋：可提領 500 P'],
    ] as const) {
      const link = card(name);
      expect(link.getAttribute('aria-label')).toBe(label);
      expect(link.querySelector('[data-slot="card"]')).not.toBeNull();
    }
  });

  it('任務中心卡以本輪顯示推薦進度並標明單位', () => {
    renderPage();

    const taskCard = card(/^任務中心/);
    expect(taskCard.textContent).toContain('本輪推薦3 / 8位');
    expect(within(taskCard).queryByText(/本月已完成/)).toBeNull();
    expect(taskCard.getAttribute('aria-label')).toBe('任務中心：推薦王本輪推薦 3 / 8 位');
  });

  it('本月推薦超過一輪時與任務中心同口徑顯示本輪與已完成次數', () => {
    state.task.tasks = [
      { id: 't1', type: 'monthly_king', title: '推薦王', current: 17, target: 8, completed: true },
    ];
    renderPage();

    const taskCard = card(/^任務中心/);
    expect(taskCard.textContent).toContain('1 / 8位');
    expect(taskCard.textContent).not.toContain('17 / 8');
    expect(within(taskCard).getByText('本月已完成 2 次')).toBeTruthy();
    expect(within(taskCard).getByText('本月已達標')).toBeTruthy();
  });

  it('只取推薦王任務，沒有時顯示空態而非錯誤態', () => {
    state.task.tasks = [{ id: 'x', type: 'other', title: '其他', current: 1, target: 2 }];
    renderPage();

    const taskCard = card(/^任務中心：目前沒有任務/);
    expect(within(taskCard).getByText('目前沒有任務').className).toContain('text-foreground');
  });

  it('任務讀取失敗時任務中心卡顯示中性錯誤態', () => {
    state.task = { tasks: [], isLoading: false, error: '網路錯誤' };
    renderPage();
    expect(within(card(/^任務中心/)).getByText('暫時無法取得任務進度')).toBeTruthy();
  });

  it('點數讀取失敗時獎勵回饋卡顯示中性錯誤態且沒有申請提領', () => {
    state.reward = { rewardsData: null, withdrawals: [], isLoading: false, error: '網路錯誤' };
    renderPage();
    expect(within(card(/^獎勵回饋/)).getByText('暫時無法取得點數')).toBeTruthy();
    expect(screen.queryByText('申請提領')).toBeNull();
  });

  it('獎勵回饋卡顯示待查收筆數', () => {
    state.reward.withdrawals = [node('awaiting_collection'), node('completed')];
    renderPage();

    expect(within(card(/^獎勵回饋/)).getByText('待查收 1 筆')).toBeTruthy();
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

describe('MemberDashboard 卡片標題與說明', () => {
  it('四張卡的標題是目的頁名', () => {
    renderPage();
    for (const [name, title] of [
      [/^刊登管理/, '刊登管理'],
      [/^推薦管理：/, '推薦管理'],
      [/^任務中心/, '任務中心'],
      [/^獎勵回饋/, '獎勵回饋'],
    ] as const) {
      expect(within(card(name)).getByText(title), title).toBeTruthy();
    }
  });

  it('標題不再是舊的「刊登／推薦網絡／本月任務／可提領點數」', () => {
    renderPage();
    for (const old of ['推薦網絡', '本月任務', '可提領點數']) {
      expect(screen.queryByText(old), old).toBeNull();
    }
    expect(screen.queryByText('刊登')).toBeNull();
  });

  it('推薦管理卡的數字有「推薦總人數」、獎勵回饋卡的數字有「可提領」說明', () => {
    renderPage();
    expect(within(card(/^推薦管理：/)).getByText('推薦總人數')).toBeTruthy();
    expect(within(card(/^獎勵回饋/)).getByText('可提領')).toBeTruthy();
  });
});

// 引導鈕一頁一顆（ui-ux-guidelines §12.11，#354 裁決 #1）：我的訂閱卡出現續訂時，
// 推薦格的加入推薦計畫讓位成次要；沒有續訂時維持引導鈕。到期前續訂暫停開放
// （業主 2026-10-05，規格書 §14 第 7 列），30 天內到期的卡片不放續訂鈕，所以也不讓位。
describe('MemberDashboard 引導鈕讓位', () => {
  const DAY = 86_400_000;
  const yields = () =>
    within(cardBox(/^推薦管理/))
      .getByTestId('invite-friend-entry')
      .getAttribute('data-yields-guide');

  it('會籍 30 天內到期時訂閱卡不放續訂，加入推薦計畫維持引導鈕', () => {
    state.subscription.subscriptionData = {
      hasSubscription: true,
      status: 'active',
      activeUntil: new Date(Date.now() + 10 * DAY).toISOString(),
    };
    renderPage({ name: '王小明', referralProgramJoined: false });
    expect(yields()).toBe('false');
  });

  it('會籍已失效時訂閱卡有續訂，加入推薦計畫讓位成次要', () => {
    state.subscription.subscriptionData = {
      hasSubscription: false,
      status: 'expired',
      activeUntil: new Date(Date.now() - 3 * DAY).toISOString(),
    };
    renderPage({ name: '王小明', referralProgramJoined: false });
    expect(yields()).toBe('true');
  });

  it('訂閱資料還在載入時不讓位', () => {
    state.subscription = {
      subscriptionData: {
        hasSubscription: false,
        status: 'expired',
        activeUntil: new Date(Date.now() - 3 * DAY).toISOString(),
      },
      isLoading: true,
    };
    renderPage({ name: '王小明', referralProgramJoined: false });
    expect(yields()).toBe('false');
  });

  it('到期還遠時加入推薦計畫維持引導鈕', () => {
    state.subscription.subscriptionData = {
      hasSubscription: true,
      status: 'active',
      activeUntil: new Date(Date.now() + 200 * DAY).toISOString(),
    };
    renderPage({ name: '王小明', referralProgramJoined: false });
    expect(yields()).toBe('false');
  });
});

describe('MemberDashboard 推薦入口位置', () => {
  it('標題列有我的 QR，會員資訊卡是推薦碼＋複製，邀請鈕只在推薦格', () => {
    renderPage();
    const heading = screen.getByRole('heading', { name: '會員中心' });
    const titleRow = heading.closest('div')?.parentElement as HTMLElement;
    expect(within(titleRow).getByTestId('my-qr-button-entry')).toBeTruthy();
    expect(screen.getAllByTestId('my-qr-button-entry')).toHaveLength(1);
    expect(screen.getAllByTestId('referral-code-entry')).toHaveLength(1);
    expect(screen.getAllByTestId('invite-friend-entry')).toHaveLength(1);
  });
});

// 給使用者確認的資料不截斷、只換行（#354 範圍外發現第 2 條）：Email 走 BreakableEmail。
describe('MemberDashboard 基本資料', () => {
  it('長 Email 完整顯示、在 @ 後可換行，不截斷', () => {
    const email = 'chienmingchangservice@uknowplatform.com.tw';
    renderPage({ name: '王小明', email, referralProgramJoined: true });
    const node = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === email);
    expect(node.innerHTML).toContain('@<wbr>');
    expect(node.closest('.truncate')).toBeNull();
  });
});

// 會員中心、完善資料頁、結帳頁對「資料已鎖定」共用同一份文案（PROFILE_LOCKED_*）。
describe('MemberDashboard 修改會員資料說明', () => {
  it('點說明鈕顯示共用的資料鎖定文案與客服管道', () => {
    showNotification.mockClear();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '會員資料修改說明' }));
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '修改會員資料',
        message: PROFILE_LOCKED_MESSAGE,
        details: PROFILE_LOCKED_DETAILS,
        confirmText: PROFILE_LOCKED_CONFIRM_TEXT,
      }),
    );
  });
});

describe('MemberDashboard 我的訂閱卡', () => {
  it('訂閱狀態讀取失敗時不顯示尚未訂閱，改顯示中性錯誤', () => {
    state.subscription = {
      subscriptionData: null,
      isLoading: false,
      lastFetchFailed: true,
      refresh: vi.fn(),
    };
    renderPage();
    expect(screen.getByText('暫時無法取得訂閱狀態')).toBeTruthy();
    expect(screen.queryByText('您尚未訂閱任何服務')).toBeNull();
  });
});

// ui-ux-guidelines §13 第 3 條在會員中心不適用：四張卡各自帶徽章承擔「要注意的事」，
// 不另設集中的提示區（業主 2026-10-04 裁決，S7a 拿掉）。
describe('MemberDashboard 不設需要注意區', () => {
  it('沒有需要處理的事時沒有需要注意區', () => {
    renderPage();
    expect(screen.queryByRole('heading', { name: '需要注意' })).toBeNull();
  });

  it('有人即將到期與有待查收提領時也沒有需要注意區，狀態只在卡片徽章', () => {
    state.referral.overview.attention = { total: 1, items: [node('expiring')] };
    state.reward.withdrawals = [node('awaiting_collection'), node('awaiting_collection')];
    renderPage();

    expect(screen.queryByRole('heading', { name: '需要注意' })).toBeNull();
    expect(screen.queryByRole('link', { name: '2 筆提領待查收' })).toBeNull();
    expect(within(card(/^推薦管理：/)).getByText('1 位一代即將到期')).toBeTruthy();
    expect(within(card(/^獎勵回饋/)).getByText('待查收 2 筆')).toBeTruthy();
  });

  it('清單被截在六筆時卡片徽章仍顯示精確人數', () => {
    state.referral.overview.attention = {
      total: 9,
      items: Array.from({ length: 6 }, () => node('expiring')),
    };
    renderPage();
    expect(within(card(/^推薦管理：/)).getByText('9 位一代即將到期')).toBeTruthy();
  });

  it('功能旗標關閉時不渲染該功能的卡', () => {
    state.flags = { rewardSystem: false };
    state.reward.withdrawals = [node('awaiting_collection')];
    renderPage();
    expect(screen.queryByRole('link', { name: /^獎勵回饋/ })).toBeNull();
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
