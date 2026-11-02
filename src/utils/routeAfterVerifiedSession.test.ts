import { describe, expect, it, vi } from 'vitest';
import type { ProfileFetchResult } from './fetchProfile';
import { routeAfterVerifiedSession } from './routeAfterVerifiedSession';

function makeDeps(fetchProfile: () => Promise<ProfileFetchResult>) {
  return {
    fetchProfile: vi.fn(fetchProfile),
    ingestProfile: vi.fn(),
    navigate: vi.fn(),
    showToast: vi.fn(),
  };
}

const SESSION = { access_token: 'tok', user: { id: 'u1' } };

describe('routeAfterVerifiedSession', () => {
  it('沒有 session 時保守帶去完善資料頁，不讀 profile', async () => {
    const deps = makeDeps(async () => ({ kind: 'ok', profile: {} }));
    await routeAfterVerifiedSession(null, deps);
    expect(deps.fetchProfile).not.toHaveBeenCalled();
    expect(deps.navigate).toHaveBeenCalledWith('/auth/complete-profile', { replace: true });
  });

  it('profile ok 時依 registrationStep 導向並以當場的 session 讀取', async () => {
    const deps = makeDeps(async () => ({ kind: 'ok', profile: { registrationStep: 1 } }));
    await routeAfterVerifiedSession(SESSION, deps);
    expect(deps.fetchProfile).toHaveBeenCalledWith(SESSION);
    expect(deps.navigate).toHaveBeenCalledWith('/payment/checkout', { replace: true });
    expect(deps.showToast).not.toHaveBeenCalled();
  });

  it('profile ok 時先回灌登入狀態再導頁（之後重新整理首繪即為漏斗頁首）', async () => {
    const order: string[] = [];
    const profile = { id: 'u1', registrationStep: 0 };
    const deps = makeDeps(async () => ({ kind: 'ok', profile }));
    deps.ingestProfile.mockImplementation(() => order.push('ingest'));
    deps.navigate.mockImplementation(() => order.push('navigate'));
    await routeAfterVerifiedSession(SESSION, deps);
    expect(deps.ingestProfile).toHaveBeenCalledWith(profile);
    expect(order).toEqual(['ingest', 'navigate']);
  });

  it('profile 回 401 時提示重新登入並導去登入頁、不回灌', async () => {
    const deps = makeDeps(async () => ({ kind: 'unauthorized', status: 401 }));
    await routeAfterVerifiedSession(SESSION, deps);
    expect(deps.showToast).toHaveBeenCalledWith('驗證成功，但登入狀態異常，請重新登入', 'error');
    expect(deps.navigate).toHaveBeenCalledWith('/login', { replace: true });
    expect(deps.ingestProfile).not.toHaveBeenCalled();
  });

  // W4-11：404＝帳號資料異常——不登出、不回灌，帶去 /login（AuthPage 顯示異常說明）。
  it('profile 回 missing 時帶去登入頁顯示異常說明，不回灌、不登出', async () => {
    const deps = makeDeps(async () => ({ kind: 'missing' }));
    await routeAfterVerifiedSession(SESSION, deps);
    expect(deps.navigate).toHaveBeenCalledWith('/login', { replace: true });
    expect(deps.ingestProfile).not.toHaveBeenCalled();
  });

  // T1-B §2.4：暫時性錯誤不能把已完成註冊的人送進註冊頁——交給會員中心守衛的 degraded 外框。
  it('暫時性錯誤時帶去會員中心（由守衛的重試外框接手），不回灌', async () => {
    const deps = makeDeps(async () => ({ kind: 'transient' }));
    await routeAfterVerifiedSession(SESSION, deps);
    expect(deps.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    expect(deps.ingestProfile).not.toHaveBeenCalled();
  });

  it('讀 profile 拋例外時帶去會員中心', async () => {
    const deps = makeDeps(async () => {
      throw new Error('network');
    });
    await routeAfterVerifiedSession(SESSION, deps);
    expect(deps.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('未提供 ingestProfile 時照常導向', async () => {
    const deps = makeDeps(async () => ({ kind: 'ok', profile: { registrationStep: 3 } }));
    await routeAfterVerifiedSession(SESSION, { ...deps, ingestProfile: undefined });
    expect(deps.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
