// @vitest-environment jsdom
//
// 無效 session 的系統清理（T1-B §2.5，W4-13）：只清本機，不撤銷其他裝置；不導頁、不動 React
// state、不清邀請 token——那些由呼叫端（bootstrap／AuthPage／apiClient）各自處置。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_HINT_KEY, readAuthHint, writeAuthHint } from './authHint';
import { endInvalidSession } from './endInvalidSession';
import { getPendingInviteToken, savePendingInviteToken } from './referralInvite';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const fakeAuth = (impl?: () => Promise<unknown>) => ({
  signOut: vi.fn(impl ?? (async () => ({ error: null }))),
});

describe('endInvalidSession', () => {
  it('只做本機登出（scope local），不呼叫 global 登出', async () => {
    const auth = fakeAuth();
    await endInvalidSession({ auth });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('清掉首繪提示與帳號相關的本機鍵', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    for (const k of ['withdrawalBankData', 'pendingUser', 'user', 'pendingSession']) {
      localStorage.setItem(k, '{"x":1}');
    }
    await endInvalidSession({ auth: fakeAuth(), storage: localStorage });
    expect(readAuthHint()).toBeNull();
    expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    for (const k of ['withdrawalBankData', 'pendingUser', 'user', 'pendingSession']) {
      expect(localStorage.getItem(k), k).toBeNull();
    }
  });

  it('不清邀請 token（由呼叫端決定是否保留）', async () => {
    savePendingInviteToken('invite-token-1');
    await endInvalidSession({ auth: fakeAuth() });
    expect(getPendingInviteToken()).toBe('invite-token-1');
  });

  it('本機登出擲例外時照樣清本機狀態、不往外拋', async () => {
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const auth = fakeAuth(() => Promise.reject(new Error('storage locked')));
    await expect(endInvalidSession({ auth })).resolves.toBeUndefined();
    expect(readAuthHint()).toBeNull();
  });
});
