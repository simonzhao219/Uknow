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
