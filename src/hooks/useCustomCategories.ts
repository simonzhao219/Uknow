import { useEffect, useState } from 'react';
import { createClient } from '../utils/supabase/client';
import { type CategoryUsageRow, deriveCustomCategories } from '../utils/serviceCategories';

/**
 * 目前有可見刊登在使用的**自訂**服務類別(內建 30 類已扣除)。
 *
 * 唯一查 `public_listing_categories` view 的地方。刊登表單與首頁篩選器都走
 * 這裡——全站對「哪些類別存在」只有一個答案。原本規劃讓首頁從已載入的
 * `serviceProviders` 就地推導,已否決:`HomePage` 的查詢沒有 `limit`,撞到
 * PostgREST 列數上限時它拿到的不是全部刊登,於是表單列得出某個自訂類別、
 * 首頁篩選器卻篩不到任何一筆。
 *
 * **刻意不走 `useDataCache` 的 SWR 慣例**(`src/hooks/` 其他資料 hook 都走那套):
 * 類別詞彙必須反映最新資料——使用者送出一個新的自訂類別後若讀到快取,會看不到
 * 自己剛建立的類別。查詢只有約 35 列,快取效益低於失效風險。
 *
 * 失敗時回空陣列而非拋錯:自訂類別是**附加**資訊,取不到時表單仍該能用
 * (內建 30 類 + 自訂輸入都還在)。編輯既有刊登的正確性不依賴這條查詢——
 * 那由 `allKnownCategories(custom, current)` 把當前值併進選項來保證。
 */
export function useCustomCategories(): { customCategories: string[]; loading: boolean } {
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchCategories = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('public_listing_categories')
          .select('category, listing_count');

        if (error) throw error;
        if (cancelled) return;
        setCustomCategories(deriveCustomCategories((data ?? []) as CategoryUsageRow[]));
      } catch (error) {
        console.error('獲取自訂服務類別失敗:', error);
        if (!cancelled) setCustomCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  return { customCategories, loading };
}
