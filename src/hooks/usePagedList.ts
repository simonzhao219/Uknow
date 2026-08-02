import { useCallback, useEffect, useState } from 'react';

/**
 * 伺服器分頁清單的共用狀態機（載入／錯誤／加載更多／已顯示 X / Y）。
 *
 * 抽出來的理由是 ui-ux-guidelines §5「不得靜默截斷」在三個地方各自手刻了一次
 * （推薦網絡搜尋、提領作業台、會員查詢台）。三份實作各自演化的那天，就會有
 * 一個地方忘了顯示總數、或忘了在載入更多失敗時保留已顯示的資料——而那正是
 * 「靜默截斷」本人。
 *
 * **失敗時不清空已載入的資料。** 使用者按「載入更多」失敗，不該連本來看得到
 * 的那幾筆也一起消失——那比沒有加載更多還糟。
 */
export interface PagedResult<T> {
  items: T[];
  total: number;
}

export interface UsePagedListOptions<T> {
  /** 取一頁。`offset` 是目前已載入的筆數。 */
  load: (params: { limit: number; offset: number }) => Promise<PagedResult<T>>;
  pageSize: number;
  /** 變動時重新從第一頁取（篩選條件、搜尋字串）。 */
  deps: unknown[];
}

export interface UsePagedList<T> {
  items: T[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** 就地替換一筆（例如切換管理員後不必整頁重抓）。 */
  replaceItem: (match: (item: T) => boolean, next: T) => void;
}

export function usePagedList<T>({ load, pageSize, deps }: UsePagedListOptions<T>): UsePagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await load({ limit: pageSize, offset: 0 });
      setItems(res.items ?? []);
      setTotal(res.total ?? (res.items ?? []).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    setIsLoadingMore(true);
    try {
      const res = await load({ limit: pageSize, offset: items.length });
      // 失敗不清空已顯示的結果——只把 loadingMore 收掉，使用者可再按一次。
      setItems((prev) => [...prev, ...(res.items ?? [])]);
      setTotal((prev) => res.total ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入更多失敗');
    } finally {
      setIsLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, ...deps]);

  const replaceItem = useCallback((match: (item: T) => boolean, next: T) => {
    setItems((prev) => prev.map((item) => (match(item) ? next : item)));
  }, []);

  return {
    items,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore: items.length < total,
    reload,
    loadMore,
    replaceItem,
  };
}
