import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { UserContext } from '../App';
import { useDataCache } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useNotification } from '../components/notifications/NotificationContext';
import type { RenewalInfo } from '@contract';

// 會員兩態模型：一次性年費、無自動扣款、無取消／恢復／寬限期——到期即
// 失效，之後用 /payment/checkout 續訂：extend 一筆一年從原到期日隔天
// 字面接續（過期多久都可選，補繳到迄日回到未來為止），fresh 從付款日
// 起算並清空帳本。效期由 process_successful_payment 依 renewalMode 決定；
// 補繳數字（renewal）與建單守衛旗標（hasPendingWithdrawal）由
// /subscriptions/status 提供（契約見 @contract RenewalInfoSchema）。
export interface SubscriptionData {
  hasSubscription: boolean;
  status?: 'active' | 'expired';
  activeUntil?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  renewal?: RenewalInfo | null;
  hasPendingWithdrawal?: boolean;
}

export interface UseSubscriptionResult {
  subscriptionData: SubscriptionData | null;
  isLoading: boolean;
  isValidating: boolean;
  /**
   * 最近一次抓取失敗且尚未被成功蓋掉。搭配 subscriptionData 可區分
   * 「從未取得」與「曾有資料、本次背景 revalidate 失敗（畫面上是舊資料）」
   * ——結帳頁四狀態表第 4 列（補繳進度不得靜默過期）靠這個訊號。
   */
  lastFetchFailed: boolean;
  refresh: () => Promise<void>;
}

const DEDUP_KEY = 'subscriptionStatus';

/**
 * dedupe(DEDUP_KEY, …) 只會執行「先到者」的 fetchStatus；後到的實例（同頁第二處、
 * 或跨頁接力）靠 adoptShared 在請求結束後從快取補回結果——過去缺這一步時，後到者
 * 會卡在載入中，所以曾有「同一個畫面只准掛一個實例」的禁令。
 *
 * 子元件只需要會籍狀態時，仍優先讀 UserContext 的 `user.accountStatus`
 * （`/profile` 已回傳同一份資料），省一個實例。
 */
export function useSubscription(): UseSubscriptionResult {
  const { user } = useContext(UserContext);
  const { getCache, getEntry, setCache, clearCache, isStale } = useDataCache();
  const { showToast } = useNotification();

  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [lastFetchFailed, setLastFetchFailed] = useState(false);
  const hasDataRef = useRef(false);
  // 最近一次呼叫 dedupe 的時間。接上別人的請求時，只有晚於這個時間寫進快取的
  // 資料才算「這次請求成功」；更早的是舊快取（或 storage 復原），不能拿來把
  // lastFetchFailed 蓋回 false。
  const joinedAtRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    if (hasDataRef.current) {
      setIsValidating(true);
    } else {
      setIsLoading(true);
    }
    try {
      const result = await apiRequestJson<{ success: boolean; data: SubscriptionData }>(
        buildApiUrl('/subscriptions/status'),
      );
      setCache('subscriptionStatus', result.data);
      setSubscriptionData(result.data);
      hasDataRef.current = true;
      setLastFetchFailed(false);
    } catch (err) {
      setLastFetchFailed(true);
      if (!(err instanceof ApiError && err.status === 401)) {
        // 背景 revalidate 失敗預設不打擾使用者：畫面繼續顯示舊資料。
        // 但訊號要曝露出去——補繳中的結帳頁不得讓進度靜默過期。
        if (!hasDataRef.current) showToast('無法獲取訂閱狀態', 'error');
        else console.error('[useSubscription] 背景重新請求失敗:', err);
      }
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 接上別人飛行中的請求時，自己的 fetchStatus 不會跑——請求結束後從快取補回
  // 結果；快取裡沒有就是那次請求失敗了（訊號照樣曝露給呼叫端）。
  const adoptShared = useCallback(() => {
    const entry = getEntry('subscriptionStatus');
    const writtenAt = entry ? Date.now() - entry.ageMs : -1;
    if (entry && !entry.fromStorage && writtenAt >= joinedAtRef.current) {
      setSubscriptionData(entry.data as SubscriptionData);
      hasDataRef.current = true;
      setLastFetchFailed(false);
    } else {
      // 請求失敗：舊快取照樣可以畫（stale-while-revalidate），但失敗訊號要留著。
      if (entry && !hasDataRef.current) {
        setSubscriptionData(entry.data as SubscriptionData);
        hasDataRef.current = true;
      }
      setLastFetchFailed(true);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinShared = () => {
    joinedAtRef.current = Date.now();
    return dedupe(DEDUP_KEY, fetchStatus, adoptShared);
  };

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    const cached = getCache('subscriptionStatus') as SubscriptionData | null;
    if (cached) {
      setSubscriptionData(cached);
      hasDataRef.current = true;
      setIsLoading(false);
    }
    // stale-while-revalidate：有快取先畫，同時（或沒快取時單純）背景重
    // 新請求一次——F5 後一個 round-trip 內就能看到最新的會員效期，不用
    // 再靠登出登入或等 5 分鐘的舊機制。
    if (!cached || isStale('subscriptionStatus')) {
      joinShared();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useRevalidateOnFocus(
    () => isStale('subscriptionStatus'),
    () => joinShared(),
  );

  const refresh = useCallback(async () => {
    clearCache('subscriptionStatus');
    await joinShared();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { subscriptionData, isLoading, isValidating, lastFetchFailed, refresh };
}
