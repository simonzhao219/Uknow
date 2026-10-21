// @vitest-environment jsdom
//
// 跨頁接力的契約（同 useRewardData.test.tsx）：會員中心的冷啟動請求還在飛時
// 點「推薦網絡」卡進推薦頁，新頁實例接上同一個 dedupe 請求，請求結束後必須
// 拿到資料或錯誤態，不能永遠停在載入中（推薦頁的載入畫面沒有重試鈕）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { DataCacheProvider } from '../contexts/DataCacheContext';
import { useReferralData, type UseReferralDataResult } from './useReferralData';
import { apiRequestJson } from '../utils/apiClient';
import { readStoredSort } from '../utils/referralNetwork';

vi.mock('../utils/apiClient', () => ({
  apiRequestJson: vi.fn(),
  buildApiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));
vi.mock('../components/notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

const mockRequest = vi.mocked(apiRequestJson);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const seen: Record<string, UseReferralDataResult> = {};
function Probe({ id }: { id: string }) {
  seen[id] = useReferralData();
  return null;
}
function Harness({ showA, showB }: { showA: boolean; showB: boolean }) {
  return (
    <DataCacheProvider>
      {showA && <Probe id="a" />}
      {showB && <Probe id="b" />}
    </DataCacheProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('useReferralData', () => {
  it('接上別頁飛行中的請求時，請求完成後拿到推薦網絡', async () => {
    const overview = deferred<unknown>();
    mockRequest.mockImplementation((() => overview.promise) as never);

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      overview.resolve({
        success: true,
        data: {
          userReferralCode: 'UK1',
          sort: readStoredSort(),
          roots: [],
          attention: { total: 0, items: [] },
          summary: { firstGenCount: 2, secondGenCount: 1, thirdGenCount: 0, totalReferrals: 3 },
        },
      });
    });

    await waitFor(() => expect(seen.b.loading).toBe(false));
    expect(seen.b.overview?.summary.totalReferrals).toBe(3);
    expect(seen.b.error).toBeNull();
  });

  it('接上的請求失敗時，給錯誤態而不是一直載入', async () => {
    const overview = deferred<unknown>();
    mockRequest.mockImplementation((() => overview.promise) as never);

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      overview.reject(new Error('網路錯誤'));
    });

    await waitFor(() => expect(seen.b.loading).toBe(false));
    expect(seen.b.error).toBeTruthy();
  });
});

// 「全部 N 位 ›」的分頁清單（B1 的 GET /referrals/network/attention）：前端只是帶 limit／offset
// 的薄包裝，total 是全部人數（不受分頁影響），由 usePagedList 的「已顯示 X / Y」使用。
describe('useReferralData.loadAttention', () => {
  const never = () => new Promise(() => {});

  it('帶 limit 與 offset 打 attention 端點，回傳該頁 items 與全部人數 total', async () => {
    mockRequest.mockImplementation(((url: string) =>
      url.includes('/referrals/network/attention')
        ? Promise.resolve({
            success: true,
            data: { total: 45, limit: 20, offset: 20, items: [{ userId: 'u1' }] },
          })
        : never()) as never);
    render(<Harness showA showB={false} />);

    const page = await seen.a.loadAttention({ limit: 20, offset: 20 });

    expect(mockRequest).toHaveBeenCalledWith('/referrals/network/attention?limit=20&offset=20');
    expect(page).toEqual({ items: [{ userId: 'u1' }], total: 45 });
  });

  it('後端回 success 為 false 時丟錯，不回空清單', async () => {
    mockRequest.mockImplementation(((url: string) =>
      url.includes('/referrals/network/attention')
        ? Promise.resolve({ success: false })
        : never()) as never);
    render(<Harness showA showB={false} />);

    await expect(seen.a.loadAttention({ limit: 20, offset: 0 })).rejects.toThrow();
  });
});
