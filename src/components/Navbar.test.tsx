// @vitest-environment jsdom
//
// admin 入口與待處理 badge。
//
// 這支測試釘三件事：
//   1. **入口要看得見。** admin 入口原本只藏在頭像下拉裡（違反
//      ui-ux-guidelines §3 明文），等於每次要處理提領都得先點兩下才找得到。
//   2. **badge 只在真的有事時出現。** 常駐一個「0」會訓練人忽略它，
//      那個 badge 之後就再也叫不動任何人了。
//   3. **非 admin 不發那個請求。** 一般會員每次載入頁面都打一次
//      `/admin/withdrawals` 只會拿到 403——白費一次往返，還會在後端
//      日誌裡製造一堆假的權限告警。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { flags, UserCtx, apiRequestJson } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  const { vi: v } = await import('vitest');
  return {
    flags: { rewardSystem: true } as Record<string, boolean>,
    UserCtx: createContext<any>({ isLoggedIn: true, isAdmin: false, user: null }),
    apiRequestJson: v.fn(),
  };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../contexts/FeatureContext', () => ({
  useFeatures: () => ({
    features: flags,
    isFeatureEnabled: (key: string) => flags[key] ?? false,
    refreshFeatures: () => {},
    isLoading: false,
  }),
}));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: async () => ({ error: null }) } }),
}));
vi.mock('../utils/apiClient', () => ({
  apiRequestJson,
  buildApiUrl: (p: string) => `https://api.test${p}`,
}));

import { Navbar } from './Navbar';

afterEach(() => {
  cleanup();
  apiRequestJson.mockReset();
});

function renderNav(isAdmin: boolean) {
  return render(
    <UserCtx.Provider
      value={{
        user: { name: '管理員', email: 'a@b.c' },
        setUser: () => {},
        isLoggedIn: true,
        isAdmin,
      }}
    >
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </UserCtx.Provider>,
  );
}

function statsResponse(pending: number) {
  // 專用的輕量端點：只有兩個數字，不含列表也不含任何簽名 URL。
  return { success: true, data: { pendingCount: pending, pendingAmount: 0 } };
}

describe('Navbar', () => {
  it('管理員看得到平台管理入口，不必先展開頭像選單', async () => {
    apiRequestJson.mockResolvedValue(statsResponse(0));
    renderNav(true);
    expect(await screen.findByRole('link', { name: /平台管理/ })).toBeTruthy();
  });

  it('有待處理提領時入口顯示筆數', async () => {
    apiRequestJson.mockResolvedValue(statsResponse(3));
    renderNav(true);
    expect(await screen.findByText('3')).toBeTruthy();
  });

  it('待處理為 0 時不顯示空 badge', async () => {
    apiRequestJson.mockResolvedValue(statsResponse(0));
    renderNav(true);
    await screen.findByRole('link', { name: /平台管理/ });
    expect(screen.queryByText('0')).toBeNull();
  });

  it('非管理員不發待處理筆數的請求', async () => {
    renderNav(false);
    await waitFor(() => expect(apiRequestJson).not.toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /平台管理/ })).toBeNull();
  });
});
