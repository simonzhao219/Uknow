import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * 数据缓存接口
 * 
 * 每个缓存项包含：
 * - data: 实际数据
 * - timestamp: 缓存时间戳
 */
interface CacheItem {
  data: any;
  timestamp: number;
}

/**
 * 所有可缓存的数据键
 */
interface CachedData {
  // 会员中心
  subscriptionStatus?: CacheItem;
  
  // 刊登管理
  userListing?: CacheItem;
  
  // 推荐管理
  referralTree?: CacheItem;
  
  // 任务中心
  tasks?: CacheItem;
  pendingRewards?: CacheItem;
  monthlySummary?: CacheItem;
  
  // 奖励系统
  rewards?: CacheItem;
  withdrawals?: CacheItem;
}

type CacheKey = keyof CachedData;

interface DataCacheContextType {
  /**
   * 获取缓存数据
   * @param key - 缓存键
   * @returns 缓存的数据，如果不存在则返回 null
   */
  getCache: (key: CacheKey) => any | null;
  
  /**
   * 设置缓存数据
   * @param key - 缓存键
   * @param value - 要缓存的数据
   */
  setCache: (key: CacheKey, value: any) => void;
  
  /**
   * 清除缓存
   * @param key - 可选，指定要清除的缓存键。如果不提供，则清除所有缓存
   */
  clearCache: (key?: CacheKey) => void;
  
  /**
   * 检查缓存是否存在
   * @param key - 缓存键
   * @returns 是否存在缓存
   */
  hasCache: (key: CacheKey) => boolean;
  
  /**
   * 检查缓存是否过期
   * @param key - 缓存键
   * @param maxAge - 最大缓存时间（毫秒），默认 5 分钟
   * @returns 是否过期
   */
  isCacheExpired: (key: CacheKey, maxAge?: number) => boolean;
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined);

const STORAGE_KEY = 'uknow_data_cache';
const DEFAULT_MAX_AGE = 5 * 60 * 1000; // 5 分钟

/**
 * 数据缓存提供者
 * 
 * 使用 SessionStorage 持久化缓存，确保：
 * - 页面刷新时缓存清空
 * - 跨标签页不共享缓存
 * - 关闭标签页后缓存自动清除
 */
export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  // 初始化缓存（从 SessionStorage 加载）
  const [cache, setCache] = useState<CachedData>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        console.log('📦 从 SessionStorage 加载缓存');
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('❌ 加载缓存失败:', error);
    }
    return {};
  });

  // 每次缓存变化时同步到 SessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('❌ 保存缓存失败:', error);
    }
  }, [cache]);

  /**
   * 获取缓存数据
   */
  const getCache = useCallback((key: CacheKey): any | null => {
    const item = cache[key];
    if (!item) {
      return null;
    }
    return item.data;
  }, [cache]);

  /**
   * 设置缓存数据
   */
  const setCacheData = useCallback((key: CacheKey, value: any) => {
    console.log(`💾 缓存数据: ${key}`);
    setCache(prev => ({
      ...prev,
      [key]: {
        data: value,
        timestamp: Date.now()
      }
    }));
  }, []);

  /**
   * 清除缓存
   */
  const clearCacheData = useCallback((key?: CacheKey) => {
    if (key) {
      console.log(`🗑️ 清除缓存: ${key}`);
      setCache(prev => {
        const newCache = { ...prev };
        delete newCache[key];
        return newCache;
      });
    } else {
      console.log('🗑️ 清除所有缓存');
      setCache({});
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error('❌ 清除 SessionStorage 失败:', error);
      }
    }
  }, []);

  /**
   * 检查缓存是否存在
   */
  const hasCache = useCallback((key: CacheKey): boolean => {
    return !!cache[key];
  }, [cache]);

  /**
   * 检查缓存是否过期
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
 * 使用数据缓存的 Hook
 * 
 * @example
 * ```typescript
 * const { getCache, setCache, hasCache, clearCache } = useDataCache();
 * 
 * // 检查缓存
 * if (hasCache('subscriptionStatus')) {
 *   const data = getCache('subscriptionStatus');
 *   setSubscriptionData(data);
 * } else {
 *   fetchSubscriptionStatus();
 * }
 * 
 * // 设置缓存
 * const data = await apiRequestJson(...);
 * setCache('subscriptionStatus', data);
 * 
 * // 清除缓存
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
