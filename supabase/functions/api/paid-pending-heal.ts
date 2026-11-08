// ============================================================
// 自癒「已付款待開通」單（pending 但 payuni_response 已存 SUCCESS）：逐筆呼叫單筆 RPC，
// 一筆一個交易（第 6 波 S1；R5 P2-5）。
//
// 為什麼不是一次 RPC：complete_paid_pending_orders 是單一交易，前一位付款人的 profiles 鎖
// 留到整批結束，與線上付款互鎖（見 migration 20261115000001 檔頭）。PostgREST 的每次 rpc()
// 是獨立交易，逐筆呼叫就讓每筆 commit 即放鎖。
//
// 從 index.ts 抽出、rpc 由呼叫端注入（同 reconcile-handler.ts）：單元測試只需實作 HealRpc。
// ============================================================

export type HealRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** 與舊 complete_paid_pending_orders 回傳同形，另加 truncated。 */
export type HealResult = {
  candidates_found: number;
  completed_count: number;
  completed_order_ids: string[];
  amount_mismatch: number;
  skipped_locked: number;
  failed: { order_id: string; error: string }[];
  truncated: boolean;
};

/**
 * 時間預算：單筆之間的檢查點，不是整體硬上界。單一 RPC 內本人那把鎖由 0b 預取的
 * lock_timeout 3s 兜住；推薦人方向的等待受對方單筆付款長度限制。排程 60 秒（pg_net 逾時
 * 150 秒、heal 在對帳迴圈之前跑，留一半以上給對帳）；per-user 10 秒（使用者請求路徑）。
 * 可調工程參數，單一出處。
 */
export const HEAL_TIME_BUDGET_MS = { scheduled: 60_000, perUser: 10_000 };

type SingleOutcome = { outcome?: string; error?: string };

/**
 * 單筆 RPC 回錯不代表 DB 沒 commit（逾時、斷線）：仍記進 failed；下一輪重跑是冪等 no-op，
 * 帳本的 healFailedStreak 可能因此偶爾多算一輪。
 */
export async function healPaidPendingOrders(
  rpc: HealRpc,
  opts: { userId?: string; now?: () => number } = {},
): Promise<{ data: HealResult | null; error: { message: string } | null }> {
  const now = opts.now ?? Date.now;
  const budget = opts.userId ? HEAL_TIME_BUDGET_MS.perUser : HEAL_TIME_BUDGET_MS.scheduled;

  const list = await rpc('list_paid_pending_order_ids', { p_user_id: opts.userId ?? null });
  if (list.error) return { data: null, error: list.error };
  // 非陣列不能當成 0 筆：那會掩蓋「migration 未套」之類的問題。
  if (!Array.isArray(list.data)) {
    return { data: null, error: { message: 'list 回傳形狀不符' } };
  }
  const ids = list.data as string[];

  const result: HealResult = {
    candidates_found: ids.length,
    completed_count: 0,
    completed_order_ids: [],
    amount_mismatch: 0,
    skipped_locked: 0,
    failed: [],
    truncated: false,
  };
  const started = now();

  for (const id of ids) {
    if (now() - started >= budget) {
      result.truncated = true; // 剩下的下一輪處理
      break;
    }
    let single: { data: unknown; error: { message: string } | null };
    try {
      single = await rpc('complete_paid_pending_order', { p_order_id: id });
    } catch (e) {
      result.failed.push({ order_id: id, error: String(e) });
      continue;
    }
    if (single.error) {
      result.failed.push({ order_id: id, error: single.error.message });
      continue;
    }
    const r = (single.data ?? {}) as SingleOutcome;
    switch (r.outcome) {
      case 'completed':
        result.completed_order_ids.push(id);
        break;
      case 'amount_mismatch':
        result.amount_mismatch++;
        break;
      case 'failed':
        result.failed.push({ order_id: id, error: r.error ?? '' });
        break;
      case 'skipped':
      case 'skipped_locked':
        result.skipped_locked++; // 與舊版混計同義（謂詞不成立＋被鎖）
        break;
      default:
        result.failed.push({ order_id: id, error: `未知 outcome: ${String(r.outcome)}` });
    }
  }
  result.completed_count = result.completed_order_ids.length;
  return { data: result, error: null };
}
