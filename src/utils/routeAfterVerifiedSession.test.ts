import { describe, expect, it, vi } from 'vitest';
import { routeAfterVerifiedSession } from './routeAfterVerifiedSession';

function makeDeps(fetchProfile: (token: string) => Promise<Response>) {
  return {
    fetchProfile: vi.fn(fetchProfile),
    navigate: vi.fn(),
    showToast: vi.fn(),
  };
}

const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('routeAfterVerifiedSession', () => {
  it('沒有 session 時保守帶去完善資料頁，不讀 profile', async () => {
    const deps = makeDeps(async () => jsonResponse(200));
    await routeAfterVerifiedSession(null, deps);
    expect(deps.fetchProfile).not.toHaveBeenCalled();
    expect(deps.navigate).toHaveBeenCalledWith('/auth/complete-profile', { replace: true });
  });

  it('profile 回 200 時依 registrationStep 導向並帶上 access token', async () => {
    const deps = makeDeps(async () => jsonResponse(200, { registrationStep: 1 }));
    await routeAfterVerifiedSession({ access_token: 'tok' }, deps);
    expect(deps.fetchProfile).toHaveBeenCalledWith('tok');
    expect(deps.navigate).toHaveBeenCalledWith('/payment/checkout', { replace: true });
    expect(deps.showToast).not.toHaveBeenCalled();
  });

  it('profile 回 401 時提示重新登入並導去登入頁', async () => {
    const deps = makeDeps(async () => jsonResponse(401));
    await routeAfterVerifiedSession({ access_token: 'tok' }, deps);
    expect(deps.showToast).toHaveBeenCalledWith('驗證成功，但登入狀態異常，請重新登入', 'error');
    expect(deps.navigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('profile 回其他非 2xx 時帶去完善資料頁，不登出', async () => {
    const deps = makeDeps(async () => jsonResponse(404));
    await routeAfterVerifiedSession({ access_token: 'tok' }, deps);
    expect(deps.navigate).toHaveBeenCalledWith('/auth/complete-profile', { replace: true });
    expect(deps.showToast).not.toHaveBeenCalled();
  });

  it('讀 profile 拋例外時帶去完善資料頁', async () => {
    const deps = makeDeps(async () => {
      throw new Error('network');
    });
    await routeAfterVerifiedSession({ access_token: 'tok' }, deps);
    expect(deps.navigate).toHaveBeenCalledWith('/auth/complete-profile', { replace: true });
  });
});
