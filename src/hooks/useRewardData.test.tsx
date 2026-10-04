// @vitest-environment jsdom
//
// 跨頁接力的契約：會員中心掛著 useRewardData、冷啟動請求還在飛時，使用者點
// 「可提領點數」卡進獎勵頁——新頁的實例會接上同一個 dedupe 請求（自己的 fetch
// 不會跑）。請求結束後它必須拿到資料或錯誤態，不能永遠停在載入中。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { DataCacheProvider } from '../contexts/DataCacheContext';
import { useRewardData, type UseRewardDataResult } from './useRewardData';
import { apiRequestJson } from '../utils/apiClient';

vi.mock('../utils/apiClient', () => ({
  apiRequestJson: vi.fn(),
  buildApiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {
    status = 0;
  },
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

const seen: Record<string, UseRewardDataResult> = {};
function Probe({ id }: { id: string }) {
  seen[id] = useRewardData();
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

describe('useRewardData', () => {
  it('接上別頁飛行中的請求時，請求完成後拿到資料', async () => {
    const rewards = deferred<unknown>();
    const withdrawals = deferred<unknown>();
    mockRequest.mockImplementation(((url: string) =>
      url === '/rewards' ? rewards.promise : withdrawals.promise) as never);

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      rewards.resolve({
        success: true,
        data: {
          availableRewards: 1200,
          pendingRewards: 0,
          withdrawnRewards: 0,
          totalEarned: 1200,
          hasWithdrawnToday: false,
        },
      });
      withdrawals.resolve({ success: true, data: { withdrawals: [] } });
    });

    await waitFor(() => expect(seen.b.isLoading).toBe(false));
    expect(seen.b.rewardsData?.availableRewards).toBe(1200);
    expect(seen.b.error).toBeNull();
  });

  it('接上的請求失敗時，給錯誤態而不是一直載入', async () => {
    const rewards = deferred<unknown>();
    mockRequest.mockImplementation((() => rewards.promise) as never);

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      rewards.reject(new Error('網路錯誤'));
    });

    await waitFor(() => expect(seen.b.isLoading).toBe(false));
    expect(seen.b.error).toBeTruthy();
  });
});
