// @vitest-environment jsdom
//
// 守衛的 degraded 外框（T1-B §4.1）：從 context 取重試狀態、用會員登出，
// 使用者按重試而成功時把焦點交給 main（事件／自動重試成功不搶焦點）。
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { UserCtx, logout } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return { UserCtx: createContext<any>({}), logout: { fn: null as any } };
});
vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../hooks/useMemberLogout', () => ({ useMemberLogout: () => logout.fn }));

import { AuthDegradedFrame } from './AuthDegradedFrame';

afterEach(cleanup);

function renderFrame(ctx: Record<string, unknown>, showFrame = true) {
  const tree = (show: boolean) => (
    <UserCtx.Provider value={ctx}>
      <main tabIndex={-1} data-testid="main">
        {show ? <AuthDegradedFrame /> : <p>受保護頁內容</p>}
      </main>
    </UserCtx.Provider>
  );
  const r = render(tree(showFrame));
  return { ...r, showContent: () => r.rerender(tree(false)) };
}

describe('AuthDegradedFrame', () => {
  it('按重試呼叫 context 的 retryAuth', () => {
    const retryAuth = vi.fn(async () => {});
    logout.fn = vi.fn();
    renderFrame({ retryAuth, isRetrying: false, failedAgain: false });
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(retryAuth).toHaveBeenCalledTimes(1);
  });

  it('按登出走會員登出', () => {
    logout.fn = vi.fn();
    renderFrame({ retryAuth: vi.fn(async () => {}), isRetrying: false, failedAgain: false });
    fireEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(logout.fn).toHaveBeenCalledTimes(1);
  });

  it('使用者按重試而成功（外框卸載）時焦點移到 main', async () => {
    let finish!: () => void;
    const retryAuth = vi.fn(() => new Promise<void>((r) => (finish = r)));
    logout.fn = vi.fn();
    const r = renderFrame({ retryAuth, isRetrying: false, failedAgain: false });
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    r.showContent();
    finish();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('main')));
  });

  it('沒按重試（事件或自動重試成功）時不搶焦點', async () => {
    logout.fn = vi.fn();
    const r = renderFrame({
      retryAuth: vi.fn(async () => {}),
      isRetrying: false,
      failedAgain: false,
    });
    r.showContent();
    await new Promise((res) => setTimeout(res, 20));
    expect(document.activeElement).toBe(document.body);
  });
});
