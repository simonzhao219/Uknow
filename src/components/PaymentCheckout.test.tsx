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
import { formatTwDate, subscriptionLastDay, twDayOf } from '../utils/twDate';

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
  paidBackfillCount: 0,
  paidBackfillAmount: 0,
  freshForfeitPoints: 100,
  freshForfeitReferrals: 2,
};

function setSubscription(
  renewal: unknown,
  hasPendingWithdrawal = false,
  { isLoading = false, lastFetchFailed = false } = {},
) {
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
    isLoading,
    isValidating: false,
    lastFetchFailed,
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
    // Q11 正向面（plan §4 逐字）：必須傳達「這會改變既有推薦關係」——
    // 只驗「不包含」擋不住文案被弱化成首購式說明。
    expect(section.textContent).toContain('選擇新約會重新建立推薦關係');
    expect(section.textContent).toContain('不填則不會有推薦人');
  });

  it('fresh 卡片顯示新約的具體效期迄日（AC-2），不是只講起算規則', async () => {
    spyFetch();
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    const freshCard = screen.getByTestId('renewal-mode-fresh');
    // 今天起算一年的最後一天（鏡射 SQL 的前端預覽）。
    const expected = formatTwDate(subscriptionLastDay(twDayOf(new Date())));
    expect(freshCard.textContent).toContain(expected);
    expect(freshCard.textContent).toMatch(/NT\$\s?1,200/);
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
    // a11y（plan §4）：停用原因用 aria-describedby 錨定到說明文字，
    // 螢幕閱讀器在按鈕上就聽得到「為什麼不能選」。
    expect(freshCard.getAttribute('aria-describedby')).toBe('pending-withdrawal-note');
    expect(document.getElementById('pending-withdrawal-note')).toBeTruthy();
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

  it('續約者註冊資訊預設摺疊成一行摘要，點開後展開明細', async () => {
    spyFetch();
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    // 摺疊態：明細（生日/手機等）不可見，摘要列與編輯鈕在。
    expect(screen.queryByText(/生日：1990-01-01/)).toBeNull();
    expect(screen.getByTestId('edit-profile-button')).toBeTruthy();

    fireEvent.click(screen.getByTestId('profile-summary-toggle'));
    expect(screen.getByText(/生日：1990-01-01/)).toBeTruthy();
    expect(screen.getByText(/推薦人：王小明/)).toBeTruthy();
  });

  it('renewal 載入中顯示載入態而非錯誤文案（四狀態表第 2 列）', async () => {
    spyFetch();
    setSubscription(null, false, { isLoading: true });
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    // 還在抓不是錯誤：skeleton 在、AC-17 的錯誤文案與重試不得出現。
    expect(screen.getByTestId('renewal-info-loading')).toBeTruthy();
    expect(screen.queryByText(/暫時無法載入續約資訊/)).toBeNull();
    expect(screen.queryByTestId('renewal-info-retry')).toBeNull();
  });

  it('剛過期未付過且只差 1 筆的退化分支不出現補繳語彙但含到期日', async () => {
    spyFetch();
    setSubscription({
      ...RENEWAL,
      extendEndDate: '2025-04-02',
      backfillCount: 1,
      backfillAmount: 1200,
      backfillFinalEndDate: '2025-04-02',
      expiredForMonths: 3,
    });
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    const disclosure = screen.getByTestId('backfill-disclosure');
    // plan §4 退化分支：最常見的「剛過期」一般續約不得被說成「補繳」。
    expect(disclosure.textContent).not.toContain('補繳');
    expect(disclosure.textContent).toContain('2025/04/02');
    expect(disclosure.textContent).toMatch(/NT\$\s?1,200/);
  });
});

// 階段 11（renewal-backfill / AC-7 前端面 + AC-15）：補繳進度與二次確認。
describe('PaymentCheckout 補繳進度與付款確認', () => {
  function seedLongExpired(overrides: Record<string, unknown> = {}) {
    seedPendingUser({
      referredByCode: 'xyz987654',
      isAutoReferral: false,
      referrerName: '王小明',
      subscriptionEndDate: longExpiredEnd,
      ...overrides,
    });
  }

  // 已付 1 筆補繳後的契約狀態：錨點前進一年、還差 2 筆。
  const RENEWAL_IN_PROGRESS = {
    ...RENEWAL,
    extendAnchorDate: '2025-04-03',
    extendEndDate: '2026-04-02',
    backfillCount: 2,
    backfillAmount: 2400,
    hasPaidAnyBackfill: true,
    paidBackfillCount: 1,
    paidBackfillAmount: 1200,
    freshForfeitPoints: 0,
    freshForfeitReferrals: 0,
  };

  it('已付過補繳時顯示已補至日期與剩餘筆數進度', async () => {
    spyFetch();
    setSubscription(RENEWAL_IN_PROGRESS);
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    const progress = screen.getByTestId('backfill-progress');
    // 已補至 = extendAnchorDate − 1 天（目前實際效期迄日；不用迄日反推
    // 一年——迄日落在 02-29 時會少一天）。
    expect(progress.textContent).toContain('已補至 2025/04/02');
    expect(progress.textContent).toContain('還差 2 筆');
  });

  it('選擇新約時補繳進度收於續約卡內，確認框仍唸出已付數字', async () => {
    spyFetch();
    setSubscription(RENEWAL_IN_PROGRESS);
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    // extend 選中時進度可見（plan §4：選項卡片內顯示）。
    expect(screen.getByTestId('backfill-progress')).toBeTruthy();

    // 切到 fresh：進度隨續約卡收合——關鍵資訊由 AC-15 確認框接手，
    // 付款前仍會唸出已付筆數/金額/已補至日期，決策點不漏。
    fireEvent.click(screen.getByTestId('renewal-mode-fresh'));
    expect(screen.queryByTestId('backfill-progress')).toBeNull();

    fireEvent.click(screen.getByTestId('payuni-pay-button'));
    const dialog = await screen.findByTestId('fresh-confirm-dialog');
    expect(dialog.textContent).toContain('付款 1 筆');
    expect(dialog.textContent).toContain('已補至 2025/04/02');
  });

  it('曾有進度、背景重整失敗時顯示進度暫時無法讀取並可重試（四狀態表第 4 列）', async () => {
    spyFetch();
    setSubscription(RENEWAL_IN_PROGRESS, false, { lastFetchFailed: true });
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    // 不靜默降級：舊進度照常顯示，但明講可能過期並給重試。
    const stale = screen.getByTestId('backfill-progress-stale');
    expect(stale.textContent).toContain('進度暫時無法讀取');
    expect(screen.getByTestId('backfill-progress')).toBeTruthy();

    fireEvent.click(screen.getByTestId('backfill-progress-refresh'));
    expect(sub.refresh).toHaveBeenCalled();
  });

  it('未付過補繳者背景重整失敗時沿用舊資料，不另外插提示', async () => {
    spyFetch();
    setSubscription(RENEWAL, false, { lastFetchFailed: true });
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    // plan §4 第 4 列只在 hasPaidAnyBackfill 時不靜默；其餘沿用舊資料即可。
    expect(screen.queryByTestId('backfill-progress-stale')).toBeNull();
  });

  it('renewal 缺漏的退化分支不出現補繳語彙，但原到期日仍可見', async () => {
    spyFetch();
    setSubscription(null);
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    expect(screen.queryByText(/已補至/)).toBeNull();
    expect(screen.queryByText(/還差/)).toBeNull();
    expect(screen.queryByText(/補繳/)).toBeNull();
    // 標頭的「您的會籍已於 <日期> 到期」不依賴 renewal，退化時仍在。
    expect(screen.getByText(/到期/)).toBeTruthy();
  });

  it('fresh 有可清空資產時按付款先彈確認，未確認不得送單', async () => {
    const calls = spyFetch();
    setSubscription(RENEWAL); // freshForfeitPoints 100 / referrals 2
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    // 切換選項本身不彈窗（AC-15：順序是卡片內揭露 → 付款時確認）。
    fireEvent.click(screen.getByTestId('renewal-mode-fresh'));
    expect(screen.queryByTestId('fresh-confirm-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('payuni-pay-button'));
    const dialog = await screen.findByTestId('fresh-confirm-dialog');
    // 內容含將清空的具體數字。
    expect(dialog.textContent).toContain('100 點');
    expect(dialog.textContent).toContain('2 位');
    // 未點確認前不得送單。
    expect(calls.filter((u) => u.includes('/payuni/prepare'))).toEqual([]);

    fireEvent.click(screen.getByTestId('fresh-confirm-action'));
    await waitFor(() => {
      expect(calls.filter((u) => u.includes('/payuni/prepare')).length).toBe(1);
    });
  });

  it('補繳中途改選 fresh 的確認含效期不退還警語', async () => {
    const calls = spyFetch();
    setSubscription(RENEWAL_IN_PROGRESS); // hasPaidAnyBackfill=true、無可清空資產
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    fireEvent.click(screen.getByTestId('renewal-mode-fresh'));
    fireEvent.click(screen.getByTestId('payuni-pay-button'));

    const dialog = await screen.findByTestId('fresh-confirm-dialog');
    // AC-15（plan §4 範本）：唸出本輪已付的具體筆數與金額，不是只有
    // 「已付」二字——字面斷言擋不住數字缺漏。
    expect(dialog.textContent).toContain('付款 1 筆');
    expect(dialog.textContent).toMatch(/NT\$\s?1,200/);
    expect(dialog.textContent).toContain('已補至 2025/04/02');
    expect(dialog.textContent).toContain('退還');
    // 零值子句不唸：這個情境沒有可清空資產，不得出現「0 點」贅句。
    expect(dialog.textContent).not.toContain('0 點');
    expect(calls.filter((u) => u.includes('/payuni/prepare'))).toEqual([]);
  });

  it('fresh 無資產且未付過補繳時，付款不需二次確認直接送單', async () => {
    const calls = spyFetch();
    setSubscription({
      ...RENEWAL,
      backfillCount: 1,
      backfillAmount: 1200,
      freshForfeitPoints: 0,
      freshForfeitReferrals: 0,
    });
    seedLongExpired();
    renderPage();

    await waitFor(() => expect(screen.getByTestId('renewal-mode-section')).toBeTruthy());
    fireEvent.click(screen.getByTestId('renewal-mode-fresh'));
    fireEvent.click(screen.getByTestId('payuni-pay-button'));

    expect(screen.queryByTestId('fresh-confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(calls.filter((u) => u.includes('/payuni/prepare')).length).toBe(1);
    });
  });
});
