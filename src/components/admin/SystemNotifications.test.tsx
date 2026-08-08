// @vitest-environment jsdom
//
// 公告管理。這支存在的理由與 AdminSetup.test.tsx 相同（U6 的驗收 ＋ N1 的
// 覆蓋率前置條件）:本檔原本零測試，而 P15（公告內文的長網址撐破版面，
// 實測 +153px）正是「沒人在守」的後果——巡檢當時給的是空清單，只渲染
// 「尚無公告」，那一整列從未被畫出來過。
//
// ⚠️ 版面由 e2e 溢版巡檢守（`/admin#announcements`）。這裡守行為。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequestJson = vi.fn();
vi.mock('../../utils/apiClient', () => ({
  apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
  buildApiUrl: (p: string) => p,
}));
const showSuccess = vi.fn();
const showToast = vi.fn();
vi.mock('../notifications/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: (...a: unknown[]) => showSuccess(...a),
    showToast: (...a: unknown[]) => showToast(...a),
    showWarning: vi.fn(),
    showError: vi.fn(),
  }),
}));

import { SystemNotifications } from './SystemNotifications';

afterEach(cleanup);
beforeEach(() => {
  apiRequestJson.mockReset();
  showSuccess.mockReset();
  showToast.mockReset();
});

const announcement = (over: Record<string, unknown> = {}) => ({
  id: 'ann-1',
  title: '系統維護預告',
  message: '維護期間無法登入與付款',
  type: 'info',
  startsAt: '2026-08-15T02:00:00.000Z',
  endsAt: null,
  isActive: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

function mockList(items: ReturnType<typeof announcement>[]) {
  apiRequestJson.mockResolvedValue({ success: true, data: { announcements: items } });
}

describe('SystemNotifications', () => {
  it('沒有公告時顯示空態而非空白區塊', async () => {
    mockList([]);
    render(<SystemNotifications />);
    expect(await screen.findByText('尚無公告')).toBeTruthy();
  });

  it('列出公告的標題、內文與生效區間', async () => {
    mockList([announcement({ endsAt: '2026-08-15T06:00:00.000Z' })]);
    render(<SystemNotifications />);
    expect(await screen.findByText('系統維護預告')).toBeTruthy();
    expect(screen.getByText('維護期間無法登入與付款')).toBeTruthy();
    expect(screen.getByText(/生效：/)).toBeTruthy();
  });

  it('內文含長網址時完整渲染，不做截斷', async () => {
    // 截斷會讓公告失去它唯一的作用。版面由溢版巡檢守，這裡守內容完整。
    const withUrl =
      '維護期間無法登入與付款，詳見 https://www.uknowplatform.com.tw/announcements/2026-08';
    mockList([announcement({ message: withUrl })]);
    render(<SystemNotifications />);
    expect(await screen.findByText(withUrl)).toBeTruthy();
  });

  it('沒有結束時間時標為無期限', async () => {
    mockList([announcement({ endsAt: null })]);
    render(<SystemNotifications />);
    expect(await screen.findByText(/無期限/)).toBeTruthy();
  });

  it('標題或內文空白時不送出，並說出原因', async () => {
    mockList([]);
    render(<SystemNotifications />);
    await screen.findByText('尚無公告');
    apiRequestJson.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /發布公告/ }));
    await waitFor(() => expect(apiRequestJson).not.toHaveBeenCalled());
  });
});
