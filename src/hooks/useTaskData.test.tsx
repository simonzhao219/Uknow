// @vitest-environment jsdom
//
// 跨頁接力的契約（同 useRewardData.test.tsx）：會員中心的冷啟動請求還在飛時
// 點「任務中心」卡進任務頁，新頁實例接上同一個 dedupe 請求，請求結束後必須
// 拿到資料或錯誤態，不能永遠停在載入中。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { DataCacheProvider } from '../contexts/DataCacheContext';
import { useTaskData, type UseTaskDataResult } from './useTaskData';
import { apiRequestJson } from '../utils/apiClient';

vi.mock('../utils/apiClient', () => ({
  apiRequestJson: vi.fn(),
  buildApiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));
vi.mock('../components/notifications/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showToast: vi.fn() }),
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

const seen: Record<string, UseTaskDataResult> = {};
function Probe({ id }: { id: string }) {
  seen[id] = useTaskData();
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

describe('useTaskData', () => {
  it('接上別頁飛行中的請求時，請求完成後拿到任務', async () => {
    const tasks = deferred<unknown>();
    const pending = deferred<unknown>();
    mockRequest.mockImplementation(((url: string) =>
      url === '/tasks' ? tasks.promise : pending.promise) as never);

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      tasks.resolve({
        success: true,
        data: { tasks: [{ id: 't1', type: 'monthly_king', current: 3, target: 8 }] },
      });
      pending.resolve({ success: true, data: [] });
    });

    await waitFor(() => expect(seen.b.isLoading).toBe(false));
    expect(seen.b.tasks).toHaveLength(1);
    expect(seen.b.error).toBeNull();
  });

  it('接上的請求失敗時，給錯誤態而不是一直載入', async () => {
    const tasks = deferred<unknown>();
    mockRequest.mockImplementation((() => tasks.promise) as never);

    const { rerender } = render(<Harness showA showB={false} />);
    rerender(<Harness showA={false} showB />);

    await act(async () => {
      tasks.reject(new Error('網路錯誤'));
    });

    await waitFor(() => expect(seen.b.isLoading).toBe(false));
    expect(seen.b.error).toBeTruthy();
  });
});

// 整頁讀取失敗的重試只重發那兩支請求（ui-ux-guidelines §6），不整頁重載。
describe('useTaskData.refetch', () => {
  it('冷啟動失敗後 refetch 重發任務與待領取請求，成功時清掉錯誤', async () => {
    let failing = true;
    mockRequest.mockImplementation(((url: string) => {
      if (failing) return Promise.reject(new Error('網路錯誤'));
      return url === '/tasks'
        ? Promise.resolve({
            success: true,
            data: { tasks: [{ id: 't1', type: 'monthly_king', current: 3, target: 8 }] },
          })
        : Promise.resolve({ success: true, data: [] });
    }) as never);
    render(<Harness showA showB={false} />);
    await waitFor(() => expect(seen.a.error).toBeTruthy());
    expect(seen.a.isLoading).toBe(false);

    failing = false;
    mockRequest.mockClear();
    await act(async () => {
      seen.a.refetch();
    });

    await waitFor(() => expect(seen.a.tasks).toHaveLength(1));
    expect(seen.a.error).toBeNull();
    expect(seen.a.isLoading).toBe(false);
    expect(mockRequest.mock.calls.map(([url]) => url).sort()).toEqual([
      '/tasks',
      '/tasks/pending-rewards',
    ]);
  });
});
