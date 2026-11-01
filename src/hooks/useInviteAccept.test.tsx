// @vitest-environment jsdom
//
// 邀請連結的「設定密碼」送出：accept（設密碼＋驗證 email 一步完成）→ 以剛設的密碼
// 登入 → 依 registrationStep 導向。失敗時只回 code，文案由 AuthPage 依 code 決定。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInviteAccept } from './useInviteAccept';
import { getPendingInviteToken, savePendingInviteToken } from '../utils/referralInvite';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(acceptResponse: () => Promise<Response>, signInError: unknown = null) {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith('/auth/invite/accept')) return acceptResponse();
    throw new Error(`unexpected ${href}`);
  });
  // /profile 走共用的 fetchProfile（與 App 啟動判定合併），不走 fetchImpl。
  const fetchProfile = vi.fn(async () => ({
    kind: 'ok' as const,
    profile: { id: 'u1', registrationStep: 0 },
  }));
  const ingestProfile = vi.fn();
  const signInWithPassword = vi.fn(async () => ({
    data: { session: signInError ? null : { access_token: 'tok', user: { id: 'u1' } } },
    error: signInError,
  }));
  const navigate = vi.fn();
  const showToast = vi.fn();
  const hook = renderHook(() =>
    useInviteAccept({
      supabase: { auth: { signInWithPassword } },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      fetchProfile,
      ingestProfile,
      navigate,
      showToast,
    }),
  );
  return { hook, fetchImpl, fetchProfile, ingestProfile, signInWithPassword, navigate };
}

const input = { token: 'p.s', email: 'a@b.co', password: 'Passw0rd' };

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.clearAllMocks());

describe('useInviteAccept', () => {
  it('accept 成功時以剛設的密碼登入並導向完善資料頁', async () => {
    savePendingInviteToken('p.s');
    const { hook, fetchImpl, fetchProfile, ingestProfile, signInWithPassword, navigate } = setup(
      async () => json(200, { accepted: true }),
    );
    let result: unknown;
    await act(async () => {
      result = await hook.result.current.submit(input);
    });
    expect(result).toEqual({ kind: 'signed_in' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/auth\/invite\/accept$/);
    expect(JSON.parse(String(init.body))).toEqual({ token: 'p.s', password: 'Passw0rd' });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'Passw0rd' });
    expect(navigate).toHaveBeenCalledWith('/auth/complete-profile', { replace: true });
    expect(getPendingInviteToken()).toBeNull();
    expect(fetchProfile).toHaveBeenCalledWith({ access_token: 'tok', user: { id: 'u1' } });
    expect(ingestProfile).toHaveBeenCalledWith({ id: 'u1', registrationStep: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('accept 成功但登入失敗時回 accepted_login_failed 並清 token', async () => {
    savePendingInviteToken('p.s');
    const { hook, navigate } = setup(async () => json(200, { accepted: true }), {
      message: 'x',
    });
    let result: unknown;
    await act(async () => {
      result = await hook.result.current.submit(input);
    });
    expect(result).toEqual({ kind: 'accepted_login_failed' });
    expect(navigate).not.toHaveBeenCalled();
    expect(getPendingInviteToken()).toBeNull();
  });

  it('accept 回錯誤信封時只回 code、不登入', async () => {
    const { hook, signInWithPassword } = setup(async () =>
      json(400, { success: false, error: { code: 'expired', message: 'Link expired' } }),
    );
    let result: unknown;
    await act(async () => {
      result = await hook.result.current.submit(input);
    });
    expect(result).toEqual({ kind: 'failed', code: 'expired' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('網路例外時回沒有 code 的失敗', async () => {
    const { hook } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    let result: unknown;
    await act(async () => {
      result = await hook.result.current.submit(input);
    });
    expect(result).toEqual({ kind: 'failed', code: undefined });
  });

  it('非 JSON 的 5xx 時回沒有 code 的失敗', async () => {
    const { hook } = setup(async () => new Response('<html>bad gateway</html>', { status: 502 }));
    let result: unknown;
    await act(async () => {
      result = await hook.result.current.submit(input);
    });
    expect(result).toEqual({ kind: 'failed', code: undefined });
  });

  it('送出中 isSubmitting 為真、結束後回假', async () => {
    let release: (r: Response) => void = () => {};
    const { hook } = setup(() => new Promise<Response>((r) => (release = r)));
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = hook.result.current.submit(input);
    });
    expect(hook.result.current.isSubmitting).toBe(true);
    await act(async () => {
      release(json(503, { success: false, error: { code: 'unavailable', message: '' } }));
      await pending;
    });
    expect(hook.result.current.isSubmitting).toBe(false);
  });
});

describe('useInviteAccept 逾時', () => {
  it('accept 請求超過 25 秒沒有回應時中止並回沒有 code 的失敗', async () => {
    vi.useFakeTimers();
    try {
      const { hook, fetchImpl } = setup(() => new Promise<Response>(() => {}));
      fetchImpl.mockImplementation(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      let result: unknown;
      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = hook.result.current.submit(input).then((r) => {
          result = r;
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(25_000);
        await pending;
      });
      expect(result).toEqual({ kind: 'failed', code: undefined });
    } finally {
      vi.useRealTimers();
    }
  });
});
