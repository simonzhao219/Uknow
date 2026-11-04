// ============================================================
// POST /internal/reconcile-pending-payments 的端點層（驗證之後的部分）。
//
// 從 index.ts 抽出來，是為了讓端點層的行為有測試縫：heal pass、對帳迴圈、
// 回應映射都由 deps 注入，測試不必 stub fetch 或 PayUni 環境。對帳迴圈本身
// （reconcilePendingOrders）仍在 index.ts，既有測試照舊直接測它。
//
// 回傳 ScheduledRunOutcome（scheduled-runs.ts）：業務結果正常回傳；迴圈擲錯
// 照樣往上丟，由路由既有的 catch 回 500。
// ============================================================
import type { ScheduledRunOutcome } from './scheduled-runs.ts';

export type ReconcileSummary = {
  checked: number;
  resolved: number;
  stillPending: number;
  expired: number;
  queryErrors: number;
};

export type ReconcileHandlerDeps = {
  heal: () => Promise<{ data: unknown; error: unknown }>;
  reconcile: () => Promise<ReconcileSummary>;
  logError: (message: string, ...detail: unknown[]) => void;
};

export async function handleReconcile(deps: ReconcileHandlerDeps): Promise<ScheduledRunOutcome> {
  // 先跑自癒 pass：把「已存有 PayUni SUCCESS 回應」的卡單直接收斂成
  // 訂閱（migration 0007），不需要 PayUni 查詢 API。補完的訂單會離開
  // pending，下面的掃描自然不會再碰到。
  const { data: healSummary, error: healError } = await deps.heal();
  // ⚠️ 已知缺口(已評估、刻意延後,見 friction-log 2026-08-17 記債清單；
  // 第 5 波 W5-18 再次決定不收):這裡只寫 log,而且執行會繼續、端點仍回
  // { success: true }——安全網的第一段靜默沒跑,回應形狀斷言照樣過。
  // 下一個做 console.error 掃描的人:這個坑已經被看過了,不用重新發現。
  if (healError) deps.logError('[reconcile-pending-payments] heal pass 失敗:', healError);

  const summary = await deps.reconcile();
  const body = { success: true, data: { ...summary, heal: healSummary ?? null } };
  return { status: 'succeeded', summary: { ...summary }, response: { httpStatus: 200, body } };
}
