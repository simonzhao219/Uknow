import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { UserContext } from '../App';
import { useDataCache } from '../contexts/DataCacheContext';
import { dedupe } from '../utils/requestDedup';
import { useRevalidateOnFocus } from './useRevalidateOnFocus';
import { createClient } from '../utils/supabase/client';
import { useNotification } from '../components/notifications/NotificationContext';

/**
 * 使用者的刊登。單一刊登模式：一個帳號最多一則，查不到就是 null。
 *
 * 刊登刻意沒有「活躍／過期」狀態欄位——是否對外顯示完全由帳號訂閱決定，
 * 在資料層一處守門（HomePage 讀 public_listings view）。因此這裡只回
 * 「有沒有刊登」與刊登本身的內容，不要在 UI 上發明狀態徽章。
 */
export interface UserListing {
  id: string;
  name: string;
  category?: string;
  city?: string;
  districts?: string[];
  district?: string;
  description?: string;
  photos?: string[];
  [key: string]: any;
}

export interface UseUserListingResult {
  /** null 有兩種意思，必須配合 loading／error 一起讀：資料還沒到、或確實沒有刊登。 */
  listing: UserListing | null;
  loading: boolean;
  isValidating: boolean;
  /** 冷啟動失敗才會有值；背景 revalidate 失敗畫面沿用舊資料，不設 error。 */
  error: string | null;
  refetch: () => Promise<void>;
}

const CACHE_KEY = 'userListing' as const;
const DEDUP_KEY = 'userListing';

/**
 * 刊登資料的單一來源（stale-while-revalidate，與其他 hooks 對齊）。
 *
 * 會員中心的「刊登管理」卡片與刊登管理頁共用這個 hook 與同一個快取鍵，
 * 兩處才不會各自維護一份 fetch 邏輯而在邊界互相矛盾。
 *
 * @param enabled 傳 false 時完全不請求（例如 serviceProviderManagement
 *   feature flag 關閉時，會員中心不該為了一張不會顯示的卡片打 API）。
 */
export function useUserListing({
  enabled = true,
}: {
  enabled?: boolean;
} = {}): UseUserListingResult {
  const { user } = useContext(UserContext);
  const { getCache, setCache, hasCache, isStale } = useDataCache();
  const { showToast } = useNotification();

  const [listing, setListing] = useState<UserListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);
  // fetchListing 的 identity 要穩定（focus listener 只掛一次），所以
  // 讀最新的 user id 走 ref 而不是 closure。
  const userIdRef = useRef<string | undefined>(user?.id);
  userIdRef.current = user?.id;

  const fetchListing = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) {
      setListing(null);
      setLoading(false);
      return;
    }

    if (hasDataRef.current) {
      setIsValidating(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (queryError) throw queryError;

      const next = (data as UserListing) ?? null;
      // null 也要寫進快取：「這個人沒有刊登」是查證過的結果，值得快取，
      // 讀取端用 hasCache 而不是 data != null 來判斷有沒有快取過。
      setCache(CACHE_KEY, next);
      setListing(next);
      setError(null);
      hasDataRef.current = true;
    } catch (err: any) {
      const msg = err?.message || '獲取刊登失敗，請稍後再試';
      if (!hasDataRef.current) {
        // 冷啟動失敗才對使用者報錯。這裡刻意不把 listing 設成 null——
        // 呼叫端要能分辨「查不到刊登」與「查失敗」，否則會對已經有刊登
        // 的人顯示「尚未刊登」的空狀態與建立 CTA。
        setError(msg);
        showToast(msg, 'error');
      } else {
        console.error('[useUserListing] 背景重新請求失敗:', msg);
      }
    } finally {
      setLoading(false);
      setIsValidating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!user?.id) {
      setListing(null);
      hasDataRef.current = false;
      setLoading(false);
      return;
    }

    // 有快取先畫（秒開），stale 時背景重新請求。
    if (hasCache(CACHE_KEY)) {
      setListing(getCache(CACHE_KEY));
      hasDataRef.current = true;
      setLoading(false);
    }
    if (!hasCache(CACHE_KEY) || isStale(CACHE_KEY)) {
      dedupe(DEDUP_KEY, fetchListing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, enabled]);

  useRevalidateOnFocus(
    () => enabled && !!userIdRef.current && isStale(CACHE_KEY),
    () => dedupe(DEDUP_KEY, fetchListing),
  );

  const refetch = useCallback(() => dedupe(DEDUP_KEY, fetchListing), [fetchListing]);

  return { listing, loading, isValidating, error, refetch };
}
