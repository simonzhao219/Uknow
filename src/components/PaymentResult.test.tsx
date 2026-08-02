// @vitest-environment jsdom
// 階段 9（renewal-backfill / AC-3）：PaymentResult 區分補繳中間筆。
// completed 且 renewal.backfillCount > 0 → 不進 45 秒開通輪詢、不逾時
// 錯誤，顯示補繳進度（訂單編號＋保證句＋兩個 CTA）；orderStatus 仍
// pending 時先橋接輪詢 /payuni/result，到位後切新分支；backfillCount=0
// 未 active 走原開通輪詢（不回歸）；renewal 取不到 → 付款成功＋重試，
// 不落回逾時錯誤畫面。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  apiRequestJson: vi.fn(),
  navigate: vi.fn(),
  showToast: vi.fn(),
  refreshUser: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('../utils/apiClient', () => ({
  apiRequestJson: h.apiRequestJson,
  buildApiUrl: (p: string) => p,
}));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [h.searchParams],
  useNavigate: () => h.navigate,
}));
vi.mock('../App', async () => {
  const { createContext } = await import('react');
  return {
    // 補繳中間筆的核心情境：付款成功但會籍仍 expired。
    UserContext: createContext<any>({
      user: { accountStatus: 'expired' },
      refreshUser: h.refreshUser,
    }),
  };
});
vi.mock('../contexts/DataCacheContext', () => ({
  useDataCache: () => ({ invalidate: vi.fn() }),
}));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: h.showToast, showSuccess: vi.fn() }),
}));

import { PaymentResult } from './PaymentResult';

type SlimRenewal = { backfillCount: number; backfillAmount: number; extendEndDate: string } | null;

function resultResponse(orderStatus: string, renewal: SlimRenewal) {
  return {
    success: true,
    data: {
      orderStatus,
      completedAt: '2026-05-02T04:00:00Z',
      payuni: { Status: 'SUCCESS' },
      paidAwaitingActivation: false,
      renewal,
    },
  };
}

const BACKFILL_2 = { backfillCount: 2, backfillAmount: 2400, extendEndDate: '2026-04-02' };

beforeEach(() => {
  h.searchParams = new URLSearchParams({ tradeNo: 'UK20260502TEST', status: 'SUCCESS' });
  h.refreshUser.mockResolvedValue({ accountStatus: 'expired' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('PaymentResult 補繳中間筆', () => {
  it('completed 且 backfillCount>0 時，顯示補繳進度且不進開通輪詢', async () => {
    h.apiRequestJson.mockResolvedValue(resultResponse('completed', BACKFILL_2));
    render(<PaymentResult />);

    const view = await screen.findByTestId('payment-result-backfill-progress');
    expect(screen.queryByTestId('payment-result-activating')).toBeNull();
    expect(screen.queryByTestId('payment-result-activation-timeout')).toBeNull();
    // 進度三要素：已補至（extendEndDate − 1 年）、還差筆數、總額。
    expect(view.textContent).toContain('2025-04-02');
    expect(view.textContent).toContain('2 筆');
    expect(view.textContent).toMatch(/NT\$\s?2,400/);
    // 訂單編號與付款保證句（與同頁其他狀態的既有風格對齊）。
    expect(view.textContent).toContain('UK20260502TEST');
    expect(view.textContent).toContain('不會重複扣款');
    // 開通輪詢完全不啟動。
    expect(h.refreshUser).not.toHaveBeenCalled();
  });

  it('繼續補繳導向結帳頁；稍後再說導向首頁並顯示提示', async () => {
    h.apiRequestJson.mockResolvedValue(resultResponse('completed', BACKFILL_2));
    render(<PaymentResult />);
    await screen.findByTestId('payment-result-backfill-progress');

    fireEvent.click(screen.getByTestId('continue-backfill-button'));
    expect(h.navigate).toHaveBeenCalledWith('/payment/checkout');

    fireEvent.click(screen.getByTestId('backfill-later-button'));
    // 不可導向任何會員頁——RequireMembershipRoute 會把 expired 使用者
    // 彈回結帳頁，剛按「稍後再說」就被抓回去比留在原頁更糟。
    expect(h.navigate).toHaveBeenCalledWith('/', expect.anything());
    expect(h.showToast).toHaveBeenCalled();
  });

  it('orderStatus 仍 pending 時先橋接輪詢，completed 後切到補繳進度', async () => {
    vi.useFakeTimers();
    h.apiRequestJson
      .mockResolvedValueOnce(resultResponse('pending', null))
      .mockResolvedValue(resultResponse('completed', BACKFILL_2));

    render(<PaymentResult />);
    await act(async () => {});
    // 橋接期間不是逾時錯誤、也還不是補繳分支。
    expect(screen.queryByTestId('payment-result-activation-timeout')).toBeNull();
    expect(screen.queryByTestId('payment-result-backfill-progress')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByTestId('payment-result-backfill-progress')).toBeTruthy();
  });

  it('backfillCount 為 0 且尚未 active 時，維持原開通輪詢（不回歸）', async () => {
    vi.useFakeTimers();
    h.apiRequestJson.mockResolvedValue(
      resultResponse('completed', {
        backfillCount: 0,
        backfillAmount: 0,
        extendEndDate: '2027-05-01',
      }),
    );
    render(<PaymentResult />);
    await act(async () => {});

    expect(screen.getByTestId('payment-result-activating')).toBeTruthy();
    expect(screen.queryByTestId('payment-result-backfill-progress')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(h.refreshUser).toHaveBeenCalled();
  });

  it('completed 但回應缺 renewal 欄位時，走原開通輪詢而非降級畫面', async () => {
    // 舊後端形狀（部署 skew）或舊 mock：completed 回應沒有 renewal。
    // 非補繳使用者不能因此從「開通中」退化成降級畫面（e2e 開通兩情境
    // 的迴歸防線）。
    vi.useFakeTimers();
    h.apiRequestJson.mockResolvedValue(resultResponse('completed', null));
    render(<PaymentResult />);
    await act(async () => {});

    expect(screen.getByTestId('payment-result-activating')).toBeTruthy();
    expect(screen.queryByTestId('payment-result-renewal-unavailable')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(h.refreshUser).toHaveBeenCalled();
  });

  it('renewal 取不到時顯示付款成功與重試，不落入逾時錯誤畫面', async () => {
    h.apiRequestJson
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(resultResponse('completed', BACKFILL_2));

    render(<PaymentResult />);
    const degraded = await screen.findByTestId('payment-result-renewal-unavailable');
    expect(degraded.textContent).toContain('UK20260502TEST');
    expect(degraded.textContent).toContain('進度暫時無法讀取');
    expect(screen.queryByTestId('payment-result-activation-timeout')).toBeNull();

    fireEvent.click(screen.getByTestId('retry-renewal-button'));
    expect(await screen.findByTestId('payment-result-backfill-progress')).toBeTruthy();
  });
});
