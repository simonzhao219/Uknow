// @vitest-environment jsdom
//
// 伺服器分頁的共用狀態機。
//
// 它存在的理由是 ui-ux-guidelines §5「不得靜默截斷」原本在三個地方各自手刻，
// 所以這支測試守的正是「靜默」的幾種形態：
//   * 載入更多失敗時**不清空已顯示的資料**——按一次失敗就整片消失，比沒有
//     加載更多還糟。
//   * 後端少回欄位時退回保守值，而不是讓 `total` 變成 `undefined` 再往下讀。
//
// S5（後台資料快取）在同一個狀態機上補了三件所有清單都該守的事：
//   * 最後意圖勝出：重讀、換身分、載入更多的結算都帶 ticket，非最新的結算不改畫面；
//     寫入 await 之後才呼叫的舊閉包 reload 也讀當下的身分。
//   * 有資料時的重讀在背景進行、失敗時保留舊列（ui-ux §5「保留舊資料，不要清空」）；
//     載入更多的失敗另記 loadMoreError，不把整片列表換成錯誤區。
//   * reload() 的 promise 一定兌現——呼叫端常在 await 之後才解除「處理中」，永懸會卡鈕。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  type PagedResult,
  type RefreshOutcome,
  type UsePagedList,
  usePagedList,
} from './usePagedList';

afterEach(cleanup);

function Probe({ load }: { load: (p: { limit: number; offset: number }) => Promise<any> }) {
  const list = usePagedList<{ id: string }>({ load, pageSize: 2, deps: [] });
  return (
    <div>
      <span data-testid="items">{list.items.map((i) => i.id).join(',')}</span>
      <span data-testid="total">{list.total}</span>
      <span data-testid="error">{list.error ?? ''}</span>
      <span data-testid="more">{String(list.hasMore)}</span>
      <button type="button" onClick={list.loadMore}>
        more
      </button>
    </div>
  );
}

interface Item {
  id: string;
}
type Page = PagedResult<Item>;
type Load = (p: { limit: number; offset: number }) => Promise<Page>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 每次呼叫都回一個可手動結算的 promise，並記下是哪個身分的取數函式發出的。 */
function controlledLoader() {
  const calls: { tag: string; offset: number; d: ReturnType<typeof deferred<Page>> }[] = [];
  const make =
    (tag: string): Load =>
    ({ offset }) => {
      const d = deferred<Page>();
      calls.push({ tag, offset, d });
      return d.promise;
    };
  return { calls, make, load: make('') };
}

const page = (ids: string[], total = ids.length): Page => ({
  items: ids.map((id) => ({ id })),
  total,
});

/** promise 若 50ms 內沒兌現就讀成 'pending'——永懸的 promise 要讀得出來，而不是卡到逾時。 */
function outcome(p: Promise<RefreshOutcome>): Promise<RefreshOutcome | 'pending'> {
  return Promise.race([p, new Promise<'pending'>((r) => setTimeout(() => r('pending'), 50))]);
}

function ListProbe({
  load,
  deps = [],
  clearOnError,
  onList,
}: {
  load: Load;
  deps?: unknown[];
  clearOnError?: (err: unknown) => boolean;
  onList?: (list: UsePagedList<Item>) => void;
}) {
  const list = usePagedList<Item>({ load, pageSize: 2, deps, clearOnError });
  onList?.(list);
  return (
    <div>
      <span data-testid="items">{list.items.map((i) => i.id).join(',')}</span>
      <span data-testid="error">{list.error ?? ''}</span>
      <span data-testid="more-error">{list.loadMoreError ?? ''}</span>
      <span data-testid="loading">{String(list.isLoading)}</span>
      <span data-testid="revalidating">{String(list.isRevalidating)}</span>
      <span data-testid="confirmed">{String(list.isConfirmed)}</span>
      <span data-testid="can-more">{String(list.canLoadMore)}</span>
      <span data-testid="loading-more">{String(list.isLoadingMore)}</span>
      <button type="button" onClick={() => void list.loadMore()}>
        more
      </button>
      <button type="button" onClick={() => void list.reload()}>
        reload
      </button>
    </div>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('usePagedList', () => {
  it('載入更多失敗時保留已顯示的資料', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }], total: 3 })
      .mockRejectedValueOnce(new Error('連線中斷'));
    render(<ListProbe load={load} />);

    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('a'));
    screen.getByRole('button', { name: 'more' }).click();

    // 載入更多的失敗寫在 loadMoreError；error 只管重讀，否則整片列表會被錯誤區換掉。
    await waitFor(() => expect(screen.getByTestId('more-error').textContent).toBe('連線中斷'));
    // 已顯示的那筆必須還在——這就是「失敗不清空」。
    expect(screen.getByTestId('items').textContent).toBe('a');
  });

  it('後端少回 items 或 total 時退回保守值', async () => {
    render(<Probe load={async () => ({})} />);
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('0'));
    expect(screen.getByTestId('items').textContent).toBe('');
    expect(screen.getByTestId('more').textContent).toBe('false');
  });

  it('載入更多把下一頁接在後面而不是取代', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }], total: 2 })
      .mockResolvedValueOnce({ items: [{ id: 'b' }], total: 2 });
    render(<Probe load={load} />);

    await waitFor(() => expect(screen.getByTestId('more').textContent).toBe('true'));
    screen.getByRole('button', { name: 'more' }).click();

    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('a,b'));
    expect(screen.getByTestId('more').textContent).toBe('false');
  });

  it('第一頁載入失敗時把原因說出來', async () => {
    render(
      <Probe
        load={async () => {
          throw new Error('伺服器忙碌中');
        }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('伺服器忙碌中'));
  });

  it('擲出非 Error 時仍給得出可讀訊息', async () => {
    render(
      <Probe
        load={async () => {
          throw 'boom';
        }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('載入失敗'));
  });
});

describe('usePagedList 背景重讀', () => {
  it('有資料時重新整理在背景進行，列表不換回骨架', async () => {
    const { calls, load } = controlledLoader();
    render(<ListProbe load={load} />);
    await act(async () => calls[0].d.resolve(page(['a', 'b'])));
    expect(text('confirmed')).toBe('true');

    click('reload');
    expect(text('loading')).toBe('false');
    expect(text('revalidating')).toBe('true');
    expect(text('confirmed')).toBe('false');
    expect(text('items')).toBe('a,b');

    await act(async () => calls[1].d.resolve(page(['c'])));
    expect(text('items')).toBe('c');
    expect(text('revalidating')).toBe('false');
    expect(text('confirmed')).toBe('true');
  });

  it('重讀失敗時保留舊列並說出原因，重試仍在背景進行', async () => {
    const { calls, load } = controlledLoader();
    render(<ListProbe load={load} />);
    await act(async () => calls[0].d.resolve(page(['a'])));

    click('reload');
    await act(async () => calls[1].d.reject(new Error('伺服器忙碌中')));
    expect(text('items')).toBe('a');
    expect(text('error')).toBe('伺服器忙碌中');
    expect(text('confirmed')).toBe('false');
    expect(text('loading')).toBe('false');

    click('reload');
    expect(text('revalidating')).toBe('true');
    expect(text('items')).toBe('a');
  });

  it('clearOnError 判定為真的重讀失敗會丟掉舊列', async () => {
    const { calls, load } = controlledLoader();
    const forbidden = (err: unknown) => (err as { status?: number }).status === 403;
    render(<ListProbe load={load} clearOnError={forbidden} />);
    await act(async () => calls[0].d.resolve(page(['a'])));

    click('reload');
    await act(async () => calls[1].d.reject(Object.assign(new Error('沒有權限'), { status: 403 })));
    expect(text('items')).toBe('');
    expect(text('error')).toBe('沒有權限');
    expect(text('loading')).toBe('false');
  });

  it('clearOnError 也適用於載入更多的失敗', async () => {
    const { calls, load } = controlledLoader();
    const forbidden = (err: unknown) => (err as { status?: number }).status === 403;
    render(<ListProbe load={load} clearOnError={forbidden} />);
    await act(async () => calls[0].d.resolve(page(['a'], 3)));

    click('more');
    await act(async () => calls[1].d.reject(Object.assign(new Error('沒有權限'), { status: 403 })));
    expect(text('items')).toBe('');
    expect(text('error')).toBe('沒有權限');
  });

  it('載入更多失敗後可以再按一次，且不改變確認狀態', async () => {
    const { calls, load } = controlledLoader();
    render(<ListProbe load={load} />);
    await act(async () => calls[0].d.resolve(page(['a'], 3)));

    click('more');
    await act(async () => calls[1].d.reject(new Error('連線中斷')));
    expect(text('more-error')).toBe('連線中斷');
    expect(text('can-more')).toBe('true');
    expect(text('confirmed')).toBe('true');

    click('more');
    await act(async () => calls[2].d.resolve(page(['b'], 3)));
    expect(text('items')).toBe('a,b');
    expect(text('more-error')).toBe('');
  });
});

describe('usePagedList 請求序號', () => {
  it('重讀進行中按載入更多不會送出請求', async () => {
    const { calls, load } = controlledLoader();
    render(<ListProbe load={load} />);
    await act(async () => calls[0].d.resolve(page(['a'], 3)));
    expect(text('can-more')).toBe('true');

    click('reload');
    expect(text('can-more')).toBe('false');
    click('more');
    expect(calls).toHaveLength(2);
  });

  it('載入更多進行中開始重讀時，載入更多作廢且之後可以再按', async () => {
    const { calls, load } = controlledLoader();
    render(<ListProbe load={load} />);
    await act(async () => calls[0].d.resolve(page(['a'], 3)));

    click('more');
    expect(text('loading-more')).toBe('true');
    click('reload');
    expect(text('loading-more')).toBe('false');

    // 被作廢的載入更多晚到，不得把舊尾巴接到重讀的結果上。
    await act(async () => calls[1].d.resolve(page(['b'], 3)));
    expect(text('items')).toBe('a');
    await act(async () => calls[2].d.resolve(page(['x', 'y'], 3)));
    expect(text('items')).toBe('x,y');

    click('more');
    expect(calls).toHaveLength(4);
    expect(calls[3].offset).toBe(2);
  });

  it('連續換身分 A→B→C 時，B 晚到的結算不改變畫面', async () => {
    const { calls, make } = controlledLoader();
    const { rerender } = render(<ListProbe load={make('A')} deps={['A']} />);
    await act(async () => calls[0].d.resolve(page(['a1'])));

    rerender(<ListProbe load={make('B')} deps={['B']} />);
    // 換身分的第一個 render 就不再顯示上一個身分的列。
    expect(text('items')).toBe('');
    expect(text('loading')).toBe('true');
    rerender(<ListProbe load={make('C')} deps={['C']} />);

    await act(async () => calls[1].d.resolve(page(['b1'])));
    expect(text('items')).toBe('');
    expect(text('loading')).toBe('true');
    await act(async () => calls[2].d.resolve(page(['c1'])));
    expect(text('items')).toBe('c1');
    expect(text('confirmed')).toBe('true');
  });

  it('換身分後呼叫舊閉包的 reload，讀的是新身分', async () => {
    const { calls, make } = controlledLoader();
    let reloadFromA: (() => Promise<RefreshOutcome>) | undefined;
    const { rerender } = render(
      <ListProbe
        load={make('A')}
        deps={['A']}
        onList={(list) => {
          reloadFromA ??= list.reload;
        }}
      />,
    );
    await act(async () => calls[0].d.resolve(page(['a1'])));
    rerender(<ListProbe load={make('B')} deps={['B']} />);
    await act(async () => calls[1].d.resolve(page(['b1'])));

    await act(async () => {
      void reloadFromA?.();
    });
    expect(calls[2].tag).toBe('B');
    await act(async () => calls[2].d.resolve(page(['b2'])));
    expect(text('items')).toBe('b2');
  });
});

describe('usePagedList reload 的結算', () => {
  it('reload 的 promise 成功時兌現 done、失敗時兌現 failed', async () => {
    const { calls, load } = controlledLoader();
    let list!: UsePagedList<Item>;
    render(<ListProbe load={load} onList={(l) => (list = l)} />);
    await act(async () => calls[0].d.resolve(page(['a'])));

    let first!: Promise<RefreshOutcome>;
    act(() => {
      first = list.reload();
    });
    await act(async () => calls[1].d.resolve(page(['b'])));
    expect(await outcome(first)).toBe('done');

    let second!: Promise<RefreshOutcome>;
    act(() => {
      second = list.reload();
    });
    await act(async () => calls[2].d.reject(new Error('連線中斷')));
    expect(await outcome(second)).toBe('failed');
  });

  it('被較新的重讀取代時，舊的 promise 跟著新的那次結算', async () => {
    const { calls, load } = controlledLoader();
    let list!: UsePagedList<Item>;
    render(<ListProbe load={load} onList={(l) => (list = l)} />);
    await act(async () => calls[0].d.resolve(page(['a'])));

    let older!: Promise<RefreshOutcome>;
    act(() => {
      older = list.reload();
    });
    act(() => {
      void list.reload();
    });
    await act(async () => calls[2].d.reject(new Error('連線中斷')));
    expect(await outcome(older)).toBe('failed');

    // 被取代的那次晚到，也不改畫面。
    await act(async () => calls[1].d.resolve(page(['late'])));
    expect(text('items')).toBe('a');
  });

  it('換身分時，先前的 reload promise 跟著新身分的結算兌現', async () => {
    const { calls, make } = controlledLoader();
    let list!: UsePagedList<Item>;
    const { rerender } = render(
      <ListProbe load={make('A')} deps={['A']} onList={(l) => (list = l)} />,
    );
    await act(async () => calls[0].d.resolve(page(['a1'])));

    let pending!: Promise<RefreshOutcome>;
    act(() => {
      pending = list.reload();
    });
    rerender(<ListProbe load={make('B')} deps={['B']} onList={(l) => (list = l)} />);
    const forB = calls.find((c) => c.tag === 'B');
    await act(async () => forB?.d.resolve(page(['b1'])));
    expect(await outcome(pending)).toBe('done');
  });

  it('卸載時尚未結算的 reload 兌現 failed，之後也不再送出請求', async () => {
    const { calls, load } = controlledLoader();
    let list!: UsePagedList<Item>;
    const { unmount } = render(<ListProbe load={load} onList={(l) => (list = l)} />);
    await act(async () => calls[0].d.resolve(page(['a'])));

    let pending!: Promise<RefreshOutcome>;
    act(() => {
      pending = list.reload();
    });
    unmount();
    expect(await outcome(pending)).toBe('failed');
    expect(await outcome(list.reload())).toBe('failed');
    expect(calls).toHaveLength(2);
  });

  it('settled 在沒有重讀進行時立即以上次的結果兌現', async () => {
    const { calls, load } = controlledLoader();
    let list!: UsePagedList<Item>;
    render(<ListProbe load={load} onList={(l) => (list = l)} />);
    await act(async () => calls[0].d.resolve(page(['a'])));
    expect(await outcome(list.settled())).toBe('done');

    act(() => {
      void list.reload();
    });
    const during = list.settled();
    expect(await outcome(during)).toBe('pending');
    await act(async () => calls[1].d.reject(new Error('連線中斷')));
    expect(await outcome(during)).toBe('failed');
    expect(await outcome(list.settled())).toBe('failed');
  });
});
