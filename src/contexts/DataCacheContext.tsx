import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * 資料快取介面
 * 
 * 每個快取項目包含：
 * - data: 實際資料
 * - timestamp: 快取時間戳
 */
interface CacheItem {
  data: any;
  timestamp: number;
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
  monthlySummary?: CacheItem;
  
  // 獎勵系統
  rewards?: CacheItem;
  withdrawals?: CacheItem;
}

type CacheKey = keyof CachedData;

interface DataCacheContextType {
  /**
   * 取得快取資料
   * @param key - 快取鍵
   * @returns 快取的資料，若不存在則回傳 null
   */
  getCache: (key: CacheKey) => any | null;
  
  /**
   * 設定快取資料
   * @param key - 快取鍵
   * @param value - 要快取的資料
   */
  setCache: (key: CacheKey, value: any) => void;
  
  /**
   * 清除快取
   * @param key - 可選，指定要清除的快取鍵。若不提供，則清除所有快取
   */
  clearCache: (key?: CacheKey) => void;
  
  /**
   * 檢查快取是否存在
   * @param key - 快取鍵
   * @returns 是否存在快取
   */
  hasCache: (key: CacheKey) => boolean;
  
  /**
   * 檢查快取是否過期
   * @param key - 快取鍵
   * @param maxAge - 最大快取時間（毫秒），預設 5 分鐘
   * @returns 是否過期
   */
  isCacheExpired: (key: CacheKey, maxAge?: number) => boolean;
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined);

const STORAGE_KEY = 'uknow_data_cache';
const DEFAULT_MAX_AGE = 5 * 60 * 1000; // 5 分鐘

/**
 * 資料快取提供者
 * 
 * 使用 SessionStorage 持久化快取，確保：
 * - 頁面重新整理時快取清空
 * - 跨分頁不共用快取
 * - 關閉分頁後快取自動清除
 */
export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  // 初始化快取（從 SessionStorage 載入）
  const [cache, setCache] = useState<CachedData>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        console.log('📦 從 SessionStorage 載入快取');
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('❌ 載入快取失敗:', error);
    }
    return {};
  });

  // 每次快取變更時同步至 SessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('❌ 儲存快取失敗:', error);
    }
  }, [cache]);

  /**
   * 取得快取資料
   */
  const getCache = useCallback((key: CacheKey): any | null => {
    const item = cache[key];
    if (!item) {
      return null;
    }
    return item.data;
  }, [cache]);

  /**
   * 設定快取資料
   */
  const setCacheData = useCallback((key: CacheKey, value: any) => {
    console.log(`💾 快取資料: ${key}`);
    setCache(prev => ({
      ...prev,
      [key]: {
        data: value,
        timestamp: Date.now()
      }
    }));
  }, []);

  /**
   * 清除快取
   */
  const clearCacheData = useCallback((key?: CacheKey) => {
    if (key) {
      console.log(`🗑️ 清除快取: ${key}`);
      setCache(prev => {
        const newCache = { ...prev };
        delete newCache[key];
        return newCache;
      });
    } else {
      console.log('🗑️ 清除所有快取');
      setCache({});
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error('❌ 清除 SessionStorage 失敗:', error);
      }
    }
  }, []);

  /**
   * 檢查快取是否存在
   */
  const hasCache = useCallback((key: CacheKey): boolean => {
    return !!cache[key];
  }, [cache]);

  /**
   * 檢查快取是否過期
   */
  const isCacheExpired = useCallback((key: CacheKey, maxAge: number = DEFAULT_MAX_AGE): boolean => {
    const item = cache[key];
    if (!item) {
      return true;
    }
    const age = Date.now() - item.timestamp;
    return age > maxAge;
  }, [cache]);

  const value: DataCacheContextType = {
    getCache,
    setCache: setCacheData,
    clearCache: clearCacheData,
    hasCache,
    isCacheExpired
  };

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
}

/**
 * 使用資料快取的 Hook
 * 
 * @example
 * ```typescript
 * const { getCache, setCache, hasCache, clearCache } = useDataCache();
 * 
 * // 檢查快取
 * if (hasCache('subscriptionStatus')) {
 *   const data = getCache('subscriptionStatus');
 *   setSubscriptionData(data);
 * } else {
 *   fetchSubscriptionStatus();
 * }
 * 
 * // 設定快取
 * const data = await apiRequestJson(...);
 * setCache('subscriptionStatus', data);
 * 
 * // 清除快取
 * clearCache('subscriptionStatus');
 * ```
 */
export function useDataCache() {
  const context = useContext(DataCacheContext);
  if (!context) {
    throw new Error('useDataCache must be used within DataCacheProvider');
  }
  return context;
}
