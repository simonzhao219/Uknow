// @vitest-environment jsdom
//
// 會員主動登出（頁首頭像選單、degraded 外框、帳號異常說明共用；T1-B §4.1、W4-16）：
// global 登出（失敗補本機）、清提示與 context、導首頁。
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { UserCtx, signOut } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return { UserCtx: createContext<any>({}), signOut: { fn: null as any } };
});
vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../utils/supabase/client', () => ({ createClient: () => ({ auth: {} }) }));
vi.mock('../utils/signOutWithFallback', () => ({
  signOutWithFallback: (...a: unknown[]) => signOut.fn(...a),
}));

import { AUTH_HINT_KEY, writeAuthHint } from '../utils/authHint';
import { useMemberLogout } from './useMemberLogout';

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

function setup() {
  const setUser = vi.fn();
  let path = '';
  const Probe = () => {
    path = useLocation().pathname;
    return null;
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <UserCtx.Provider value={{ setUser }}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
        {children}
      </MemoryRouter>
    </UserCtx.Provider>
  );
  const hook = renderHook(() => useMemberLogout(), { wrapper });
  return { hook, setUser, path: () => path };
}

describe('useMemberLogout', () => {
  it('global 登出、清 context 與首繪提示、導首頁', async () => {
    signOut.fn = vi.fn(async () => ({ localOnly: false }));
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'aaaaaaaa', next: null });
    const t = setup();
    await act(async () => {
      await t.hook.result.current();
    });
    expect(signOut.fn).toHaveBeenCalledTimes(1);
    expect(t.setUser).toHaveBeenCalledWith(null);
    expect(localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
    expect(t.path()).toBe('/');
  });

  it('登出擲例外時照樣導首頁', async () => {
    signOut.fn = vi.fn(() => Promise.reject(new Error('boom')));
    const t = setup();
    await act(async () => {
      await t.hook.result.current();
    });
    expect(t.path()).toBe('/');
  });
});
