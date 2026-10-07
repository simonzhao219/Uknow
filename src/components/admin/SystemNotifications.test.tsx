// @vitest-environment jsdom
//
// 系統公告分頁。這支存在的理由是 U6 的驗收 ＋ N1 的覆蓋率前置條件:
// 本檔原本零測試，而 P15（公告內文的長網址撐破版面，
// 實測 +153px）正是「沒人在守」的後果——巡檢當時給的是空清單，只渲染
// 「尚無公告」，那一整列從未被畫出來過。
//
// ⚠️ 版面由 e2e 溢版巡檢守（`/admin#announcements`）。這裡守行為。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { nextStamp } from '../../hooks/useLatestRequest';
import { createAdminCache } from './adminCache';
import type { AdminBusy } from './adminBusy';

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

// --- S5 階段 6：快取、骨架、錯誤區與寫入協議 ----------------------------------------------
//
// 公告列表切回時拿快取當種子：立即出現、背景重讀；刪除不受閘門約束。沒有任何資料時的讀取失敗
// 是共用錯誤區（同頁另有流程鈕「發布公告」，重試用次要），不再說「尚無公告」。沒有工具列：
// 陳舊提示的失敗與逾時都附重試。寫入走 runAdminWrite：建立／刪除成功與結果不明讓公告快取失效
// 並重讀（K3），後端拒絕不失效、只說出原因。

type Ann = ReturnType<typeof announcement>;
const listOf = (items: Ann[]) => ({ success: true, data: { announcements: items } });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function seedAnnouncements(items: Ann[]) {
  const cache = createAdminCache();
  cache.write(
    'announcements:list',
    { items, total: items.length, fetchedAt: Date.now() },
    nextStamp(),
  );
  return cache;
}

/** 依方法分派：GET 讀列表、POST 建立、DELETE 刪除。 */
function route(opts: {
  list?: () => Promise<unknown>;
  create?: () => Promise<unknown>;
  remove?: () => Promise<unknown>;
}) {
  apiRequestJson.mockImplementation((_url: unknown, init?: { method?: string }) => {
    if (init?.method === 'POST') return opts.create?.() ?? Promise.resolve({ success: true });
    if (init?.method === 'DELETE') return opts.remove?.() ?? Promise.resolve({ success: true });
    return opts.list?.() ?? Promise.resolve(listOf([]));
  });
}

const gets = () =>
  apiRequestJson.mock.calls.filter(
    ([, init]) => !(init as { method?: string } | undefined)?.method,
  );
const rejected = (message: string, status = 409) => Object.assign(new Error(message), { status });
const listRegion = () => screen.getByRole('region', { name: '公告列表' });

function fakeBusy(): AdminBusy & { release: ReturnType<typeof vi.fn> } {
  const release = vi.fn();
  return {
    locked: false,
    noteId: '',
    release,
    startWrite: vi.fn(() => release),
    startExport: vi.fn(() => ({ progress: vi.fn(), end: vi.fn() })),
  };
}

async function fillAndPublish() {
  fireEvent.change(screen.getByLabelText('公告標題'), { target: { value: '今晚停機' } });
  fireEvent.change(screen.getByLabelText('公告內容'), { target: { value: '22:00 起停機一小時' } });
  fireEvent.click(screen.getByRole('button', { name: /發布公告/ }));
}

describe('SystemNotifications 讀取', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次載入是骨架，不是置中的轉圈', async () => {
    const pending = deferred<unknown>();
    route({ list: () => pending.promise });
    render(<SystemNotifications />);
    expect(screen.getByRole('status', { name: '載入公告中' })).toBeTruthy();
    await act(async () => pending.resolve(listOf([])));
    expect(screen.getByText('尚無公告')).toBeTruthy();
  });

  it('讀取失敗且沒有資料時顯示錯誤區與次要重試，不再說「尚無公告」', async () => {
    route({ list: () => Promise.reject(new Error('連線失敗')) });
    render(<SystemNotifications />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('連線失敗')).toBeTruthy();
    expect(within(alert).getByRole('button', { name: '重試' }).classList.contains('bg-card')).toBe(
      true,
    );
    expect(screen.queryByText('尚無公告')).toBeNull();
  });

  it('帶快取重掛時公告立即出現、不出骨架，並在背景重讀', async () => {
    const cache = seedAnnouncements([announcement()]);
    const pending = deferred<unknown>();
    route({ list: () => pending.promise });
    render(<SystemNotifications cache={cache} />);
    expect(screen.queryByRole('status', { name: '載入公告中' })).toBeNull();
    expect(screen.getByText('系統維護預告')).toBeTruthy();
    expect(listRegion().getAttribute('aria-busy')).toBe('true');

    await act(async () => pending.resolve(listOf([announcement({ title: '新的公告' })])));
    expect(screen.getByText('新的公告')).toBeTruthy();
    expect(listRegion().getAttribute('aria-busy')).not.toBe('true');
  });

  it('背景更新失敗時保留舊列並提示，附重試（沒有工具列）', async () => {
    const cache = seedAnnouncements([announcement()]);
    route({ list: () => Promise.reject(new Error('連線中斷')) });
    render(<SystemNotifications cache={cache} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('更新失敗，以下是剛剛的資料');
    expect(alert.textContent).toContain('連線中斷');
    expect(within(alert).getByRole('button', { name: '重試' })).toBeTruthy();
    expect(screen.getByText('系統維護預告')).toBeTruthy();
  });

  it('逾時且有舊列時提示更新較久並附重試', () => {
    vi.useFakeTimers();
    const cache = seedAnnouncements([announcement()]);
    route({ list: () => new Promise(() => {}) });
    render(<SystemNotifications cache={cache} />);
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByText(/更新較久，以下是剛剛的資料/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });

  it('讀取回 403 時清空快取', async () => {
    const cache = seedAnnouncements([announcement()]);
    route({ list: () => Promise.reject(rejected('沒有權限', 403)) });
    render(<SystemNotifications cache={cache} />);
    expect(await screen.findByText('沒有權限')).toBeTruthy();
    expect(screen.queryByText('系統維護預告')).toBeNull();
    expect(cache.read('announcements:list')).toBeUndefined();
  });
});

describe('SystemNotifications 寫入', () => {
  it('刪除不受閘門約束：背景更新途中照常可按並送出', async () => {
    const cache = seedAnnouncements([announcement()]);
    route({ list: () => new Promise(() => {}) });
    render(<SystemNotifications cache={cache} />);
    const del = screen.getByRole('button', { name: '刪除公告' });
    expect(del.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(del);
    await waitFor(() =>
      expect(apiRequestJson).toHaveBeenCalledWith('/admin/announcements/ann-1', {
        method: 'DELETE',
      }),
    );
  });

  it.each([
    ['成功', () => Promise.resolve({ success: true }), ['announcementDelete'], 2],
    ['結果不明', () => Promise.reject(new TypeError('Failed to fetch')), ['announcementDelete'], 2],
    ['被後端拒絕', () => Promise.reject(rejected('找不到這則公告', 404)), [], 1],
  ] as const)('刪除%s時的失效事件與重讀', async (_label, remove, expected, reads) => {
    const cache = createAdminCache();
    const invalidate = vi.spyOn(cache, 'invalidate');
    route({ list: async () => listOf([announcement()]), remove });
    render(<SystemNotifications cache={cache} />);
    fireEvent.click(await screen.findByRole('button', { name: '刪除公告' }));
    await waitFor(() =>
      expect(apiRequestJson).toHaveBeenCalledWith('/admin/announcements/ann-1', {
        method: 'DELETE',
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(invalidate.mock.calls.map(([event]) => event)).toEqual(expected);
    expect(gets()).toHaveLength(reads);
  });

  it.each([
    ['成功', () => Promise.resolve({ success: true }), ['announcementCreate'], 2],
    ['結果不明', () => Promise.reject(new TypeError('Failed to fetch')), ['announcementCreate'], 2],
    ['被後端拒絕', () => Promise.reject(rejected('標題過長', 400)), [], 1],
  ] as const)('建立%s時的失效事件與重讀', async (_label, create, expected, reads) => {
    const cache = createAdminCache();
    const invalidate = vi.spyOn(cache, 'invalidate');
    route({ list: async () => listOf([]), create });
    render(<SystemNotifications cache={cache} />);
    await screen.findByText('尚無公告');
    await fillAndPublish();
    await waitFor(() =>
      expect(apiRequestJson.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(invalidate.mock.calls.map(([event]) => event)).toEqual(expected);
    expect(gets()).toHaveLength(reads);
  });

  // 沒收到確認就再按一次，最壞的結果是同一則公告發兩次。
  it('建立沒收到伺服器確認時提醒先確認公告列表，再決定是否重發', async () => {
    route({ list: async () => listOf([]), create: () => Promise.reject(new TypeError('x')) });
    render(<SystemNotifications />);
    await screen.findByText('尚無公告');
    await fillAndPublish();
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        '未收到伺服器確認，結果不明，請確認公告列表後再決定是否重發',
        'warning',
      ),
    );
  });

  it('刪除沒收到伺服器確認時提醒確認公告列表', async () => {
    route({
      list: async () => listOf([announcement()]),
      remove: () => Promise.reject(new TypeError('x')),
    });
    render(<SystemNotifications />);
    fireEvent.click(await screen.findByRole('button', { name: '刪除公告' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        '未收到伺服器確認，結果不明，請確認公告列表',
        'warning',
      ),
    );
  });

  // 主 #43：h-7 w-7 把 icon 鈕壓成 28px，低於觸控 44px（ui-ux §1）。
  it('刪除鈕維持 icon 鈕的尺寸（觸控 44px），不再壓成 28px', async () => {
    route({ list: async () => listOf([announcement()]) });
    render(<SystemNotifications />);
    const del = await screen.findByRole('button', { name: '刪除公告' });
    expect(del.classList.contains('h-7')).toBe(false);
    expect(del.classList.contains('w-7')).toBe(false);
  });

  it('刪除後那一則離開列表時，焦點移到下一則', async () => {
    let removed = false;
    const second = announcement({ id: 'ann-2', title: '第二則公告' });
    route({
      list: async () => listOf(removed ? [second] : [announcement(), second]),
      remove: async () => {
        removed = true;
        return { success: true };
      },
    });
    render(<SystemNotifications />);
    const first = await screen.findByRole('group', { name: '系統維護預告' });
    fireEvent.click(within(first).getByRole('button', { name: '刪除公告' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('group', { name: '第二則公告' })),
    );
  });

  it('寫入期間呼叫 busy，寫入一結算就釋放', async () => {
    const busy = fakeBusy();
    const pending = deferred<unknown>();
    route({ list: async () => listOf([announcement()]), remove: () => pending.promise });
    render(<SystemNotifications busy={busy} />);
    fireEvent.click(await screen.findByRole('button', { name: '刪除公告' }));
    await waitFor(() => expect(busy.startWrite).toHaveBeenCalledTimes(1));
    expect(busy.release).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ success: true }));
    expect(busy.release).toHaveBeenCalledTimes(1);
  });
});
