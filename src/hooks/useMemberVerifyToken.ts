import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';

export interface MemberVerifyToken {
  token: string;
  expiresAt: string; // ISO
}

export interface UseMemberVerifyTokenResult {
  data: MemberVerifyToken | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// 到期前這麼多毫秒就自動換發（sliding window）：會員正把螢幕遞給店家掃描時，
// 倒數不會歸零、店家不會掃到剛過期的碼。
const RENEW_LEAD_MS = 15_000;
const MIN_DELAY_MS = 3_000;

/**
 * 會員自取「身分核身」短效碼，並在到期前自動換發。
 * @param enabled 只有核身碼分頁被選取時才取碼／輪替（未顯示不浪費請求）。
 */
export function useMemberVerifyToken(enabled: boolean): UseMemberVerifyTokenResult {
  const [data, setData] = useState<MemberVerifyToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequestJson<{ success: boolean; data: MemberVerifyToken }>(
        buildApiUrl('/members/verify-token'),
      );
      setData(result.data);
    } catch (err: any) {
      setError(err?.message || '無法取得核身碼，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  // 進入分頁即取一次碼。
  useEffect(() => {
    if (!enabled) return;
    fetchToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // 到期前自動換發。
  useEffect(() => {
    if (!enabled || !data) return;
    const untilExpiry = new Date(data.expiresAt).getTime() - Date.now();
    const delay = Math.max(untilExpiry - RENEW_LEAD_MS, MIN_DELAY_MS);
    timerRef.current = setTimeout(fetchToken, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, data, fetchToken]);

  return { data, loading, error, refresh: fetchToken };
}
