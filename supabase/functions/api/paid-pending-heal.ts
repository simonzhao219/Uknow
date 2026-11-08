// ============================================================
// 自癒「已付款待開通」單（第 6 波 S1）：逐筆呼叫單筆 RPC，一筆一個交易。
// （紅燈期 stub：型別定案，行為待實作。）
// ============================================================

export type HealRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type HealResult = {
  candidates_found: number;
  completed_count: number;
  completed_order_ids: string[];
  amount_mismatch: number;
  skipped_locked: number;
  failed: { order_id: string; error: string }[];
  truncated: boolean;
};

export const HEAL_TIME_BUDGET_MS = { scheduled: 60_000, perUser: 10_000 };

export function healPaidPendingOrders(
  _rpc: HealRpc,
  _opts: { userId?: string; now?: () => number } = {},
): Promise<{ data: HealResult | null; error: { message: string } | null }> {
  return Promise.resolve({ data: null, error: { message: 'not implemented' } });
}
