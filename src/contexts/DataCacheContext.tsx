import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * 資料快取介面
 *
 * 每個快取項目包含：
 * - data: 實際資料
 * - timestamp: 快取時間戳
 * - fromStorage: 這筆資料是「從 sessionStorage 復原」還是「這個分頁
 *   session 內親自 fetch 回來」的——是 stale-while-revalidate 設計的
 *   關鍵旗標，見下方 isStale 的說明。
 */
interface CacheItem {
  data: any;
  timestamp: number;
  fromStorage?: boolean;
}

/**
 * 所有可快取的資料鍵
 */
interface CachedData {
  // 會員中心
  subscriptionStatus?: CacheItem;

  // 刊登管理
  userListing?: CacheItem;

  // 推薦管理
  referralTree?: CacheItem;

  // 任務中心
  tasks?: CacheItem;
  pendingRewards?: CacheItem;

  // 獎勵系統
  rewards?: CacheItem;
  withdrawals?: CacheItem;
}

export type CacheKey = keyof CachedData;

/**
 * Mutation 事件 → 該清哪些快取鍵的對照表。
 *
 * 問題背景：過去每個寫入流程各自手動列一串 clearCache 呼叫，容易漏
 * （例如 cancel/resume 曾經只清 subscriptionStatus，沒清 rewards 內嵌
 * 的 subscriptionStatus 副本）。集中成一張表，寫入流程只要講「發生了
 * 什麼事」，不用知道這件事牽動哪些快取鍵。
 */
export const MUTATION_GROUPS = {
  // 付款完成（首次付款／續訂／重新訂）：影響會籍狀態、推薦樹（新下線
  // 或推薦人變更）、獎勵與任務進度（推薦人這方的獎勵/推薦王計數）。
  payment: ['subscriptionStatus', 'rewards', 'withdrawals', 'tasks', 'pendingRewards', 'referralTree'] as CacheKey[],
  // 領取推薦王「免費續約 1 年」：改變會員到期日 + 待領清單。
  rewardClaim: ['tasks', 'pendingRewards', 'rewards', 'subscriptionStatus'] as CacheKey[],
  // 提領申請／查收確認：獎勵餘額與提領記錄。
  withdrawal: ['rewards', 'withdrawals'] as CacheKey[],
  // 刊登異動。
  listingChange: ['userListing'] as CacheKey[],
} as const;
export type MutationEvent = keyof typeof MUTATION_GROUPS;

/** 站內快速切頁/短時間重複 mount 的 soft TTL——超過這個時間才觸發背景 revalidate。 */
export const SOFT_TTL = 30_000;

interface CacheEntry {
  data: any;
  ageMs: number;
  fromStorage: boolean;
}

interface DataCacheContextType {
  /**
   * 取得快取資料（不論新舊）——畫面秒開用，永遠不因為過期而回傳 null。
   */
  getCache: (key: CacheKey) => any | null;

  /** 取得完整快取條目（資料 + 年齡 + 是否來自 storage 復原）。 */
  getEntry: (key: CacheKey) => CacheEntry | null;

  /**
   * 這個鍵「值得背景重新請求」嗎？三種情況為 true：
   *   1. 根本沒有快取
   *   2. 這筆資料是從 sessionStorage 復原的（F5 之後的第一次讀取，
   *      不管年齡多新都視為 stale——這是修「F5 後最多 5 分鐘看到舊資料」
   *      的根本機制：F5 永遠觸發一次背景重新請求）
   *   3. 年齡超過 softTtl（預設 30 秒，抑制切頁時的請求風暴）
   */
  isStale: (key: CacheKey, softTtl?: number) => boolean;

  /** 設定快取資料（今天親自 fetch 回來的資料，非 storage 復原）。 */
  setCache: (key: CacheKey, value: any) => void;

  /** 清除快取；不帶 key 清全部（登出用）。 */
  clearCache: (key?: CacheKey) => void;

  /** 依 mutation 事件清掉對應的一組快取鍵（見 MUTATION_GROUPS）。 */
  invalidate: (event: MutationEvent) => void;

  /** 檢查快取是否存在（不論新舊）。 */
  hasCache: (key: CacheKey) => boolean;
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined);

const STORAGE_KEY = 'uknow_data_cache';

/**
 * 資料快取提供者
 *
 * 設計（stale-while-revalidate）：
 * - 使用 SessionStorage 持久化快取，讓 F5 之後畫面能立即用舊資料秒開
 *   （不留白、不轉圈），但這批復原資料一律標記 fromStorage=true，
 *   hooks 據此在畫面畫出來的同時背景重新請求一次——F5 後一個
 *   round-trip 內就會拿到最新資料，不必再靠「登出登入」或「等 5 分鐘」。
 * - 跨分頁不共用快取、關閉分頁後快取自動清除（sessionStorage 特性）。
 */
export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<CachedData>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: CachedData = JSON.parse(stored);
        // 復原自 storage 的每一筆都標記 fromStorage——下一次讀取
        // （通常就是這次 mount）一律視為 stale，觸發背景重新請求。
        const marked: CachedData = {};
        for (const k of Object.keys(parsed) as CacheKey[]) {
          const item = parsed[k];
          if (item) marked[k] = { ...item, fromStorage: true };
        }
        return marked;
      }
    } catch (error) {
      console.error('❌ 載入快取失敗:', error);
    }
    return {};
  });

  // ref 鏡射 state，讓所有 getter 用穩定的 function identity（[] deps）
  // 實作——focus/visibilitychange 這類長壽命 listener 才不會抓到掛載當下
  // 的舊快取快照（stale closure）。
  const cacheRef = useRef(cache);
  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  // 每次快取變更時同步至 SessionStorage（存進去的資料不帶
  // fromStorage——那個旗標只在「讀取時是否為本次 mount 首次復原」的
  // 判斷裡有意義，不是資料的持久屬性）。
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('❌ 儲存快取失敗:', error);
    }
  }, [cache]);

  const getCache = useCallback((key: CacheKey): any | null => {
    const item = cacheRef.current[key];
    return item ? item.data : null;
  }, []);

  const getEntry = useCallback((key: CacheKey): CacheEntry | null => {
    const item = cacheRef.current[key];
    if (!item) return null;
    return { data: item.data, ageMs: Date.now() - item.timestamp, fromStorage: !!item.fromStorage };
  }, []);

  const isStale = useCallback((key: CacheKey, softTtl: number = SOFT_TTL): boolean => {
    const item = cacheRef.current[key];
    if (!item) return true;
    if (item.fromStorage) return true;
    return Date.now() - item.timestamp > softTtl;
  }, []);

  const setCacheData = useCallback((key: CacheKey, value: any) => {
    setCache(prev => ({
      ...prev,
      [key]: { data: value, timestamp: Date.now() }, // fromStorage 不設 = false：這是親自 fetch 的新鮮資料
    }));
  }, []);

  const clearCacheData = useCallback((key?: CacheKey) => {
    if (key) {
      setCache(prev => {
        const newCache = { ...prev };
        delete newCache[key];
        return newCache;
      });
    } else {
      setCache({});
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error('❌ 清除 SessionStorage 失敗:', error);
      }
    }
  }, []);

  const invalidate = useCallback((event: MutationEvent) => {
    const keys = MUTATION_GROUPS[event];
    setCache(prev => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }, []);

  const hasCache = useCallback((key: CacheKey): boolean => {
    return !!cacheRef.current[key];
  }, []);

  // value 必須 memo，且 deps 可為空：七個函式全是 [] deps 的 useCallback
  // （讀取走 cacheRef 鏡射），identity 終身穩定。若用物件字面量，每次
  // setCache（即每個 hook 的背景 revalidate 完成）都會產生新 value，
  // 讓所有 useDataCache 消費者無謂重渲染——「ref 鏡射 state 維持穩定
  // identity」的設計就被最外層這個物件毀掉了。
  const value: DataCacheContextType = useMemo(
    () => ({
      getCache,
      getEntry,
      isStale,
      setCache: setCacheData,
      clearCache: clearCacheData,
      invalidate,
      hasCache,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
}

/**
 * 使用資料快取的 Hook
 *
 * 標準 SWR 讀取模式：
 * ```typescript
 * const { getCache, isStale, setCache } = useDataCache();
 *
 * const cached = getCache('subscriptionStatus');
 * if (cached) { setData(cached); setLoading(false); }
 * if (!cached || isStale('subscriptionStatus')) {
 *   dedupe('subscriptionStatus', fetchAndCache);
 * }
 * ```
 */
export function useDataCache() {
  const context = useContext(DataCacheContext);
  if (!context) {
    throw new Error('useDataCache must be used within DataCacheProvider');
  }
  return context;
}
