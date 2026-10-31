// ============================================================
// PayUni 非 SUCCESS 回應的分類與「多使用者連續失敗」判定。
//
// 起因：10/28 正式站原商店停用，PayUni 回 `DEF01006 商店狀態不符合`，
// resolveOrderFromPayUni 把訂單標 failed 就結束——每個人都付不了卻零告警。
// 使用者雖然看得到失敗頁，但每個人看到的都只是「我付款失敗」，沒有人知道
// 是全站性的；這正是 logSystemAlert 判準第 3 條「既有機制不會回報」。
//
// 判準來自實證，不是猜：
//   * 正式站 10/28 兩筆 DEF01006、develop sandbox UPP02085（商店尚未啟用
//     電子發票）——payuni_response 只有 5 鍵 [MerID, MerTradeNo, Message,
//     Status, TradeAmt]，沒有 ResCode：建單層就被拒、沒走到發卡行授權。
//   * 同日 CREDIT05002 授權失敗有 23 鍵、含 ResCode／AuthBank——持卡人層，
//     單筆不是商店問題（但多人連續發生就值得看，見 isFailureBurst）。
// 所以「沒有 ResCode 的非 SUCCESS」一律視為商店／設定類。⚠️ 這個形狀判準
// 只由上面三筆驗過；PayUni 文件沒有公開完整碼表，其他無 ResCode 的拒絕
// （例如使用者在支付頁取消，若 PayUni 會導回的話）可能被歸到商店類——
// 代價是多一筆去重過的告警，比漏報便宜。
// ============================================================

export type PayUniRejectionKind = 'merchant' | 'user';

/** 實證過的商店／設定類碼（來源見檔頭）。新碼要附來源才加。 */
const KNOWN_MERCHANT_CODES = new Set(['DEF01006', 'UPP02085']);

export function classifyPayUniRejection(data: Record<string, string>): PayUniRejectionKind {
  const status = data.Status ?? '';
  if (KNOWN_MERCHANT_CODES.has(status)) return 'merchant';
  // queryPayUniTradeStatus 合成的 FAILED_2／FAILED_3（TradeStatus 付款失敗／
  // 取消）不是 PayUni 原碼，也沒有 ResCode——不能被形狀判準誤判成商店類。
  if (status.startsWith('FAILED_')) return 'user';
  return 'ResCode' in data ? 'user' : 'merchant';
}

/** 一小時內至少這麼多「不同」使用者連續失敗，才算全站性的徵兆。 */
export const FAILURE_BURST_DISTINCT_USERS = 3;
export const FAILURE_BURST_WINDOW_MINUTES = 60;

/** 同一人重試多次不算——那是那張卡的問題，不是全站的。 */
export function isFailureBurst(userIds: string[]): boolean {
  return new Set(userIds).size >= FAILURE_BURST_DISTINCT_USERS;
}

/**
 * 回傳「窗口內、最後一筆成功付款之後」失敗訂單的使用者清單。
 * 「連續」用最後一筆 completed_at 切：中間有人付成功就代表通道還活著。
 * payment_orders 沒有 failed_at，以 created_at 近似（失敗通常在建單後
 * 數分鐘內回來）。查詢失敗回 null，由呼叫端略過——這是附加訊號，不擋流程。
 */
export async function recentConsecutiveFailureUsers(
  client: any,
  now = new Date(),
): Promise<string[] | null> {
  const windowStart = new Date(now.getTime() - FAILURE_BURST_WINDOW_MINUTES * 60_000);
  const { data: lastPaid, error: paidErr } = await client
    .from('payment_orders')
    .select('completed_at')
    .eq('status', 'completed')
    .gte('completed_at', windowStart.toISOString())
    .order('completed_at', { ascending: false })
    .limit(1);
  if (paidErr) return null;

  const since = lastPaid?.[0]?.completed_at ?? windowStart.toISOString();
  const { data: failed, error: failedErr } = await client
    .from('payment_orders')
    .select('user_id')
    .eq('status', 'failed')
    .gt('created_at', since)
    .limit(200);
  if (failedErr) return null;
  return (failed ?? []).map((r: { user_id: string }) => r.user_id);
}
