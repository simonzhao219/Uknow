// @vitest-environment jsdom
//
// 管理員設置分頁。這支存在的直接理由是 **U7 ＋ N1**:
//
// - U7（審查 R3 補的故事）:規格書 §13 的五個模組裡，「管理員設定」原本是
//   唯一沒有任何使用者故事、也沒有測試落點的一個。P16 的長 Email 溢出
//   （實測 +119px）就是這個缺口的後果——沒人在守，也就沒人發現。
// - N1:覆蓋率棘輪由 CI 的 test:coverage 把關而 npm run check 不含它，
//   在零測試檔的元件上加新 JSX 會把 branches 往下拉。
//
// ⚠️ 版面本身這支測不出來（jsdom 沒有排版引擎）。「Email 不撐破版面」由
// e2e 的溢版巡檢守（`/admin#admin-setup` 路由）。這裡守的是**行為**。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequestJson = vi.fn();
vi.mock('../../utils/apiClient', () => ({
  apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
  buildApiUrl: (p: string) => p,
}));
vi.mock('../notifications/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showToast: vi.fn(),
    showWarning: vi.fn(),
  }),
}));

import { AdminSetup } from './AdminSetup';

afterEach(cleanup);
beforeEach(() => {
  apiRequestJson.mockReset();
});

const status = (over: Record<string, unknown> = {}) => ({
  success: true,
  isAdmin: true,
  canBecomeAdmin: false,
  hasExistingAdmin: true,
  userId: '00000000-0000-0000-0000-000000000001',
  userName: '王小明',
  userEmail: 'a@b.c',
  ...over,
});

describe('AdminSetup', () => {
  it('顯示後端回的帳號資訊——姓名與 Email 都要出得來', async () => {
    apiRequestJson.mockResolvedValue(status());
    render(<AdminSetup />);
    expect(await screen.findByText('王小明')).toBeTruthy();
    expect(screen.getByText('a@b.c')).toBeTruthy();
  });

  it('長 Email 照樣完整渲染，不做截斷', async () => {
    // 截斷會讓 admin 看不出自己登入的是哪個帳號。版面由溢版巡檢守，
    // 這裡守的是「內容沒有被 JS 砍掉」。
    const long = 'chienmingchangservice@uknowplatform.com.tw';
    apiRequestJson.mockResolvedValue(status({ userEmail: long }));
    render(<AdminSetup />);
    expect(await screen.findByText(long)).toBeTruthy();
  });

  it('後端沒回 userName 時整個帳號資訊區塊不渲染', async () => {
    // 這正是溢版巡檢曾經量出「假的乾淨」的成因:mock 少回 userName，
    // 條件渲染讓整塊消失，而巡檢因此以為這條路由是乾淨的。把這個條件
    // 釘起來，日後改動至少會在這裡露出來。
    apiRequestJson.mockResolvedValue(status({ userName: '' }));
    render(<AdminSetup />);
    await waitFor(() => expect(screen.queryByText('Email')).toBeNull());
  });

  it('取狀態失敗時不顯示帳號資訊', async () => {
    apiRequestJson.mockRejectedValue(new Error('network down'));
    render(<AdminSetup />);
    await waitFor(() => expect(screen.queryByText('a@b.c')).toBeNull());
  });
});
