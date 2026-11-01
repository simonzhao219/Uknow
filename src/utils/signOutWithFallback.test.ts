import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIGN_OUT_TIMEOUT_MS, signOutWithFallback } from './signOutWithFallback';

function auth(global: () => Promise<{ error: unknown }>) {
  return {
    signOut: vi.fn(async (opts?: { scope?: string }) =>
      opts?.scope === 'local' ? { error: null } : global(),
    ),
  };
}

afterEach(() => vi.useRealTimers());

describe('signOutWithFallback', () => {
  it('global 登出成功時不補 local、回 localOnly false', async () => {
    const a = auth(async () => ({ error: null }));
    await expect(signOutWithFallback(a)).resolves.toEqual({ localOnly: false });
    expect(a.signOut).toHaveBeenCalledTimes(1);
  });

  it('global 回錯誤時補 local 登出、回 localOnly true', async () => {
    const a = auth(async () => ({ error: new Error('network') }));
    await expect(signOutWithFallback(a)).resolves.toEqual({ localOnly: true });
    expect(a.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('global 擲例外時補 local 登出', async () => {
    const a = auth(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(signOutWithFallback(a)).resolves.toEqual({ localOnly: true });
    expect(a.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('global 卡住超過逾時就改走 local 登出，不讓畫面凍結', async () => {
    vi.useFakeTimers();
    const a = auth(() => new Promise(() => {}));
    const p = signOutWithFallback(a);
    await vi.advanceTimersByTimeAsync(SIGN_OUT_TIMEOUT_MS);
    await expect(p).resolves.toEqual({ localOnly: true });
    expect(a.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('local 登出本身也失敗時不擲出', async () => {
    const a = {
      signOut: vi.fn(async () => {
        throw new Error('storage');
      }),
    };
    await expect(signOutWithFallback(a)).resolves.toEqual({ localOnly: true });
  });
});
