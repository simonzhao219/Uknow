// @vitest-environment jsdom
//
// 任務中心的資訊層次（ui-ux-guidelines §13、plan.md §4 第 13 點、S7a）：
// - 主數字是「本輪 x / 門檻」，放在「本月已推薦」淡底卡；四顆徽章取代進度條，
//   等級小標籤、鼓勵文案、徽章下人數都拿掉；「任務獎勵」框改中性；
// - 「已付費、未加入推薦計畫」(P3′) 是正式狀態：任務照計、只加一行說明＋連結，不複製
//   加入推薦計畫的鈕與閘門（總綱 §0 原則 5）；
// - 讀取失敗＝LoadErrorCallout，重試只重發請求（不整頁重載）並處理焦點落點。
// 資料 hook 與 UserContext 全 mock：這裡驗的是版面與推導，不是取數。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { UserCtx, state } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<any>(null),
    state: { task: {} as any },
  };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../hooks/useBackNavigation', () => ({ useBackNavigation: () => vi.fn() }));
vi.mock('../hooks/useTaskData', () => ({ useTaskData: () => state.task }));

import { TaskDashboard } from './TaskDashboard';

const king = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  type: 'monthly_king',
  title: '推薦王',
  description: '單月推薦 8 位以上用戶',
  target: 8,
  current: 3,
  completed: false,
  reward: { type: 'free_renewal_year', label: '免費續約 1 年' },
  progress: 37.5,
  details: { currentMonth: '2026-10', totalCredits: 0 },
  unclaimedRewardCount: 0,
  ...over,
});

const pendingReward = (id: string) => ({
  id,
  type: 'monthly_king',
  rewardType: 'free_renewal_year',
  amount: 0,
  achievedAt: '2026-10-03T00:00:00.000Z',
  status: 'pending',
  description: '2026 年 10 月推薦王任務達成獎勵',
  details: {},
});

function setLoaded() {
  state.task = {
    tasks: [king()],
    pendingRewards: [],
    currentMonthData: null,
    isLoading: false,
    loadingCurrent: false,
    error: null,
    fetchCurrentMonthTop: vi.fn(),
    handleClaimReward: vi.fn(),
    handleClaimAllRewards: vi.fn(),
    refetch: vi.fn(),
  };
}

function renderPage(user: Record<string, unknown> = { accountStatus: 'active' }) {
  return render(
    <MemoryRouter>
      <UserCtx.Provider value={{ user }}>
        <TaskDashboard />
      </UserCtx.Provider>
    </MemoryRouter>,
  );
}

const fills = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('li[data-fill]')).map((li) => li.getAttribute('data-fill'));

beforeEach(setLoaded);
afterEach(cleanup);

describe('TaskDashboard 主數字與徽章', () => {
  it('主數字是本輪 x / 門檻，本月已推薦人數降為小字', () => {
    renderPage();
    expect(screen.getByText('本輪推薦')).toBeTruthy();
    expect(screen.getByText('3 / 8')).toBeTruthy();
    expect(screen.getByText('本月已推薦 3 人')).toBeTruthy();
  });

  it('超過一輪時主數字取本輪，並寫出本月已完成次數', () => {
    state.task.tasks = [king({ current: 17, completed: true })];
    renderPage();
    expect(screen.getByText('1 / 8')).toBeTruthy();
    expect(screen.getByText('本月已推薦 17 人，已完成 2 次')).toBeTruthy();
  });

  it('本輪剛好滿額時標示已滿一輪', () => {
    state.task.tasks = [king({ current: 8, completed: true })];
    renderPage();
    expect(screen.getByText('8 / 8')).toBeTruthy();
    expect(screen.getByText('已滿一輪')).toBeTruthy();
  });

  it('四顆徽章以「本輪」亮起：第二輪 2 人只亮第 1 顆', () => {
    state.task.tasks = [king({ current: 10, completed: true })];
    const { container } = renderPage();
    expect(fills(container)).toEqual(['1', '0', '0', '0']);
  });

  it('零人時四顆全暗', () => {
    state.task.tasks = [king({ current: 0 })];
    const { container } = renderPage();
    expect(fills(container)).toEqual(['0', '0', '0', '0']);
  });

  it('門檻取任務的 target，不寫死 8（target 5、2 人）', () => {
    state.task.tasks = [king({ target: 5, current: 2 })];
    const { container } = renderPage();
    expect(fills(container)).toEqual(['1', '0.5', '0', '0']);
    expect(screen.getByText('2 / 5')).toBeTruthy();
  });

  it('沒有舊的等級小標籤、鼓勵文案與進度條', () => {
    const { container } = renderPage();
    expect(screen.queryByText('⭐')).toBeNull();
    expect(screen.queryByText(/恭喜|加油|再推薦|立即領取獎勵/)).toBeNull();
    expect(container.querySelector('.bg-brand.transition-all')).toBeNull();
  });
});

describe('TaskDashboard 降級', () => {
  it('任務獎勵框是中性框，不是黃框', () => {
    renderPage();
    const frame = screen.getByText(/^任務獎勵/).closest('[data-slot="status-callout"]');
    expect(frame).toBeTruthy();
    expect(frame?.classList.contains('bg-muted')).toBe(true);
    expect(frame?.className).not.toContain('warning');
    expect(screen.getByText('免費續約 1 年')).toBeTruthy();
  });

  it('累計獲得的免費續約降為一行灰字，不是綠框', () => {
    state.task.tasks = [king({ details: { currentMonth: '2026-10', totalCredits: 3 } })];
    renderPage();
    const line = screen.getByText('累計獲得 3 張免費續約');
    expect(line.closest('[data-slot="status-callout"]')).toBeNull();
    expect(line.className).toContain('text-muted-foreground');
  });

  it('有推薦時有「查看本月推薦詳情」，還沒推薦時只有一句說明', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /查看本月推薦詳情/ })).toBeTruthy();
    cleanup();
    state.task.tasks = [king({ current: 0 })];
    renderPage();
    expect(screen.queryByRole('button', { name: /查看本月推薦詳情/ })).toBeNull();
    expect(screen.getByText(/完成第一次推薦後，任務將自動啟動/)).toBeTruthy();
  });
});

describe('TaskDashboard 已付費、未加入推薦計畫（P3′）', () => {
  const hint = () => screen.queryByText(/尚未加入推薦計畫/);

  it('任務照計：進度與徽章照常顯示，另加一行說明與連結到推薦管理', () => {
    state.task.tasks = [king({ current: 4 })];
    const { container } = renderPage({ accountStatus: 'active', referralProgramJoined: false });
    expect(screen.getByText('4 / 8')).toBeTruthy();
    expect(fills(container)).toEqual(['1', '1', '0', '0']);
    expect(hint()?.textContent).toContain('推薦碼目前不能出示或分享');
    expect(screen.getByRole('link', { name: '前往推薦管理加入' }).getAttribute('href')).toBe(
      '/referrals',
    );
  });

  it('不複製加入推薦計畫的鈕：本頁沒有任何「加入推薦計畫」按鈕', () => {
    renderPage({ accountStatus: 'active', referralProgramJoined: false });
    expect(screen.queryByRole('button', { name: /加入推薦計畫/ })).toBeNull();
  });

  it('已加入或還不知道（會員資料未取得）時不顯示這行說明', () => {
    renderPage({ accountStatus: 'active', referralProgramJoined: true });
    expect(hint()).toBeNull();
    cleanup();
    renderPage({ accountStatus: 'active' });
    expect(hint()).toBeNull();
  });
});

describe('TaskDashboard 待領取獎勵與會籍', () => {
  beforeEach(() => {
    state.task.pendingRewards = [pendingReward('r1'), pendingReward('r2')];
  });

  it('會籍有效：綠框置頂，可領取', () => {
    renderPage({ accountStatus: 'active' });
    expect(screen.getByTestId('pending-rewards').classList.contains('bg-success-subtle')).toBe(
      true,
    );
    expect(screen.getAllByRole('button', { name: '領取獎勵' })).toHaveLength(2);
  });

  it('頁面開著時會籍剛好失效：黃框說明並給續訂，領取鈕收起', () => {
    renderPage({ accountStatus: 'expired' });
    expect(screen.getByText('會籍已失效')).toBeTruthy();
    expect(screen.getByRole('link', { name: '續訂' }).getAttribute('href')).toBe(
      '/payment/checkout',
    );
    expect(screen.queryByRole('button', { name: '領取獎勵' })).toBeNull();
  });

  it('停權優先於失效：只有原因文字', () => {
    renderPage({ accountStatus: 'expired', suspended: true });
    expect(screen.getByText('帳號已停權')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '續訂' })).toBeNull();
  });
});

describe('TaskDashboard 讀取失敗', () => {
  const failed = () => {
    state.task = { ...state.task, tasks: [], error: '獲取任務資料失敗' };
  };

  it('顯示黃框、原因與重新載入，點了只重發請求', () => {
    failed();
    renderPage();
    expect(screen.getByText('暫時無法取得任務資料')).toBeTruthy();
    expect(screen.getByText('獲取任務資料失敗')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(state.task.refetch).toHaveBeenCalledTimes(1);
  });

  it('重試成功後焦點落到頁面標題', () => {
    failed();
    const view = render(
      <MemoryRouter>
        <UserCtx.Provider value={{ user: { accountStatus: 'active' } }}>
          <TaskDashboard />
        </UserCtx.Provider>
      </MemoryRouter>,
    );
    const retry = screen.getByRole('button', { name: '重新載入' });
    act(() => retry.focus());
    fireEvent.click(retry);

    const again = () =>
      view.rerender(
        <MemoryRouter>
          <UserCtx.Provider value={{ user: { accountStatus: 'active' } }}>
            <TaskDashboard />
          </UserCtx.Provider>
        </MemoryRouter>,
      );
    state.task = { ...state.task, isLoading: true, error: null };
    again();
    setLoaded();
    again();

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '任務中心' }));
  });
});
