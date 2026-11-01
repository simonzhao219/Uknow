// @vitest-environment jsdom
//
// admin 入口與待處理 badge。
//
// 這支測試釘三件事：
//   1. **入口要看得見。** admin 入口原本只藏在頭像下拉裡（違反
//      ui-ux-guidelines §3 明文），等於每次要處理提領都得先點兩下才找得到。
//   2. **badge 只在真的有事時出現。** 常駐一個「0」會訓練人忽略它，
//      那個 badge 之後就再也叫不動任何人了。
//   3. **非 admin 不發那個請求。** 一般會員每次載入頁面都打一次
//      `/admin/withdrawals` 只會拿到 403——白費一次往返，還會在後端
//      日誌裡製造一堆假的權限告警。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { flags, UserCtx, apiRequestJson, funnelLogout, signOut, clearAuthHint } = await vi.hoisted(
  async () => {
    const { createContext } = await import('react');
    const { vi: v } = await import('vitest');
    return {
      flags: { rewardSystem: true } as Record<string, boolean>,
      UserCtx: createContext<any>({ isLoggedIn: true, isAdmin: false, user: null }),
      apiRequestJson: v.fn(),
      funnelLogout: { logout: v.fn(async () => {}), isLoggingOut: false },
      signOut: v.fn(async (_opts?: unknown) => ({ error: null as unknown })),
      clearAuthHint: v.fn(),
    };
  },
);

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../contexts/FeatureContext', () => ({
  useFeatures: () => ({
    features: flags,
    isFeatureEnabled: (key: string) => flags[key] ?? false,
    refreshFeatures: () => {},
    isLoading: false,
  }),
}));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ auth: { signOut } }),
}));
vi.mock('../hooks/useFunnelLogout', () => ({ useFunnelLogout: () => funnelLogout }));
vi.mock('../utils/authHint', () => ({ clearAuthHint: () => clearAuthHint() }));
vi.mock('../utils/apiClient', () => ({
  apiRequestJson,
  buildApiUrl: (p: string) => `https://api.test${p}`,
}));

import { Navbar } from './Navbar';

afterEach(() => {
  cleanup();
  apiRequestJson.mockReset();
  vi.clearAllMocks();
  signOut.mockImplementation(async () => ({ error: null }));
});

function renderNav(isAdmin: boolean) {
  return render(
    <UserCtx.Provider
      value={{
        user: { name: '管理員', email: 'a@b.c' },
        setUser: () => {},
        isLoggedIn: true,
        isAdmin,
      }}
    >
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </UserCtx.Provider>,
  );
}

function statsResponse(pending: number) {
  // 專用的輕量端點：只有兩個數字，不含列表也不含任何簽名 URL。
  return { success: true, data: { pendingCount: pending, pendingAmount: 0 } };
}

describe('Navbar', () => {
  it('管理員看得到平台管理入口，不必先展開頭像選單', async () => {
    apiRequestJson.mockResolvedValue(statsResponse(0));
    renderNav(true);
    expect(await screen.findByRole('link', { name: /平台管理/ })).toBeTruthy();
  });

  it('有待處理提領時入口以小圓點標示，筆數在可及名稱裡', async () => {
    apiRequestJson.mockResolvedValue(statsResponse(3));
    renderNav(true);
    expect(await screen.findByRole('link', { name: /平台管理.*待處理 3 筆/ })).toBeTruthy();
    expect(screen.queryByText('3')).toBeNull();
  });

  it('待處理為 0 時不顯示空 badge', async () => {
    apiRequestJson.mockResolvedValue(statsResponse(0));
    renderNav(true);
    await screen.findByRole('link', { name: /平台管理/ });
    expect(screen.queryByText('0')).toBeNull();
  });

  it('非管理員不發待處理筆數的請求', async () => {
    renderNav(false);
    await waitFor(() => expect(apiRequestJson).not.toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /平台管理/ })).toBeNull();
  });
});

// ------------------------------------------------------------
// 頁首五版本（T1 auth-state-trust，plan §4.1、§4.3）
// ------------------------------------------------------------

const COMPLETE = { name: '王小明', phone: '0912345678', birthDate: '1990-01-01' };

function renderView(ctx: Record<string, unknown>, path = '/') {
  const value = { user: null, setUser: () => {}, isLoggedIn: false, isAdmin: false, ...ctx };
  const ui = (v: Record<string, unknown>) => (
    <UserCtx.Provider value={v}>
      <MemoryRouter initialEntries={[path]}>
        <Navbar />
      </MemoryRouter>
    </UserCtx.Provider>
  );
  const r = render(ui(value));
  return { ...r, update: (next: Record<string, unknown>) => r.rerender(ui({ ...value, ...next })) };
}

const nav = () => screen.getByRole('navigation');
const navButtons = () => Array.from(nav().querySelectorAll('button'));

describe('Navbar 頁首五版本', () => {
  it('guest：登入與立即刊登', () => {
    renderView({ authView: 'guest' });
    expect(screen.getByRole('link', { name: '登入' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '立即刊登' })).toBeTruthy();
  });

  it('placeholder：右側只有一個 aria-hidden 的固定槽，沒有任何按鈕或連結', () => {
    renderView({ authView: 'placeholder', authState: 'unknown' }, '/payment/checkout');
    expect(navButtons()).toHaveLength(0);
    // 只剩 logo 連結
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const slot = screen.getByTestId('auth-slot-placeholder');
    expect(slot.getAttribute('aria-hidden')).toBe('true');
  });

  it('member-pending：頭像鈕帶提示首字且 aria-busy，選單在確認前只列登出', () => {
    renderView({ authView: 'member-pending', authState: 'unknown', hintInitial: '王' });
    const trigger = screen.getByRole('button', { name: '開啟會員選單' });
    expect(trigger.getAttribute('aria-busy')).toBe('true');
    expect(trigger.textContent).toContain('王');
    expect(screen.queryByText('會員中心')).toBeNull();
    expect(screen.queryByRole('link', { name: '登入' })).toBeNull();
  });

  it('member：頭像鈕取 user 姓名首字、不再 aria-busy', () => {
    renderView({
      authView: 'member',
      authState: 'authenticated',
      isLoggedIn: true,
      user: { ...COMPLETE },
    });
    const trigger = screen.getByRole('button', { name: '開啟會員選單' });
    expect(trigger.hasAttribute('aria-busy')).toBe(false);
    expect(trigger.textContent).toContain('王');
  });

  it('member-pending 轉 member 時頭像鈕是同一個 DOM 節點', () => {
    const r = renderView({ authView: 'member-pending', authState: 'unknown', hintInitial: '王' });
    const before = screen.getByRole('button', { name: '開啟會員選單' });
    r.update({ authView: 'member', authState: 'authenticated', isLoggedIn: true, user: COMPLETE });
    expect(screen.getByRole('button', { name: '開啟會員選單' })).toBe(before);
  });

  it('funnel 在漏斗路由：只有一顆「登出」button', () => {
    renderView(
      { authView: 'funnel', isFunnel: true, nextFunnelRoute: '/payment/checkout' },
      '/payment/checkout',
    );
    const buttons = navButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('登出');
    expect(screen.queryByRole('link', { name: '登入' })).toBeNull();
    expect(screen.queryByRole('link', { name: '立即刊登' })).toBeNull();
    expect(screen.queryByRole('button', { name: '開啟會員選單' })).toBeNull();
    expect(screen.queryByRole('link', { name: /繼續完成註冊|查看開通進度/ })).toBeNull();
  });

  it('funnel 在非漏斗路由：繼續完成註冊連到下一步，旁邊有可及名稱為登出的按鈕', () => {
    renderView({ authView: 'funnel', isFunnel: true, nextFunnelRoute: '/payment/checkout' }, '/');
    const cta = screen.getByRole('link', { name: '繼續完成註冊' });
    expect(cta.getAttribute('href')).toBe('/payment/checkout');
    expect(screen.getByRole('button', { name: '登出' })).toBeTruthy();
  });

  it('funnel 已付款待開通：查看開通進度連到帶 tradeNo 的結果頁', () => {
    renderView(
      { authView: 'funnel', isFunnel: true, nextFunnelRoute: '/payment/result?tradeNo=T1' },
      '/',
    );
    const cta = screen.getByRole('link', { name: '查看開通進度' });
    expect(cta.getAttribute('href')).toBe('/payment/result?tradeNo=T1');
    expect(cta.hasAttribute('aria-disabled')).toBe(false);
  });

  it('funnel 只有提示時依 next 畫暫用連結；結果頁缺 tradeNo 前 aria-disabled', () => {
    renderView({ authView: 'funnel', authState: 'unknown', hintNext: 'result' }, '/');
    const cta = screen.getByRole('link', { name: '查看開通進度' });
    expect(cta.getAttribute('aria-disabled')).toBe('true');
  });

  it('funnel 只有提示且下一步是結帳頁時連結直接可用', () => {
    renderView({ authView: 'funnel', authState: 'unknown', hintNext: 'checkout' }, '/');
    const cta = screen.getByRole('link', { name: '繼續完成註冊' });
    expect(cta.getAttribute('href')).toBe('/payment/checkout');
    expect(cta.hasAttribute('aria-disabled')).toBe(false);
  });

  it('funnel 提示版轉確認版時 CTA 與登出是同一個 DOM 節點，只換 href', () => {
    const r = renderView({ authView: 'funnel', authState: 'unknown', hintNext: 'result' }, '/');
    const cta = screen.getByRole('link', { name: '查看開通進度' });
    const logout = screen.getByRole('button', { name: '登出' });
    r.update({
      authState: 'authenticated',
      isFunnel: true,
      nextFunnelRoute: '/payment/result?tradeNo=T9',
    });
    expect(screen.getByRole('link', { name: '查看開通進度' })).toBe(cta);
    expect(cta.getAttribute('href')).toBe('/payment/result?tradeNo=T9');
    expect(cta.hasAttribute('aria-disabled')).toBe(false);
    expect(screen.getByRole('button', { name: '登出' })).toBe(logout);
  });

  it('funnel 的登出走 useFunnelLogout', () => {
    renderView({ authView: 'funnel', isFunnel: true }, '/payment/checkout');
    fireEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(funnelLogout.logout).toHaveBeenCalledTimes(1);
  });

  it('funnel 登出鈕自帶 aria-disabled 的停用外觀（基底不再提供）', () => {
    renderView({ authView: 'funnel', isFunnel: true, nextFunnelRoute: '/payment/result' }, '/');
    const logout = screen.getByRole('button', { name: '登出' }).className.split(/\s+/);
    expect(logout).toContain('aria-disabled:pointer-events-none');
    expect(logout).toContain('aria-disabled:opacity-50');
    // 缺 tradeNo 的結果頁 CTA 同樣自帶停用外觀。
    const cta = screen.getByRole('link', { name: '查看開通進度' }).className.split(/\s+/);
    expect(cta).toContain('aria-disabled:pointer-events-none');
    expect(cta).toContain('aria-disabled:opacity-50');
  });

  it('funnel 登出進行中為 aria-disabled（不用原生 disabled）', () => {
    funnelLogout.isLoggingOut = true;
    try {
      renderView({ authView: 'funnel', isFunnel: true }, '/payment/checkout');
      const btn = screen.getByRole('button', { name: '登出' });
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.hasAttribute('disabled')).toBe(false);
    } finally {
      funnelLogout.isLoggingOut = false;
    }
  });

  it('authView 缺值（舊 context）時依 isLoggedIn 回落', () => {
    renderView({ isLoggedIn: false });
    expect(screen.getByRole('link', { name: '登入' })).toBeTruthy();
  });
});

describe('Navbar 會員登出', () => {
  async function clickMemberLogout() {
    renderView({
      authView: 'member',
      authState: 'authenticated',
      isLoggedIn: true,
      user: COMPLETE,
    });
    const trigger = screen.getByRole('button', { name: '開啟會員選單' });
    await act(async () => {
      fireEvent.keyDown(trigger, { key: 'Enter' });
    });
    const item = await screen.findByRole('menuitem', { name: /登出/ });
    await act(async () => {
      fireEvent.click(item);
    });
  }

  it('登出時清首繪提示', async () => {
    await clickMemberLogout();
    await waitFor(() => expect(clearAuthHint).toHaveBeenCalled());
  });

  it('global 登出失敗時補 local 登出', async () => {
    signOut.mockImplementation(async (opts?: unknown) =>
      opts ? { error: null } : { error: new Error('network') },
    );
    await clickMemberLogout();
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }));
  });
});
