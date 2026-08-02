// @vitest-environment jsdom
//
// 結帳頁對「預設推薦人（自動綁定）」的抑制契約——規劃書
// docs/plans/default-referral-code/plan.md §4、驗收情境 M：
//   1. isAutoReferral=true 時，用戶資訊確認卡不顯示推薦碼/推薦人。
//   2. 抑制必須下沉到資料擷取層：不得發出 GET /referrals/validate/<碼>
//      ——渲染層擋得再乾淨，回應本體（含推薦人真名）已跨過網路邊界。
//   3. 續約「新約」模式的推薦碼輸入框 placeholder 不得外洩預設碼。
//   4. 反向防護：手動填碼者（isAutoReferral=false）維持原顯示——
//      抑制不得誤傷使用者自己選的推薦人。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createContext } from 'react';

const showToast = vi.fn();

// 結帳頁掛 useSubscription()（階段 10）：renewal 與 hasPendingWithdrawal
// 的單一來源。這裡替身掉，讓每個測試自行控制契約值。
const sub = vi.hoisted(() => ({
  value: null as unknown,
  refresh: vi.fn(),
}));

vi.mock('../hooks/useSubscription', () => ({
  useSubscription: () => sub.value,
}));

vi.mock('../App', () => ({
  UserContext: createContext<any>({ user: null, setUser: () => {} }),
}));

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      // 需要可用 session：checkPendingUser 的 localStorage 分支會驗證它，
      // 而 fetchReferrerInfo 的網路層測試正要觀察「拿到 session 之後
      // 還會不會發請求」——永不 resolve 的做法會讓斷言變成假陽性。
      getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }),
    },
  }),
}));

vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast, showSuccess: vi.fn(), showNotification: vi.fn() }),
}));

const { PaymentCheckout } = await import('./PaymentCheckout');

/** 記錄所有 fetch 呼叫的 URL；回應給空殼 json。 */
function spyFetch() {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({ success: true, referrerName: '不該被看到的名字' }),
      } as Response;
    }),
  );
  return calls;
}

function seedPendingUser(overrides: Record<string, unknown>) {
  localStorage.setItem(
    'pendingUser',
    JSON.stringify({
      name: '測試使用者',
      birthDate: '1990-01-01',
      nationalId: 'A123456789',
      phone: '0912345678',
      email: 'user@example.invalid',
      ...overrides,
    }),
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PaymentCheckout />
    </MemoryRouter>,
  );
}

// 10 天前到期：isRenewal=true（renewal 契約值由 useSubscription 提供）
const recentEnd = new Date(Date.now() - 10 * 86400_000).toISOString();

// 過期超過一年的舊值：舊 canExtend 邏輯會藏起續約選項；它自算的錨點
// （2023-04-03）也與契約值不同，能分辨畫面吃的是哪個來源。
const longExpiredEnd = '2023-04-02T15:59:59.999Z';

const RENEWAL = {
  extendAnchorDate: '2024-04-03',
  extendEndDate: '2025-04-02',
  backfillCount: 3,
  backfillAmount: 3600,
  backfillFinalEndDate: '2027-04-02',
  expiredForMonths: 25,
  hasPaidAnyBackfill: false,
  freshForfeitPoints: 100,
  freshForfeitReferrals: 2,
};

function setSubscription(renewal: unknown, hasPendingWithdrawal = false) {
  sub.value = {
    subscriptionData: {
      hasSubscription: false,
      status: 'expired',
      activeUntil: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      renewal,
      hasPendingWithdrawal,
    },
    isLoading: false,
    isValidating: false,
    refresh: sub.refresh,
  };
}

beforeEach(() => {
  setSubscription(RENEWAL);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PaymentCheckout', () => {
  it('自動綁定者：確認卡不顯示推薦碼，且不發 /referrals/validate 請求', async () => {
    const calls = spyFetch();
    seedPendingUser({ referredByCode: 'abc123456', isAutoReferral: true });
    renderPage();

    // 等 localStorage 分支跑完（確認卡出現）
    await waitFor(() => expect(screen.getByText(/姓名：測試使用者/)).toBeTruthy());

    expect(screen.queryByText(/推薦碼：/)).toBeNull();
    expect(screen.queryByText(/推薦人：/)).toBeNull();
    // 網路層抑制：資料擷取早退必須與渲染條件用同一個旗標
    await waitFor(() => {
      expect(calls.filter((u) => u.includes('/referrals/validate'))).toEqual([]);
    });
  });

  it('手動填碼者：確認卡照常顯示推薦碼與快取的推薦人姓名', async () => {
    spyFetch();
    seedPendingUser({
      referredByCode: 'xyz987654',
      isAutoReferral: false,
      referrerName: '王小明',
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/推薦碼：xyz987654/)).toBeTruthy());
    expect(screen.getByText(/推薦人：王小明/)).toBeTruthy();
  });

  it('自動綁定者選新約：推薦碼輸入框 placeholder 不外洩預設碼', async () => {
    spyFetch();
    seedPendingUser({
      referredByCode: 'abc123456',
      isAutoReferral: true,
      subscriptionEndDate: recentEnd,
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    fireEvent.click(screen.getByTestId('renewal-mode-fresh'));

    const input = screen.getByTestId('new-referral-code-input') as HTMLInputElement;
    expect(input.placeholder).toBe('輸入推薦碼');
  });

  it('手動填碼者選新約：placeholder 維持「目前：<碼>」提示', async () => {
    spyFetch();
    seedPendingUser({
      referredByCode: 'xyz987654',
      isAutoReferral: false,
      referrerName: '王小明',
      subscriptionEndDate: recentEnd,
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    fireEvent.click(screen.getByTestId('renewal-mode-fresh'));

    const input = screen.getByTestId('new-referral-code-input') as HTMLInputElement;
    expect(input.placeholder).toBe('目前：xyz987654');
  });
});

// 階段 10（renewal-backfill / AC-2·4·14·17 + Q11 + A14）：補繳制結帳頁。
describe('PaymentCheckout 補繳制', () => {
  function seedLongExpired(overrides: Record<string, unknown> = {}) {
    seedPendingUser({
      referredByCode: 'xyz987654',
      isAutoReferral: false,
      referrerName: '王小明',
      subscriptionEndDate: longExpiredEnd,
      ...overrides,
    });
  }

  it('過期超過一年時續約仍可選且為預設，日期吃契約值非 localStorage 舊值', async () => {
    spyFetch();
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    const extendCard = screen.getByTestId('renewal-mode-extend');

    // A1：續約永遠可選——舊「無法接續原效期」文案不得再出現。
    expect(screen.queryByText(/無法接續原效期/)).toBeNull();
    // isRenewal 一律預設 extend（canExtend 已拆除）。
    expect(extendCard.getAttribute('aria-pressed')).toBe('true');
    // 日期來自契約 renewal（2024-04-03 起、2025-04-02 迄），不是
    // localStorage 舊 subscriptionEndDate 自算的 2023-04-03。
    expect(extendCard.textContent).toContain('2024/04/03');
    expect(extendCard.textContent).toContain('2025/04/02');
    expect(extendCard.textContent).not.toContain('2023/04/03');
  });

  it('extend 選中時揭露補繳筆數、總額、補完到期日與已過期時長', async () => {
    spyFetch();
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    const disclosure = screen.getByTestId('backfill-disclosure');
    expect(disclosure.textContent).toContain('3 筆');
    expect(disclosure.textContent).toMatch(/NT\$\s?3,600/);
    expect(disclosure.textContent).toContain('2027/04/02');
    expect(disclosure.textContent).toContain('已過期 2 年 1 個月');
  });

  it('fresh 選中展開清空揭露具體數字，文案不洩漏預設推薦碼機制', async () => {
    spyFetch();
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    fireEvent.click(screen.getByTestId('renewal-mode-fresh'));

    // A14：事前揭露將清空的具體數字。
    const forfeit = screen.getByTestId('fresh-forfeit-disclosure');
    expect(forfeit.textContent).toContain('100 點');
    expect(forfeit.textContent).toContain('2 位');

    // Q11：對使用者而言「沒填就是沒有上一代」——不得出現「預設推薦碼」，
    // 也不得承諾「維持原推薦關係」（A10 之後留空 = 離開原上代）。
    const section = screen.getByTestId('renewal-mode-section');
    expect(section.textContent).not.toContain('預設推薦碼');
    expect(section.textContent).not.toContain('維持原推薦關係');
  });

  it('hasPendingWithdrawal 時 fresh 卡片停用並提供提領進度入口', async () => {
    spyFetch();
    setSubscription(RENEWAL, true);
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    const freshCard = screen.getByTestId('renewal-mode-fresh') as HTMLButtonElement;

    expect(freshCard.getAttribute('aria-disabled')).toBe('true');
    expect(freshCard.disabled).toBe(true);
    // 說明原因 + 查看提領進度入口（A16 僅改措辭與入口，不做自助取消）。
    const section = screen.getByTestId('renewal-mode-section');
    expect(section.textContent).toContain('審核');
    expect(screen.getByTestId('view-withdrawal-progress')).toBeTruthy();

    // 點停用的 fresh 不改變選擇，extend 維持預設。
    fireEvent.click(freshCard);
    expect(screen.getByTestId('renewal-mode-extend').getAttribute('aria-pressed')).toBe('true');
  });

  it('renewal 缺漏時兩個續費選項停用並顯示重試（AC-17）', async () => {
    spyFetch();
    setSubscription(null);
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    const extendCard = screen.getByTestId('renewal-mode-extend') as HTMLButtonElement;
    const freshCard = screen.getByTestId('renewal-mode-fresh') as HTMLButtonElement;

    expect(extendCard.disabled).toBe(true);
    expect(freshCard.disabled).toBe(true);
    expect(screen.getByText(/暫時無法載入續約資訊/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('renewal-info-retry'));
    expect(sub.refresh).toHaveBeenCalled();
  });
});
