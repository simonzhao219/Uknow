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
    retry?: boolean;
    timeoutMs?: number;
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
      (
        _token: string,
        o: { userId: string; force?: boolean; retry?: boolean; timeoutMs?: number },
      ) =>
        new Promise<ProfileFetchResult>((resolve) => {
          pendingFetches.push({
            userId: o.userId,
            force: o.force,
            retry: o.retry,
            timeoutMs: o.timeoutMs,
            resolve,
          });
        }),
    ),
    endInvalidSession: vi.fn(async () => {}),
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
    /** 冷啟動 getSession 以指定結果 resolve（例如 session:null＋error）。 */
    resolveSessionWith: async (r: { data: { session: unknown }; error?: unknown }) => {
      await act(async () => {
        sessionGate.resolve(r);
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
    expect(t.deps.fetchProfile).toHaveBeenCalledWith('tok-' + UID_A, {
      userId: UID_A,
      timeoutMs: 8_000,
    });
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

  // T1-B：冷啟動暫時性錯誤不再判 anonymous（那會讓守衛導 /login）——先排一次自動重試。
  it('/profile 5xx 時維持 unknown、排自動重試、保留提示', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await t.resolveSession();
    await t.respond({ kind: 'transient' });
    expect(t.hook.result.current.authState).toBe('unknown');
    expect(t.hook.result.current.outcome).toBe('retrying');
    expect(t.hook.result.current.user).toBeNull();
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'member' });
  });

  it('/profile 401 時以 endInvalidSession 本機清理、不呼叫 global 登出、清提示', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await t.resolveSession();
    await t.respond({ kind: 'unauthorized', status: 401 });
    expect(t.deps.endInvalidSession).toHaveBeenCalledTimes(1);
    expect(t.deps.endInvalidSession).toHaveBeenCalledWith({
      auth: t.deps.supabase.auth,
      storage: window.localStorage,
    });
    expect(t.deps.supabase.auth.signOut).not.toHaveBeenCalled();
    expect(t.hook.result.current.authState).toBe('anonymous');
    expect(t.hook.result.current.outcome).toBe('signedOut');
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  // W4-11：404＝帳號資料異常，不登出（防重登循環），由 /login 顯示異常說明。
  it('/profile 回 missing 時轉 anomaly、不登出、清提示', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await t.resolveSession();
    await t.respond({ kind: 'missing' });
    const r = t.hook.result.current;
    expect(r.authState).toBe('anonymous');
    expect(r.outcome).toBe('anomaly');
    expect(r.authAnomaly).toBe(true);
    expect(t.deps.supabase.auth.signOut).not.toHaveBeenCalled();
    expect(t.deps.endInvalidSession).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  it('anomaly 後同 uid 的 SIGNED_IN 重播不重打 /profile', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond({ kind: 'missing' });
    await t.emit('SIGNED_IN', session(UID_A));
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(1);
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

  // T1-B：session 有無的唯一判定者是 getSession()；INITIAL_SESSION(null) 分不出「沒登入」
  // 與「初始化 refresh 暫時失敗」，getSession 回來之前不得搶先判 anonymous。
  it('INITIAL_SESSION 無 session 且 getSession 也無 session（無錯誤）時轉 anonymous 並清提示', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup({ session: null });
    await t.emit('INITIAL_SESSION', null);
    expect(t.hook.result.current.authState).toBe('unknown');
    await t.resolveSession();
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
    // W4-20（業主 2026-11-01 裁決）：新 uid 的請求依 plan §2.3 帶 8 秒逾時。
    expect(t.deps.fetchProfile).toHaveBeenLastCalledWith('tok-' + UID_B, {
      userId: UID_B,
      timeoutMs: 8_000,
    });
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

describe('useAuthBootstrap 暫時性故障（T1-B degraded）', () => {
  afterEach(() => vi.useRealTimers());

  /** 假時鐘下讓 promise 鏈跑完（RTL 的 waitFor 在假時鐘下會卡住）。 */
  const flush = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

  const RETRYABLE = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };

  /** 冷啟動首次 transient → 1 秒後自動重試（getSession 回 UID_A）。 */
  async function toAutoRetry(t: ReturnType<typeof setup>) {
    t.setSession(session(UID_A));
    await t.resolveSession();
    await t.respond({ kind: 'transient' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  /** 冷啟動連兩次 transient → degraded。 */
  async function toDegraded(t: ReturnType<typeof setup>) {
    await toAutoRetry(t);
    await t.respond({ kind: 'transient' });
  }

  it('冷啟動首次請求帶 8 秒逾時、不帶 retry', async () => {
    const t = setup();
    await t.resolveSession();
    expect(t.pendingFetches[0]).toMatchObject({ timeoutMs: 8_000 });
    expect(t.pendingFetches[0].retry).toBeFalsy();
  });

  it('首次 transient 後 1 秒自動重試一次，帶 retry 與 5 秒逾時', async () => {
    vi.useFakeTimers();
    const t = setup();
    await toAutoRetry(t);
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(2);
    expect(t.pendingFetches[0]).toMatchObject({ retry: true, timeoutMs: 5_000 });
  });

  it('自動重試成功時轉 authenticated，全程不轉 anonymous', async () => {
    vi.useFakeTimers();
    const t = setup();
    const seen = new Set<string>();
    await toAutoRetry(t);
    seen.add(t.hook.result.current.authState);
    await t.respond(ok(MEMBER));
    expect(seen.has('anonymous')).toBe(false);
    expect(t.hook.result.current.authState).toBe('authenticated');
    expect(t.hook.result.current.user).toEqual(MEMBER);
  });

  it('自動重試仍失敗時進 degraded、不在載入中、提示保留', async () => {
    vi.useFakeTimers();
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await toDegraded(t);
    const r = t.hook.result.current;
    expect(r.authState).toBe('degraded');
    expect(r.outcome).toBe('degraded');
    expect(r.isLoadingUser).toBe(false);
    expect(r.isRetrying).toBe(false);
    expect(r.failedAgain).toBe(false);
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'member' });
    // 自動重試只一次：再等也不會自己打。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('degraded 時 retryAuth 進入重試中，仍失敗則 isRetrying 回 false、failedAgain 為真', async () => {
    vi.useFakeTimers();
    const t = setup();
    await toDegraded(t);
    await act(async () => {
      void t.hook.result.current.retryAuth();
    });
    expect(t.hook.result.current.isRetrying).toBe(true);
    expect(t.hook.result.current.authState).toBe('degraded');
    await flush();
    expect(t.pendingFetches).toHaveLength(1);
    expect(t.pendingFetches[0]).toMatchObject({ retry: true });
    await t.respond({ kind: 'transient' });
    expect(t.hook.result.current.isRetrying).toBe(false);
    expect(t.hook.result.current.failedAgain).toBe(true);
    expect(t.hook.result.current.authState).toBe('degraded');
  });

  it('degraded 時 retryAuth 成功轉 authenticated、isRetrying 歸零', async () => {
    vi.useFakeTimers();
    const t = setup();
    await toDegraded(t);
    await act(async () => {
      void t.hook.result.current.retryAuth();
    });
    await flush();
    expect(t.pendingFetches).toHaveLength(1);
    await t.respond(ok(MEMBER));
    expect(t.hook.result.current.authState).toBe('authenticated');
    expect(t.hook.result.current.isRetrying).toBe(false);
  });

  it('degraded 時重試得到 401 → endInvalidSession、轉 signedOut', async () => {
    vi.useFakeTimers();
    const t = setup();
    await toDegraded(t);
    await act(async () => {
      void t.hook.result.current.retryAuth();
    });
    await flush();
    expect(t.pendingFetches).toHaveLength(1);
    await t.respond({ kind: 'unauthorized', status: 401 });
    expect(t.deps.endInvalidSession).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.outcome).toBe('signedOut');
    expect(t.hook.result.current.isRetrying).toBe(false);
  });

  it('重試在飛時再按 retryAuth 不發第二個請求', async () => {
    vi.useFakeTimers();
    const t = setup();
    await toDegraded(t);
    await act(async () => {
      void t.hook.result.current.retryAuth();
    });
    await flush();
    expect(t.pendingFetches).toHaveLength(1);
    await act(async () => {
      void t.hook.result.current.retryAuth();
    });
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(3);
  });

  it('degraded 時 online 與分頁切回可見各觸發一次重試', async () => {
    vi.useFakeTimers();
    const t = setup();
    await toDegraded(t);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(t.pendingFetches).toHaveLength(1);
    await t.respond({ kind: 'transient' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(t.pendingFetches).toHaveLength(1);
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(4);
  });

  it('已登入（非 degraded）時 online 事件不打 /profile', async () => {
    const t = setup();
    await t.resolveSession();
    await t.respond(ok(MEMBER));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('transient 後同 uid 的 SIGNED_IN 重播不產生第二個請求', async () => {
    vi.useFakeTimers();
    const t = setup();
    t.setSession(session(UID_A));
    await t.resolveSession();
    await t.respond({ kind: 'transient' });
    await t.emit('SIGNED_IN', session(UID_A));
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('自動重試排程中收到 SIGNED_OUT 時取消重試、轉 signedOut', async () => {
    vi.useFakeTimers();
    const t = setup();
    t.setSession(session(UID_A));
    await t.resolveSession();
    await t.respond({ kind: 'transient' });
    await t.emit('SIGNED_OUT', null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.outcome).toBe('signedOut');
  });

  it('degraded 中收到 SIGNED_OUT 時離開 degraded，之後 online 不再重試', async () => {
    vi.useFakeTimers();
    const t = setup();
    await toDegraded(t);
    await t.emit('SIGNED_OUT', null);
    expect(t.hook.result.current.authState).toBe('anonymous');
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('getSession 回 null＋可重試錯誤時不清提示、排自動重試', async () => {
    vi.useFakeTimers();
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await t.resolveSessionWith({ data: { session: null }, error: RETRYABLE });
    expect(t.hook.result.current.authState).toBe('unknown');
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'member' });
    t.setSession(session(UID_A));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(t.deps.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('getSession 回可重試錯誤且同時收到 INITIAL_SESSION(null) 時不判 signedOut', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await t.resolveSessionWith({ data: { session: null }, error: RETRYABLE });
    await t.emit('INITIAL_SESSION', null);
    expect(t.hook.result.current.outcome).not.toBe('signedOut');
    expect(readAuthHint(window.localStorage)).toMatchObject({ kind: 'member' });
  });

  it('已付款待開通者的重試回應（未自癒的 step 2）照收', async () => {
    vi.useFakeTimers();
    const PAID_PENDING = {
      ...UNPAID,
      registrationStep: 2,
      paidAwaitingActivation: true,
      lastTradeNo: 'T1',
    };
    const t = setup();
    await toAutoRetry(t);
    await t.respond(ok(PAID_PENDING));
    expect(t.hook.result.current.user).toEqual(PAID_PENDING);
    expect(t.hook.result.current.nextFunnelRoute).toMatch(/^\/payment\/result/);
  });
});
