import { useEffect, useRef, useState } from 'react';
import { type PagedResult, type UsePagedList, usePagedList } from '../../hooks/usePagedList';
import type { AdminCache, AdminQuery, AdminSnapshot } from './adminCache';

/**
 * 後台清單＝通用的分頁狀態機（`usePagedList`）＋記憶體快取（`adminCache`）。
 *
 * **分頁不 forceMount。** Radix Tabs 只掛 active 分頁，切走就卸載、切回重掛。改成全掛
 * 等於一進後台就打四支 API（預載），四棵元件樹與未遮罩的 PII 常駐隱藏 DOM，文字定位器
 * 也會多出重複。所以維持「非 active 不掛載」，重掛時拿快取當種子：畫面立即出現，照舊
 * 背景重讀一次。
 *
 * **確認閘門的保證範圍。** 種子是「上次看到的樣子」，不是現在：`isConfirmed` 在本次掛載的
 * 最新一次重讀落地並通過 fence 之前都是 false，匯款類操作看它。它保證「快取不讓匯款依據
 * 比沒有快取時更舊」，**不**保證按下當下的資料是新的——同一頁停太久、同帳號開兩個分頁，
 * 資料一樣會過期（與沒有快取時相同）；資料時間的提示是緩解。
 *
 * **403 清空全部。** 列表讀取（重讀、載入更多、匯出的 `loadPage`）回 403 → 清空全部快取與
 * 切回位置，畫面丟掉舊列。清空是安全方向，不代表權限一定被撤——偶發的 403 也會清，代價
 * 只是下次切回時出一次骨架。判斷用 duck-typing（數值 `status === 403`），不 import apiClient。
 */

/**
 * 同一次重讀持續這麼久→`isSlow`：放行重新整理、提示「更新較久」、遮住收款資訊。
 * 退場條件：全站 apiClient 逾時上線後拿掉，逾時改走一般的失敗路徑。
 */
export const SLOW_UPDATE_MS = 15_000;
/** 頁面可見時，資料時間的文字多久重算一次——停在頁面上沒有 re-render 時「剛剛」才會變老。 */
export const DATA_AGE_TICK_MS = 60_000;
/** 資料時間到這麼多分鐘，改提示「建議先重新整理」。 */
export const STALE_HINT_MINUTES = 10;
/** 更新超過這麼久才淡化列表、套閘門的停用樣式：0.3 秒內結束的更新不閃灰。 */
export const REVALIDATE_DIM_DELAY_MS = 300;

const isForbidden = (err: unknown) =>
  (err as { status?: unknown } | null | undefined)?.status === 403;

export interface UseAdminListOptions<T, M, P> {
  /** 不給＝不跨卸載保留（既有測試的預設）。 */
  cache?: AdminCache;
  query: AdminQuery<P>;
  load: (params: P, page: { limit: number; offset: number }) => Promise<PagedResult<T, M>>;
  pageSize: number;
}

export interface UseAdminList<T, M = unknown> extends UsePagedList<T, M> {
  /** 畫面上這份資料的取得時間（牆鐘）：接受的落地、或種子帶來的原始時間。 */
  fetchedAt: number | null;
  /** 資料時間的「現在」：頁面可見時每分鐘、切回可見或取得焦點時立即更新。 */
  now: number;
  /** 每次接受的落地 +1（提領頁清勾選用）。 */
  dataVersion: number;
  /** 同一次重讀已超過 `SLOW_UPDATE_MS`；新的一次（手動重試、被拒補讀）立即歸零。 */
  isSlow: boolean;
  /** 匯出用的取數：帶當下的查詢條件，同樣偵測 403。 */
  loadPage: (page: { limit: number; offset: number }) => Promise<PagedResult<T, M>>;
}

export function useAdminList<T, M = unknown, P = unknown>({
  cache,
  query,
  load,
  pageSize,
}: UseAdminListOptions<T, M, P>): UseAdminList<T, M> {
  // 種子只在身分改變的那個 render 讀一次（與 usePagedList 的 initial 同一個時點）；
  // 這個物件也是「這一趟造訪」的記號，資料時間只認本趟的落地。
  const visit = useRef<{ id: string; seed: AdminSnapshot<T, M> | undefined } | null>(null);
  if (visit.current === null || visit.current.id !== query.id) {
    visit.current = {
      id: query.id,
      seed: cache && query.slot ? cache.read<T, M>(query.slot) : undefined,
    };
  }
  const thisVisit = visit.current;

  const [attempt, setAttempt] = useState(0);
  const [slowAttempt, setSlowAttempt] = useState(-1);
  const [landed, setLanded] = useState<{ visit: object; at: number } | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const loadPage = async (page: { limit: number; offset: number }) => {
    try {
      return await load(query.params, page);
    } catch (err) {
      if (isForbidden(err)) cache?.invalidate('accessLost');
      throw err;
    }
  };

  const list = usePagedList<T, M>({
    deps: [query.id],
    pageSize,
    initial: thisVisit.seed,
    load: (page) => {
      // 每次重讀（含被拒補讀）都是新的一次：慢更新從這裡重新計時。
      if (page.offset === 0) setAttempt((n) => n + 1);
      return loadPage(page);
    },
    clearOnError: isForbidden,
    onLanded: (result, { stamp }) => {
      if (cache && query.resource && stamp < cache.fenceOf(query.resource)) return false;
      const at = Date.now();
      if (cache && query.slot) cache.write(query.slot, { ...result, fetchedAt: at }, stamp);
      setLanded({ visit: thisVisit, at });
      setNow(at);
      setDataVersion((v) => v + 1);
      return true;
    },
  });

  const updating = list.isLoading || list.isRevalidating;
  useEffect(() => {
    if (!updating) return;
    const timer = setTimeout(() => setSlowAttempt(attempt), SLOW_UPDATE_MS);
    return () => clearTimeout(timer);
  }, [attempt, updating]);

  useEffect(() => {
    // 牆鐘：裝置休眠時單調時鐘不前進，牆鐘正好對應「切去網銀 App 再回來」。
    const refresh = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    const timer = setInterval(refresh, DATA_AGE_TICK_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return {
    ...list,
    fetchedAt: landed?.visit === thisVisit ? landed.at : (thisVisit.seed?.fetchedAt ?? null),
    now,
    dataVersion,
    isSlow: updating && slowAttempt === attempt,
    loadPage,
  };
}
