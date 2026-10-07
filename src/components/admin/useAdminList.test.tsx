// @vitest-environment jsdom
//
// usePagedList 與後台記憶體快取的組合。
//
// 這支測試刻意用**真的 hook＋真的 store**：失效戳（store 的 fence）與請求戳
// （usePagedList 的 ticket）必須取自同一條序列，「請求戳 < fence」才等於「請求在
// 失效之前送出」。只拿假 store 驗，兩邊各自從 0 起算也會照綠——那正是要擋的錯。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { nextStamp } from '../../hooks/useLatestRequest';
import type { PagedResult } from '../../hooks/usePagedList';
import {
  type AdminCache,
  type AdminQuery,
  type MemberListParams,
  adminQuery,
  createAdminCache,
} from './adminCache';
import { type UseAdminList, useAdminList } from './useAdminList';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  // 測試裡改過的 visibilityState 是 own property，刪掉就回到 jsdom 原本的 getter。
  Reflect.deleteProperty(document, 'visibilityState');
});

interface Row {
  id: string;
}
type Page = PagedResult<Row>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function controlled<P>() {
  const calls: { params: P; offset: number; d: ReturnType<typeof deferred<Page>> }[] = [];
  const load = (params: P, { offset }: { limit: number; offset: number }) => {
    const d = deferred<Page>();
    calls.push({ params, offset, d });
    return d.promise;
  };
  return { calls, load };
}

const page = (ids: string[], total = ids.length): Page => ({
  items: ids.map((id) => ({ id })),
  total,
});
const forbidden = () => Object.assign(new Error('沒有權限'), { status: 403 });

function Probe<P>({
  cache,
  query,
  load,
  onList,
}: {
  cache?: AdminCache;
  query: AdminQuery<P>;
  load: (params: P, page: { limit: number; offset: number }) => Promise<Page>;
  onList?: (list: UseAdminList<Row>) => void;
}) {
  const list = useAdminList<Row, unknown, P>({ cache, query, load, pageSize: 2 });
  onList?.(list);
  return (
    <div>
      <span data-testid="items">{list.items.map((i) => i.id).join(',')}</span>
      <span data-testid="error">{list.error ?? ''}</span>
      <span data-testid="loading">{String(list.isLoading)}</span>
      <span data-testid="confirmed">{String(list.isConfirmed)}</span>
      <span data-testid="slow">{String(list.isSlow)}</span>
      <span data-testid="version">{list.dataVersion}</span>
      <span data-testid="fetched-at">{list.fetchedAt ?? ''}</span>
      <span data-testid="now">{list.now}</span>
      <button type="button" onClick={() => void list.reload()}>
        reload
      </button>
    </div>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const reload = () => fireEvent.click(screen.getByRole('button', { name: 'reload' }));
const ids = (snapshot: { items: unknown[] } | undefined) =>
  snapshot?.items.map((i) => (i as Row).id) ?? null;

describe('useAdminList 查詢身分', () => {
  it('非空白搜尋 A→B 各自重讀，load 收到各自的查詢條件', () => {
    const cache = createAdminCache();
    const { calls, load } = controlled<MemberListParams>();
    const { rerender } = render(
      <Probe cache={cache} query={adminQuery.members({ search: 'A' })} load={load} />,
    );
    rerender(<Probe cache={cache} query={adminQuery.members({ search: 'B' })} load={load} />);
    expect(calls.map((c) => c.params.search)).toEqual(['A', 'B']);
  });

  it('null 槽的重新整理讀的是最新的搜尋字，舊閉包也一樣', async () => {
    const cache = createAdminCache();
    const { calls, load } = controlled<MemberListParams>();
    let reloadFromA: (() => Promise<unknown>) | undefined;
    const { rerender } = render(
      <Probe
        cache={cache}
        query={adminQuery.members({ search: 'A' })}
        load={load}
        onList={(l) => {
          reloadFromA ??= l.reload;
        }}
      />,
    );
    rerender(<Probe cache={cache} query={adminQuery.members({ search: 'B' })} load={load} />);
    await act(async () => calls[calls.length - 1].d.resolve(page(['b1'])));

    await act(async () => {
      void reloadFromA?.();
    });
    expect(calls[calls.length - 1].params.search).toBe('B');
  });
});

describe('useAdminList 種子與寫回', () => {
  it('帶快取重掛時第一個 render 就顯示快取，不出骨架', () => {
    const cache = createAdminCache();
    cache.write('withdrawals:all', { ...page(['w0']), fetchedAt: 1_000 }, nextStamp());
    const { load } = controlled<unknown>();
    const renders: UseAdminList<Row>[] = [];
    render(
      <Probe
        cache={cache}
        query={adminQuery.withdrawals({ status: 'all' })}
        load={load}
        onList={(l) => renders.push(l)}
      />,
    );
    expect(renders[0].items.map((i) => i.id)).toEqual(['w0']);
    expect(renders[0].isLoading).toBe(false);
    expect(renders[0].isConfirmed).toBe(false);
  });

  it('落地寫回快取並記下牆鐘時間；有種子時先帶種子的原始時間', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    const cache = createAdminCache();
    cache.write('withdrawals:all', { ...page(['w0']), fetchedAt: 1_000 }, nextStamp());
    const { calls, load } = controlled<unknown>();
    render(<Probe cache={cache} query={adminQuery.withdrawals({ status: 'all' })} load={load} />);
    expect(text('fetched-at')).toBe('1000');

    await act(async () => calls[0].d.resolve(page(['w1'])));
    expect(text('fetched-at')).toBe('50000');
    expect(cache.read('withdrawals:all')).toEqual({ ...page(['w1']), fetchedAt: 50_000 });
  });

  it('重讀到空結果時刪掉快取裡的舊條目', async () => {
    const cache = createAdminCache();
    const { calls, load } = controlled<unknown>();
    render(
      <Probe cache={cache} query={adminQuery.withdrawals({ status: 'pending' })} load={load} />,
    );
    await act(async () => calls[0].d.resolve(page(['w1'])));
    expect(ids(cache.read('withdrawals:pending'))).toEqual(['w1']);

    reload();
    await act(async () => calls[1].d.resolve(page([])));
    expect(cache.read('withdrawals:pending')).toBeUndefined();
  });

  it('資料版本在每次接受的落地 +1，被拒的落地不算', async () => {
    const cache = createAdminCache();
    const { calls, load } = controlled<unknown>();
    render(<Probe cache={cache} query={adminQuery.withdrawals({ status: 'all' })} load={load} />);
    await act(async () => calls[0].d.resolve(page(['w1'])));
    expect(text('version')).toBe('1');

    reload();
    act(() => cache.invalidate('withdrawalStatus'));
    await act(async () => calls[1].d.resolve(page(['stale'])));
    expect(text('version')).toBe('1');
    await act(async () => calls[2].d.resolve(page(['w2'])));
    expect(text('version')).toBe('2');
  });
});

describe('useAdminList 落地驗證', () => {
  it('失效之前送出的讀取不寫回，落地判為未確認並補讀', async () => {
    const cache = createAdminCache();
    const { calls, load } = controlled<unknown>();
    render(<Probe cache={cache} query={adminQuery.withdrawals({ status: 'all' })} load={load} />);
    await act(async () => calls[0].d.resolve(page(['w1'])));

    reload();
    act(() => cache.invalidate('withdrawalStatus'));
    await act(async () => calls[1].d.resolve(page(['stale'])));
    expect(cache.read('withdrawals:all')).toBeUndefined();
    expect(text('confirmed')).toBe('false');
    expect(calls).toHaveLength(3);

    await act(async () => calls[2].d.resolve(page(['w2'])));
    expect(ids(cache.read('withdrawals:all'))).toEqual(['w2']);
    expect(text('items')).toBe('w2');
    expect(text('confirmed')).toBe('true');
  });

  it('先失效、再重讀的結果照常寫回，不補讀', async () => {
    const cache = createAdminCache();
    const { calls, load } = controlled<unknown>();
    render(<Probe cache={cache} query={adminQuery.withdrawals({ status: 'all' })} load={load} />);
    await act(async () => calls[0].d.resolve(page(['w1'])));

    act(() => cache.invalidate('withdrawalStatus'));
    reload();
    await act(async () => calls[1].d.resolve(page(['w2'])));
    expect(calls).toHaveLength(2);
    expect(ids(cache.read('withdrawals:all'))).toEqual(['w2']);
    expect(text('confirmed')).toBe('true');
  });

  it('null 槽的非空白搜尋也受 fence 約束，且不寫進快取', async () => {
    const cache = createAdminCache();
    const { calls, load } = controlled<MemberListParams>();
    render(<Probe cache={cache} query={adminQuery.members({ search: '王' })} load={load} />);
    await act(async () => calls[0].d.resolve(page(['m1'])));
    expect(text('confirmed')).toBe('true');

    reload();
    act(() => cache.invalidate('memberSuspend'));
    await act(async () => calls[1].d.resolve(page(['stale'])));
    expect(calls).toHaveLength(3);
    expect(text('confirmed')).toBe('false');
    expect(cache.read('members:list')).toBeUndefined();
  });

  it('accessLost 之後在途的舊讀取不寫回', async () => {
    const cache = createAdminCache();
    const { calls, load } = controlled<unknown>();
    render(<Probe cache={cache} query={adminQuery.withdrawals({ status: 'all' })} load={load} />);

    act(() => cache.invalidate('accessLost'));
    await act(async () => calls[0].d.resolve(page(['w1'])));
    expect(cache.read('withdrawals:all')).toBeUndefined();
    expect(calls).toHaveLength(2);
  });
});

describe('useAdminList 403', () => {
  it('列表讀取回 403 時清空全部快取與切回位置，畫面丟掉舊列', async () => {
    const cache = createAdminCache();
    cache.write('members:list', { ...page(['m1']), fetchedAt: 1_000 }, nextStamp());
    cache.writeView({ withdrawalStatus: 'pending' });
    const { calls, load } = controlled<unknown>();
    render(<Probe cache={cache} query={adminQuery.withdrawals({ status: 'all' })} load={load} />);
    await act(async () => calls[0].d.resolve(page(['w1'])));

    reload();
    await act(async () => calls[1].d.reject(forbidden()));
    expect(cache.read('members:list')).toBeUndefined();
    expect(cache.read('withdrawals:all')).toBeUndefined();
    expect(cache.readView().withdrawalStatus).toBe('all');
    expect(text('items')).toBe('');
    expect(text('error')).toBe('沒有權限');
  });

  it('證件審核這種 null 槽、不比對 fence 的讀取回 403，也清空全部快取', async () => {
    const cache = createAdminCache();
    cache.write('withdrawals:all', { ...page(['w1']), fetchedAt: 1_000 }, nextStamp());
    expect(ids(cache.read('withdrawals:all'))).toEqual(['w1']);
    const { calls, load } = controlled<unknown>();
    render(<Probe cache={cache} query={adminQuery.idReviews()} load={load} />);
    await act(async () => calls[0].d.reject(forbidden()));
    expect(cache.read('withdrawals:all')).toBeUndefined();
  });

  it('匯出用的 loadPage 帶當下的查詢條件，回 403 時同樣清空快取', async () => {
    const cache = createAdminCache();
    cache.write('members:list', { ...page(['m1']), fetchedAt: 1_000 }, nextStamp());
    expect(ids(cache.read('members:list'))).toEqual(['m1']);
    const { calls, load } = controlled<{ status: string }>();
    let list!: UseAdminList<Row>;
    render(
      <Probe
        cache={cache}
        query={adminQuery.withdrawals({ status: 'pending' })}
        load={load}
        onList={(l) => (list = l)}
      />,
    );
    const exported = list.loadPage({ limit: 50, offset: 50 });
    const call = calls[calls.length - 1];
    expect(call.params.status).toBe('pending');
    expect(call.offset).toBe(50);

    call.d.reject(forbidden());
    await expect(exported).rejects.toThrow('沒有權限');
    expect(cache.read('members:list')).toBeUndefined();
  });
});

describe('useAdminList 資料時間與慢更新', () => {
  it('頁面可見時每 60 秒重算 now，隱藏時不重算，切回可見或取得焦點時立即重算', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { load } = controlled<unknown>();
    render(<Probe query={adminQuery.withdrawals({ status: 'all' })} load={load} />);
    expect(text('now')).toBe('100000');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(text('now')).toBe('160000');

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(text('now')).toBe('160000');

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(text('now')).toBe('220000');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(text('now')).toBe('250000');
  });

  it('同一次重讀滿 15 秒進 isSlow，手動重試立即歸零，再滿 15 秒才重進', () => {
    vi.useFakeTimers();
    const { load } = controlled<unknown>();
    render(<Probe query={adminQuery.withdrawals({ status: 'all' })} load={load} />);

    act(() => {
      vi.advanceTimersByTime(14_999);
    });
    expect(text('slow')).toBe('false');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(text('slow')).toBe('true');

    reload();
    expect(text('slow')).toBe('false');
    act(() => {
      vi.advanceTimersByTime(14_999);
    });
    expect(text('slow')).toBe('false');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(text('slow')).toBe('true');
  });
});
