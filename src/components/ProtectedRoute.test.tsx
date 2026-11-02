// @vitest-environment jsdom
//
// ProtectedRoute／AdminRoute 的冷啟動與 degraded（T1-B §4.1、R1b、R4b）：暫時性故障停在原頁畫
// degraded 外框，不導 /login；載入態有可讀文字，5 秒後換「連線較慢」。
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { UserCtx } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return { UserCtx: createContext<any>({}) };
});
vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../contexts/FeatureContext', () => ({
  useFeatures: () => ({ isFeatureEnabled: () => true }),
}));
vi.mock('../hooks/useMemberLogout', () => ({ useMemberLogout: () => vi.fn() }));

import { AdminRoute } from './AdminRoute';
import { ProtectedRoute } from './ProtectedRoute';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const DEGRADED = {
  user: null,
  isLoggedIn: false,
  isAdmin: false,
  isLoadingUser: false,
  authState: 'degraded',
  retryAuth: vi.fn(async () => {}),
  isRetrying: false,
  failedAgain: false,
};

function renderAt(guard: 'protected' | 'admin', ctx: Record<string, unknown>) {
  const Guard = guard === 'admin' ? AdminRoute : ProtectedRoute;
  return render(
    <UserCtx.Provider value={ctx}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route
            path="/secret"
            element={
              <Guard>
                <p>受保護頁內容</p>
              </Guard>
            }
          />
          <Route path="/login" element={<p>登入頁</p>} />
        </Routes>
      </MemoryRouter>
    </UserCtx.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('degraded 時停在原頁畫 degraded 外框，不導 /login', () => {
    renderAt('protected', DEGRADED);
    expect(screen.getByTestId('auth-degraded')).toBeTruthy();
    expect(screen.queryByText('登入頁')).toBeNull();
    expect(screen.queryByText('受保護頁內容')).toBeNull();
  });

  it('anonymous 時照舊導 /login', () => {
    renderAt('protected', { ...DEGRADED, authState: 'anonymous' });
    expect(screen.getByText('登入頁')).toBeTruthy();
  });

  it('冷啟動載入中有可讀文字，5 秒後換成連線較慢', () => {
    vi.useFakeTimers();
    renderAt('protected', { ...DEGRADED, authState: 'unknown', isLoadingUser: true });
    expect(screen.getByRole('status').textContent).toContain('載入中…');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole('status').textContent).toContain('連線較慢，仍在載入…');
  });
});

describe('AdminRoute', () => {
  it('degraded 時停在原頁畫 degraded 外框，不導 /login', () => {
    renderAt('admin', DEGRADED);
    expect(screen.getByTestId('auth-degraded')).toBeTruthy();
    expect(screen.queryByText('登入頁')).toBeNull();
  });

  it('冷啟動載入中有可讀文字', () => {
    renderAt('admin', { ...DEGRADED, authState: 'unknown', isLoadingUser: true });
    expect(screen.getByRole('status').textContent).toContain('載入中…');
  });
});
