// 嚴格三態限流與退額度（葉節點：只依賴注入的 Supabase client）。
//
// 既有 index.ts 的 rateLimit() 判 `allowed !== false`：RPC 出錯當成放行
// （fail-open），對「防濫用的第二道防線」是對的取捨。Email 邀請的 target 窗
// （同一信箱 24 小時一封）與全站窗（GoTrue 寄信上限）不同：放行就是寄信，
// 出錯時必須能分辨出來、讓呼叫端回 503 不寄。所以這裡回三態，只有
// `data === true` 才算放行。
//
// 殘餘：bump_rate_limit 自己 `exception when others then return true`
// （20260720000002），資料庫內部錯誤仍會被它吞成放行；鍵是固定格式，接受。

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type StrictRateLimitResult = 'allowed' | 'limited' | 'error';

export async function rateLimitStrict(
  sb: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<StrictRateLimitResult> {
  try {
    const { data, error } = await sb.rpc('bump_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return 'error';
    if (data === true) return 'allowed';
    if (data === false) return 'limited';
    return 'error';
  } catch {
    return 'error';
  }
}

/** 把 key 的計數退一格（refund_rate_limit）。失敗只記 log、不拋——它是善後。 */
export async function refundRateLimit(sb: SupabaseClient, key: string): Promise<void> {
  try {
    const { error } = await sb.rpc('refund_rate_limit', { p_key: key });
    if (error) console.error('[refundRateLimit] refund_rate_limit 失敗', key, error);
  } catch (e) {
    console.error('[refundRateLimit] refund_rate_limit 例外', key, e);
  }
}
