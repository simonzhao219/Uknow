// @vitest-environment jsdom
//
// useAuthBootstrap：冷啟動／事件／重驗的狀態機與首繪提示（T1 auth-state-trust，plan §2.2、§2.5）。
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_HINT_KEY, readAuthHint, writeAuthHint } from '../utils/authHint';
import type { ProfileFetchResult } from '../utils/fetchProfile';
import { type AuthBootstrapDeps, useAuthBootstrap } from './useAuthBootstrap';

const UID_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const UID_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const COMPLETE = { name: '王小明', phone: '0912345678', birthDate: '1990-01-01' };
const MEMBER = {
  id: UID_A,
  ...COMPLETE,
  registrationStep: 3,
  accountStatus: 'active',
  subscriptionEndDate: '2027-01-01',
  isAdmin: false,
};
const UNPAID = {
  id: UID_A,
  ...COMPLETE,
  registrationStep: 1,
  accountStatus: 'expired',
  subscriptionEndDate: null,
  isAdmin: false,
};
const INCOMPLETE = {
  id: UID_A,
  name: null,
  phone: null,
  birthDate: null,
  registrationStep: 0,
  accountStatus: 'expired',
  subscriptionEndDate: null,
  isAdmin: false,
};

const session = (uid: string) => ({ access_token: `tok-${uid}`, user: { id: uid } });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** 可控的 supabase 與 fetchProfile。 */
function setup(opts: { session?: ReturnType<typeof session> | null; pathname?: string } = {}) {
  let authCb: (event: string, s: unknown) => void = () => {};
  const sessionGate = deferred<{ data: { session: unknown } }>();
  const pendingFetches: Array<{
    userId: string;
    force?: boolean;
    resolve: (r: ProfileFetchResult) => void;
  }> = [];
  let currentSession = opts.session === undefined ? session(UID_A) : opts.session;

  const deps = {
    supabase: {
      auth: {
        getSession: vi.fn(() => sessionGate.promise),
        onAuthStateChange: vi.fn((cb: (event: string, s: unknown) => void) => {
          authCb = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        signOut: vi.fn(async () => ({ error: null })),
      },
    },
    fetchProfile: vi.fn(
      (_token: string, o: { userId: string; force?: boolean }) =>
        new Promise<ProfileFetchResult>((resolve) => {
          pendingFetches.push({ userId: o.userId, force: o.force, resolve });
        }),
    ),
    clearInflight: vi.fn(),
    onSignedOut: vi.fn(),
    onAccountSwitched: vi.fn(),
    onIncompleteProfile: vi.fn(),
    getPathname: () => opts.pathname ?? '/',
    storage: window.localStorage,
  };

  const hook = renderHook(() => useAuthBootstrap(deps as unknown as AuthBootstrapDeps));

  return {
    deps,
    hook,
    /** 冷啟動 getSession resolve。 */
    resolveSession: async () => {
      await act(async () => {
        sessionGate.resolve({ data: { session: currentSession } });
      });
    },
    /** 之後 refreshUser 呼叫 getSession 時回的 session。 */
    setSession: (s: ReturnType<typeof session> | null) => {
      currentSession = s;
      deps.supabase.auth.getSession.mockImplementation(async () => ({
        data: { session: currentSession },
      }));
    },
    emit: async (event: string, s: unknown) => {
      await act(async () => {
        authCb(event, s);
      });
    },
    /** resolve 最早一筆尚未回應的 /profile。 */
    respond: async (r: ProfileFetchResult) => {
      await act(async () => {
        pendingFetches.shift()?.resolve(r);
      });
    },
    pendingFetches,
  };
}

const ok = (profile: unknown): ProfileFetchResult => ({ kind: 'ok', profile });

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAuthBootstrap 冷啟動', () => {
  it('判定前 authState 為 unknown 且 isLoadingUser 為 true', () => {
    const { hook } = setup();
    expect(hook.result.current.authState).toBe('unknown');
    expect(hook.result.current.isLoadingUser).toBe(true);
  });

  it('首個 render 即同步讀到本機提示', () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const { hook } = setup();
    expect(hook.result.current.hint).toMatchObject({ kind: 'member', initial: '王' });
  });

  it('無 session 時轉 anonymous、清提示、不打 /profile、不呼叫 onSignedOut', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup({ session: null });
    await t.resolveSession();
    expect(t.hook.result.current.authState).toBe('anonymous');
    expect(t.hook.result.current.isLoadingUser).toBe(false);
    expect(t.hook.result.current.hint).toBeNull();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(t.deps.fetchProfile).not.toHaveBeenCalled();
    expect(t.deps.onSignedOut).not.toHaveBeenCalled();
  });

  it('會員 /profile ok 後轉 authenticated、set user、提示寫成 member', async () => {
    const t = setup();
    await t.resolveSession();
    expect(t.deps.fetchProfile).toHaveBeenCalledWith('tok-' + UID_A, { userId: UID_A });
    await t.respond(ok(MEMBER));
    const r = t.hook.result.current;
    expect(r.authState).toBe('authenticated');
    expect(r.isLoadingUser).toBe(false);
    expect(r.user).toEqual(MEMBER);
    expect(r.isFunnel).toBe(false);
    expect(readAuthHint(window.localStorage)).toMatchObject({
      kind: 'member',
      initial: '王',
      uid8: 'aaaaaaaa',
      next: null,
    });
  });

  it('/profile 5xx 時轉 anonymous 但保留提示', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await t.resolveSession();
    await t.respond({ kind: 'transient' });
    expect(t.hook.result.current.authState).toBe('anonymous');
    expect(t.hook.result.current.outcome).toBe('transient');
    expect(t.hook.result.current.user).toBeNull();
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'member' });
  });

  it('/profile 401 時登出並清提示', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await t.resolveSession();
    await t.respond({ kind: 'unauthorized', status: 401 });
    expect(t.deps.supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.authState).toBe('anonymous');
    expect(t.hook.result.current.outcome).toBe('signedOut');
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  it('/profile 401 後 global 登出失敗時補 local 登出、不留未處理例外', async () => {
    const t = setup();
    t.deps.supabase.auth.signOut.mockImplementation(async (opts?: { scope?: string }) => {
      if (opts?.scope === 'local') return { error: null };
      throw new TypeError('Failed to fetch');
    });
    await t.resolveSession();
    await t.respond({ kind: 'unauthorized', status: 401 });
    await waitFor(() =>
      expect(t.deps.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }),
    );
    expect(t.hook.result.current.authState).toBe('anonymous');
  });

  it('資料未齊（F1）時 isFunnel、user 維持 null、提示寫成 funnel 並導完善資料頁', async () => {
    const t = setup({ pathname: '/' });
    await t.resolveSession();
    await t.respond(ok(INCOMPLETE));
    const r = t.hook.result.current;
    expect(r.authState).toBe('authenticated');
    expect(r.user).toBeNull();
    expect(r.funnelProfile).toEqual(INCOMPLETE);
    expect(r.isFunnel).toBe(true);
    expect(r.nextFunnelRoute).toBe('/auth/complete-profile');
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'funnel', next: 'profile' });
    expect(t.deps.onIncompleteProfile).toHaveBeenCalledTimes(1);
  });

  it('資料未齊但已在豁免路由時不呼叫 onIncompleteProfile', async () => {
    const t = setup({ pathname: '/auth/complete-profile' });
    await t.resolveSession();
    await t.respond(ok(INCOMPLETE));
    expect(t.deps.onIncompleteProfile).not.toHaveBeenCalled();
  });

  it('首購未付款（F2）時 set user、isFunnel、提示寫成 funnel／checkout', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(UNPAID));
    const r = t.hook.result.current;
    expect(r.user).toEqual(UNPAID);
    expect(r.isFunnel).toBe(true);
    expect(r.nextFunnelRoute).toBe('/payment/checkout');
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'funnel', next: 'checkout' });
  });

  it('INITIAL_SESSION 無 session 時轉 anonymous 並清提示', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await t.emit('INITIAL_SESSION', null);
    expect(t.hook.result.current.authState).toBe('anonymous');
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });
});

describe('useAuthBootstrap 換帳號（S11）', () => {
  it('session 的 uid 與提示不符時立即清提示，不等 /profile', async () => {
    writeAuthHint({ kind: 'member', initial: '甲', uid8: 'aaaaaaaa', next: null });
    const t = setup({ session: session(UID_B) });
    await t.resolveSession();
    expect(t.hook.result.current.authState).toBe('unknown');
    expect(t.hook.result.current.hint).toBeNull();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  it('session 確認 uid 之前提示不算數（hintVerified 為 false），相符後為 true', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    expect(t.hook.result.current.hint).not.toBeNull();
    expect(t.hook.result.current.hintVerified).toBe(false);
    await t.resolveSession();
    expect(t.hook.result.current.hintVerified).toBe(true);
  });

  it('uid 不符時 hintVerified 維持 false', async () => {
    writeAuthHint({ kind: 'member', initial: '甲', uid8: 'aaaaaaaa', next: null });
    const t = setup({ session: session(UID_B) });
    await t.resolveSession();
    expect(t.hook.result.current.hintVerified).toBe(false);
  });

  it('SIGNED_IN 為另一個 uid 時清提示、轉 unknown 並載入新帳號', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    await t.emit('SIGNED_IN', session(UID_B));
    expect(t.hook.result.current.authState).toBe('unknown');
    expect(t.hook.result.current.user).toBeNull();
    expect(t.hook.result.current.hint).toBeNull();
    expect(t.deps.clearInflight).toHaveBeenCalled();
    expect(t.deps.fetchProfile).toHaveBeenLastCalledWith('tok-' + UID_B, { userId: UID_B });
    await t.respond(ok({ ...MEMBER, id: UID_B, name: '乙' }));
    expect(readAuthHint(window.localStorage)).toMatchObject({ initial: '乙', uid8: 'bbbbbbbb' });
  });

  it('SIGNED_IN 為另一個 uid 時呼叫 onAccountSwitched，不呼叫 onSignedOut', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    expect(t.deps.onAccountSwitched).not.toHaveBeenCalled();
    await t.emit('SIGNED_IN', session(UID_B));
    expect(t.deps.onAccountSwitched).toHaveBeenCalledTimes(1);
    expect(t.deps.onSignedOut).not.toHaveBeenCalled();
  });

  it('首次登入與同 uid 重播都不呼叫 onAccountSwitched', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    await t.emit('SIGNED_IN', session(UID_A));
    expect(t.deps.onAccountSwitched).not.toHaveBeenCalled();
  });

  it('同 uid 的 SIGNED_IN 重播不打 /profile、狀態不變', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    const before = t.hook.result.current;
    await t.emit('SIGNED_IN', session(UID_A));
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.authState).toBe('authenticated');
    expect(t.hook.result.current.user).toBe(before.user);
  });

  it('冷啟動 /profile 進行中時同 uid 的 SIGNED_IN 不重打', async () => {
    const t = setup();
    await t.resolveSession();
    await t.emit('SIGNED_IN', session(UID_A));
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(1);
  });
});

describe('useAuthBootstrap 登出', () => {
  it('SIGNED_OUT 時清 user、清提示、清 in-flight、呼叫 onSignedOut 一次', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    await t.emit('SIGNED_OUT', null);
    const r = t.hook.result.current;
    expect(r.user).toBeNull();
    expect(r.authState).toBe('anonymous');
    expect(r.isLoadingUser).toBe(false);
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(t.deps.clearInflight).toHaveBeenCalled();
    expect(t.deps.onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('登出後晚到的冷啟動 /profile 結果被丟棄', async () => {
    const t = setup();
    await t.resolveSession();
    await t.emit('SIGNED_OUT', null);
    await t.respond(ok(MEMBER));
    expect(t.hook.result.current.user).toBeNull();
    expect(t.hook.result.current.authState).toBe('anonymous');
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  it('登出後晚到的 refreshUser 結果被丟棄', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    t.setSession(session(UID_A));
    let refreshed: Promise<unknown> = Promise.resolve();
    await act(async () => {
      refreshed = t.hook.result.current.refreshUser();
    });
    await waitFor(() => expect(t.pendingFetches).toHaveLength(1));
    await t.emit('SIGNED_OUT', null);
    await t.respond(ok({ ...MEMBER, name: '復活' }));
    await expect(refreshed).resolves.toBeNull();
    expect(t.hook.result.current.user).toBeNull();
  });
});

describe('useAuthBootstrap 背景重驗與外部更新', () => {
  it('refreshUser 以 force 重抓、更新 user、不轉 unknown、不寫 localStorage.user', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    t.setSession(session(UID_A));
    const states: string[] = [];
    let refreshed: Promise<unknown> = Promise.resolve();
    await act(async () => {
      refreshed = t.hook.result.current.refreshUser();
    });
    states.push(t.hook.result.current.authState);
    await waitFor(() => expect(t.pendingFetches).toHaveLength(1));
    expect(t.pendingFetches[0].force).toBe(true);
    await t.respond(ok({ ...MEMBER, name: '王大明' }));
    await expect(refreshed).resolves.toMatchObject({ name: '王大明' });
    expect(states).toEqual(['authenticated']);
    expect(t.hook.result.current.user.name).toBe('王大明');
    expect(window.localStorage.getItem('user')).toBeNull();
  });

  it('背景重驗遇暫時性錯誤時保留舊 user 與狀態', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    t.setSession(session(UID_A));
    let refreshed: Promise<unknown> = Promise.resolve();
    await act(async () => {
      refreshed = t.hook.result.current.refreshUser();
    });
    await waitFor(() => expect(t.pendingFetches).toHaveLength(1));
    await t.respond({ kind: 'transient' });
    await expect(refreshed).resolves.toBeNull();
    expect(t.hook.result.current.user).toEqual(MEMBER);
    expect(t.hook.result.current.authState).toBe('authenticated');
  });

  it('只有 accountStatus 變成 active 時提示由 funnel 轉 member', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok({ ...UNPAID, paidAwaitingActivation: true, lastTradeNo: 'T1' }));
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'funnel', next: 'result' });
    await act(async () => {
      t.hook.result.current.setUser({ ...UNPAID, accountStatus: 'active' });
    });
    expect(t.hook.result.current.isFunnel).toBe(false);
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'member', next: null });
  });

  it('setUser 把會員換成漏斗資料時提示轉回 funnel', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    await act(async () => {
      t.hook.result.current.setUser(UNPAID);
    });
    expect(t.hook.result.current.isFunnel).toBe(true);
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'funnel' });
  });

  it('ingestProfile 收資料齊全者時 set user 並轉 authenticated', async () => {
    const t = setup({ session: null });
    await t.resolveSession();
    await act(async () => {
      t.hook.result.current.ingestProfile(UNPAID);
    });
    expect(t.hook.result.current.authState).toBe('authenticated');
    expect(t.hook.result.current.user).toEqual(UNPAID);
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'funnel', next: 'checkout' });
  });

  it('ingestProfile 收資料未齊者時記為漏斗、user 維持 null、提示寫成 funnel', async () => {
    const t = setup({ session: null });
    await t.resolveSession();
    await act(async () => {
      t.hook.result.current.ingestProfile(INCOMPLETE);
    });
    expect(t.hook.result.current.user).toBeNull();
    expect(t.hook.result.current.isFunnel).toBe(true);
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'funnel', next: 'profile' });
  });

  it('setUser、refreshUser、ingestProfile 為穩定 identity', async () => {
    const t = setup();
    const first = t.hook.result.current;
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    const after = t.hook.result.current;
    expect(after.setUser).toBe(first.setUser);
    expect(after.refreshUser).toBe(first.refreshUser);
    expect(after.ingestProfile).toBe(first.ingestProfile);
  });
});

describe('useAuthBootstrap getSession 安全出口', () => {
  afterEach(() => vi.useRealTimers());

  it('getSession 10 秒內沒有回應時 sessionStalled 為 true', async () => {
    vi.useFakeTimers();
    const t = setup();
    expect(t.hook.result.current.sessionStalled).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(9_999);
    });
    expect(t.hook.result.current.sessionStalled).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(t.hook.result.current.sessionStalled).toBe(true);
  });

  it('卡住之後 getSession 回來時解除並照常判定', async () => {
    vi.useFakeTimers();
    const t = setup();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await t.resolveSession();
    expect(t.hook.result.current.sessionStalled).toBe(false);
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('getSession 擲例外時 sessionStalled 為 true', async () => {
    const t = setup();
    t.deps.supabase.auth.getSession.mockImplementation(() => Promise.reject(new Error('boom')));
    t.hook.unmount();
    const hook = renderHook(() => useAuthBootstrap(t.deps as unknown as AuthBootstrapDeps));
    await waitFor(() => expect(hook.result.current.sessionStalled).toBe(true));
  });
});
