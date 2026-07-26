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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createContext } from 'react';

const showToast = vi.fn();

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

// 10 天前到期：isRenewal=true 且 canExtend=true（照組件的日領域計算）
const recentEnd = new Date(Date.now() - 10 * 86400_000).toISOString();

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
