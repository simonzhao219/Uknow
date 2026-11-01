// @vitest-environment jsdom
//
// 註冊中途的登出（D2、D3、E5、plan §4.2）：頁首「登出」與結帳頁首購者「登出，稍後再付款」
// 共用這一支——導向、toast、清理一致。
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { UserCtx, navigate, showToast, auth, clearAuthHint } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  const { vi: v } = await import('vitest');
  return {
    UserCtx: createContext<any>({}),
    navigate: v.fn(),
    showToast: v.fn(),
    auth: {
      signOut: v.fn(),
      getSession: v.fn(),
    },
    clearAuthHint: v.fn(),
  };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../components/notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast }),
}));
vi.mock('../utils/supabase/client', () => ({ createClient: () => ({ auth }) }));
vi.mock('../utils/authHint', () => ({ clearAuthHint: () => clearAuthHint() }));

import { useFunnelLogout } from './useFunnelLogout';

const UNPAID = {
  id: 'u1',
  name: '王小明',
  phone: '0912345678',
  birthDate: '1990-01-01',
  registrationStep: 1,
  accountStatus: 'expired',
  subscriptionEndDate: null,
};
const ACTIVATING = {
  ...UNPAID,
  registrationStep: 2,
  paidAwaitingActivation: true,
  lastTradeNo: 'T1',
};

/** 假的 supabase session：global 成功或 local 都會清掉本機 session。 */
let localSession: unknown;
function wireAuth(globalResult: 'ok' | 'error' | 'throw') {
  localSession = { access_token: 'tok' };
  auth.getSession.mockImplementation(async () => ({ data: { session: localSession } }));
  auth.signOut.mockImplementation(async (opts?: { scope?: string }) => {
    if (opts?.scope === 'local') {
      localSession = null;
      return { error: null };
    }
    if (globalResult === 'throw') throw new TypeError('Failed to fetch');
    if (globalResult === 'error') return { error: new Error('network') };
    localSession = null;
    return { error: null };
  });
}

function setup(ctx: Record<string, unknown>) {
  const setUser = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UserCtx.Provider value={{ setUser, ...ctx }}>{children}</UserCtx.Provider>
  );
  return { setUser, hook: renderHook(() => useFunnelLogout(), { wrapper }) };
}

beforeEach(() => {
  localStorage.clear();
  wireAuth('ok');
});
afterEach(() => vi.clearAllMocks());

describe('useFunnelLogout', () => {
  it('登出後清 user、pendingUser、提示，導 /login 並提示可回來繼續註冊', async () => {
    localStorage.setItem('pendingUser', '{}');
    const { setUser, hook } = setup({ user: UNPAID });
    await act(async () => {
      await hook.result.current.logout();
    });
    expect(auth.signOut).toHaveBeenCalledWith();
    expect(setUser).toHaveBeenCalledWith(null);
    expect(localStorage.getItem('pendingUser')).toBeNull();
    expect(clearAuthHint).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('您已登出，之後用同一帳號登入即可繼續完成註冊', 'info');
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('已付款待開通者的 toast 說明付款已收到', async () => {
    const { hook } = setup({ user: ACTIVATING });
    await act(async () => {
      await hook.result.current.logout();
    });
    expect(showToast).toHaveBeenCalledWith('付款已收到，登入後會自動開通', 'info');
  });

  it('/profile 回來前只有提示時依提示的目的地判斷待開通', async () => {
    const { hook } = setup({ user: null, hintNext: 'result' });
    await act(async () => {
      await hook.result.current.logout();
    });
    expect(showToast).toHaveBeenCalledWith('付款已收到，登入後會自動開通', 'info');
  });

  it.each(['error', 'throw'] as const)(
    'global 登出失敗（%s）時補 local 登出、本機 session 清空並照樣導頁',
    async (mode) => {
      wireAuth(mode);
      const { setUser, hook } = setup({ user: UNPAID });
      await act(async () => {
        await hook.result.current.logout();
      });
      expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      const { data } = await auth.getSession();
      expect(data.session).toBeNull();
      expect(setUser).toHaveBeenCalledWith(null);
      expect(clearAuthHint).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('已登出此裝置', 'info');
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    },
  );

  it('連點只觸發一次登出，進行中 isLoggingOut 為 true', async () => {
    let release!: () => void;
    auth.signOut.mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ error: null });
        }),
    );
    const { hook } = setup({ user: UNPAID });
    let first!: Promise<void>;
    await act(async () => {
      first = hook.result.current.logout();
      void hook.result.current.logout();
    });
    expect(hook.result.current.isLoggingOut).toBe(true);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await first;
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
