import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRequest } from './useLatestRequest';

/**
 * 伺服器分頁清單的共用狀態機（載入／錯誤／加載更多／已顯示 X / Y）。
 *
 * 抽出來的理由是 ui-ux-guidelines §5「不得靜默截斷」在三個地方各自手刻了一次
 * （推薦網絡搜尋、提領作業台、會員查詢台）。三份實作各自演化的那天，就會有
 * 一個地方忘了顯示總數、或忘了在載入更多失敗時保留已顯示的資料——而那正是
 * 「靜默截斷」本人。
 *
 * **失敗時不清空已載入的資料。** 使用者按「載入更多」失敗，不該連本來看得到
 * 的那幾筆也一起消失——那比沒有加載更多還糟。載入更多的失敗另記在
 * `loadMoreError`，`error` 只管重讀，整片列表才不會被錯誤區換掉。
 *
 * **最後意圖勝出。** 每次重讀（掛載、換身分、`reload()`、被拒補讀）取一張新 ticket，
 * 載入更多帶當下那張；結算時 ticket 已不是最新就整個丟掉，不改任何 state、不呼叫
 * `onLanded`。身分是 `deps` 的序列化；身分與 `load` 存在 ref，寫入 await 之後才呼叫的
 * 舊閉包 `reload` 讀的也是當下的身分。兩個方向都擋：重讀在途時不接受載入更多（舊尾
 * 不接到新列表上），載入更多在途時開始重讀即作廢它。
 *
 * **有資料時的重讀在背景進行、失敗時保留舊列**（ui-ux-guidelines §5）。只有本身分
 * 還沒有任何資料時才是骨架（`isLoading`）；`isConfirmed` 只在最近一次重讀成功落地、
 * 被接受、之後沒有在途的重讀與錯誤時成立——未確認的列可以看，不能拿來當依據。
 * 「未確認」永遠對應「有請求在跑」或「有錯誤可重試」，不會停在兩者皆無。
 *
 * **`reload()` 一定會兌現**：被較新的重讀取代時跟著新的那次、換身分時跟著新身分的
 * 那次、卸載時以 `'failed'` 兌現。呼叫端常是 `await reload()` 之後才解除處理中，
 * 永懸會把按鈕卡住。
 *
 * 擴充點 `initial`／`onLanded`（含被拒補讀一次）／`clearOnError` 目前只有後台的
 * `useAdminList` 一個使用者——**第二個使用者出現前不再加選項**。補讀的狀態機留在
 * 這裡，是因為上面那條「未確認」的不變式要在同一個 hook 裡才守得住。
 */
export interface PagedResult<T, M = unknown> {
  items: T[];
  total: number;
  meta?: M;
}

/** 本身分最新一次重讀的結算。 */
export type RefreshOutcome = 'done' | 'failed';

export interface UsePagedListOptions<T, M = unknown> {
  /** 取一頁。`offset` 是目前已載入的筆數。 */
  load: (params: { limit: number; offset: number }) => Promise<PagedResult<T, M>>;
  pageSize: number;
  /** 變動時重新從第一頁取（篩選條件、搜尋字串）；序列化後就是清單的身分。 */
  deps: unknown[];
  /** 回 true 時這次讀取失敗不保留已顯示的列——重讀與載入更多都適用。 */
  clearOnError?: (err: unknown) => boolean;
  /** 本身分的種子。只在身分改變時讀一次：之後再變也不影響已掛載的清單。 */
  initial?: PagedResult<T, M>;
  /**
   * 最新一次重讀成功落地時呼叫；回 `false` 表示不接受這份結果——補讀一次，
   * 補讀又被拒就以錯誤收場。`stamp` 是那次請求送出時取的整數戳。
   */
  onLanded?: (page: PagedResult<T, M>, info: { stamp: number }) => boolean;
}

export interface UsePagedList<T, M = unknown> {
  items: T[];
  total: number;
  /** 重讀那一頁（或種子）帶的附加資料；載入更多不動它。 */
  meta: M | undefined;
  hasMore: boolean;
  /** 還有下一頁、資料已確認、沒有載入更多在途——更新中不接舊尾。 */
  canLoadMore: boolean;
  /** 本身分還沒有資料也沒有錯誤：骨架。 */
  isLoading: boolean;
  /** 畫面上有本身分的資料，重讀在背景進行。 */
  isRevalidating: boolean;
  isConfirmed: boolean;
  /** 重讀失敗的原因。 */
  error: string | null;
  loadMoreError: string | null;
  isLoadingMore: boolean;
  reload: () => Promise<RefreshOutcome>;
  /** 目前這條重讀的結算；沒有在途時立即以上次的結果兌現。 */
  settled: () => Promise<RefreshOutcome>;
  loadMore: () => Promise<void>;
}

/** 補讀落地又被拒：資料在兩次讀取之間又被改過。 */
const CHANGED_DURING_UPDATE = '資料在更新途中又有變動，請重新整理';

interface ListState<T, M> {
  /** 這份資料屬於哪個身分；與當下的身分不同時一律不顯示。 */
  identity: string;
  items: T[];
  total: number;
  meta: M | undefined;
  /** `items`／`total` 是本身分的資料（讀到的或種子，可能為空），不是預設值。 */
  hasData: boolean;
  /** 最近一次重讀成功落地且被接受，之後沒有失敗。 */
  landed: boolean;
  /** 本身分有重讀在途。 */
  reloading: boolean;
  error: string | null;
  isLoadingMore: boolean;
  loadMoreError: string | null;
}

/** 新身分的起點：重讀即將發出（掛載與換身分的 effect 立刻發）；有種子就先顯示種子。 */
function seeded<T, M>(identity: string, seed: PagedResult<T, M> | undefined): ListState<T, M> {
  const items = seed?.items ?? [];
  return {
    identity,
    items,
    total: seed?.total ?? items.length,
    meta: seed?.meta,
    hasData: seed !== undefined,
    landed: false,
    reloading: true,
    error: null,
    isLoadingMore: false,
    loadMoreError: null,
  };
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** 同步擲出的 `load` 也收斂成被拒的 promise：請求同步發出，失敗路徑只有一條。 */
function invoke<R>(fn: () => Promise<R>): Promise<R> {
  try {
    return fn();
  } catch (err) {
    return Promise.reject(err);
  }
}

export function usePagedList<T, M = unknown>({
  load,
  pageSize,
  deps,
  clearOnError,
  initial,
  onLanded,
}: UsePagedListOptions<T, M>): UsePagedList<T, M> {
  const identity = JSON.stringify(deps);
  const requests = useLatestRequest();

  const latest = useRef({ identity, load, pageSize, clearOnError, onLanded });
  latest.current = { identity, load, pageSize, clearOnError, onLanded };

  // 種子只在身分改變的那個 render 讀一次——失效不會把顯示中的種子列抽掉。
  const seedFor = useRef({ identity, seed: initial });
  if (seedFor.current.identity !== identity) seedFor.current = { identity, seed: initial };

  const [state, setState] = useState<ListState<T, M>>(() => seeded(identity, initial));
  // render 讀 state；非同步的結算要讀「現在」，讀這份同步更新的鏡像。
  const stateRef = useRef(state);
  const commit = useCallback((next: ListState<T, M>) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const mounted = useRef(false);
  const waiters = useRef<((outcome: RefreshOutcome) => void)[]>([]);
  const lastOutcome = useRef<RefreshOutcome>('done');
  // 擋載入更多重入。重讀開始時歸零：被作廢的那次晚到，也不會擋住下一次。
  const moreInFlight = useRef(false);

  const finish = useCallback((ticketIdentity: string, outcome: RefreshOutcome) => {
    // 已換身分：舊身分的結算不代表新身分，在等的 promise 留給新身分的那次。
    if (ticketIdentity !== latest.current.identity) return;
    lastOutcome.current = outcome;
    const pending = waiters.current;
    waiters.current = [];
    for (const resolve of pending) resolve(outcome);
  }, []);

  const startReload = useCallback(() => {
    const run = (retried: boolean) => {
      if (!mounted.current) return;
      const { identity: id, load: fetchPage, pageSize: limit } = latest.current;
      const ticket = requests.begin();
      moreInFlight.current = false;
      const prev = stateRef.current;
      commit({
        ...(prev.identity === id ? prev : seeded<T, M>(id, seedFor.current.seed)),
        reloading: true,
        landed: false,
        error: null,
        isLoadingMore: false,
        loadMoreError: null,
      });
      invoke(() => fetchPage({ limit, offset: 0 })).then(
        (res) => {
          if (!mounted.current || !requests.isLatest(ticket)) return;
          const items = res.items ?? [];
          const landedPage = { items, total: res.total ?? items.length, meta: res.meta };
          if (latest.current.onLanded?.(landedPage, { stamp: ticket.stamp }) === false) {
            // 補讀與拒絕在同一個同步段內：中間沒有「不在載入也沒資料」的 render。
            if (!retried) {
              run(true);
              return;
            }
            commit({
              ...stateRef.current,
              reloading: false,
              landed: false,
              error: CHANGED_DURING_UPDATE,
            });
            finish(id, 'failed');
            return;
          }
          commit({
            ...stateRef.current,
            ...landedPage,
            identity: id,
            hasData: true,
            landed: true,
            reloading: false,
            error: null,
          });
          finish(id, 'done');
        },
        (err) => {
          if (!mounted.current || !requests.isLatest(ticket)) return;
          const error = messageOf(err, '載入失敗');
          commit(
            latest.current.clearOnError?.(err)
              ? { ...seeded<T, M>(id, undefined), reloading: false, error }
              : { ...stateRef.current, reloading: false, landed: false, error },
          );
          finish(id, 'failed');
        },
      );
    };
    run(false);
  }, [commit, finish, requests]);

  const reload = useCallback((): Promise<RefreshOutcome> => {
    if (!mounted.current) return Promise.resolve('failed');
    const outcome = new Promise<RefreshOutcome>((resolve) => waiters.current.push(resolve));
    startReload();
    return outcome;
  }, [startReload]);

  const settled = useCallback((): Promise<RefreshOutcome> => {
    if (!mounted.current) return Promise.resolve('failed');
    const s = stateRef.current;
    // 身分已換而 effect 還沒發出新身分的重讀時，也算在途。
    if (!s.reloading && s.identity === latest.current.identity) {
      return Promise.resolve(lastOutcome.current);
    }
    return new Promise((resolve) => waiters.current.push(resolve));
  }, []);

  const loadMore = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    const { identity: id, load: fetchPage, pageSize: limit } = latest.current;
    const confirmed = s.hasData && s.landed && !s.reloading && s.error === null;
    if (!mounted.current || moreInFlight.current || s.identity !== id) return;
    if (!confirmed || s.items.length >= s.total) return;
    const ticket = requests.peek();
    moreInFlight.current = true;
    commit({ ...s, isLoadingMore: true, loadMoreError: null });
    try {
      const res = await invoke(() => fetchPage({ limit, offset: s.items.length }));
      if (!mounted.current || !requests.isLatest(ticket)) return;
      const now = stateRef.current;
      commit({
        ...now,
        items: [...now.items, ...(res.items ?? [])],
        total: res.total ?? now.total,
        isLoadingMore: false,
      });
    } catch (err) {
      if (!mounted.current || !requests.isLatest(ticket)) return;
      const error = messageOf(err, '載入更多失敗');
      commit(
        latest.current.clearOnError?.(err)
          ? { ...seeded<T, M>(id, undefined), reloading: false, error }
          : { ...stateRef.current, isLoadingMore: false, loadMoreError: error },
      );
    } finally {
      // 被作廢的那次不碰重入 ref——重讀已經歸零，之後新按的那次可能正在跑。
      if (requests.isLatest(ticket)) moreInFlight.current = false;
    }
  }, [commit, requests]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // 卸載後不再有結算：在等的 reload() 一律以 failed 兌現。
      const pending = waiters.current;
      waiters.current = [];
      for (const resolve of pending) resolve('failed');
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在身分改變時重讀；startReload 是穩定的，讀的是 ref
  useEffect(() => {
    startReload();
  }, [identity]);

  const view = state.identity === identity ? state : seeded<T, M>(identity, seedFor.current.seed);
  const hasMore = view.items.length < view.total;
  const isConfirmed = view.hasData && view.landed && !view.reloading && view.error === null;

  return {
    items: view.items,
    total: view.total,
    meta: view.meta,
    hasMore,
    canLoadMore: hasMore && isConfirmed && !view.isLoadingMore,
    isLoading: !view.hasData && view.error === null,
    isRevalidating: view.hasData && view.reloading,
    isConfirmed,
    error: view.error,
    loadMoreError: view.loadMoreError,
    isLoadingMore: view.isLoadingMore,
    reload,
    settled,
    loadMore,
  };
}
