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
import {
  type ScheduledRunDeps,
  type ScheduledRunOutcome,
  type ScheduledTrigger,
  withScheduledRun,
} from './scheduled-runs.ts';
import type { HealResult } from './paid-pending-heal.ts';

export type ReconcileSummary = {
  checked: number;
  resolved: number;
  stillPending: number;
  expired: number;
  queryErrors: number;
  queryFailures: number;
  expireErrors: number;
  unknownStatus: number;
  /** R5 P2-7：unknownStatus 依原因分計（四者和＝unknownStatus）。 */
  unknownByReason: Record<UnknownReason, number>;
  incomplete: number;
};

export const UNKNOWN_REASONS = [
  'unknown_code',
  'missing_field',
  'no_matching_trade',
  'incomplete_too_long',
] as const;
export type UnknownReason = typeof UNKNOWN_REASONS[number];

export type ReconcileClassification = 'ok' | 'all_failed' | 'majority_failed';

/**
 * ops P1-3（W5-19）的判準。只計 queryErrors（擲錯：HTTP／網路／解密失敗）：
 * 查詢層非 SUCCESS（queryFailures）已有自己的 payuni-query 告警，而且棄付單的
 * 「查無此單」也走那條，算進來會讓只剩一兩張棄付單時每小時 502。
 *   * 全滅：checked >= 2。checked=1 是單張單的單次例外——#460 刻意維持 warning
 *   * 過半：checked >= 3。checked=2 的過半就是 2/2（全滅已涵蓋），1/2 是一半不算
 */
export function classifyReconcileOutcome(s: ReconcileSummary): ReconcileClassification {
  if (s.checked >= 2 && s.queryErrors === s.checked) return 'all_failed';
  if (s.checked >= 3 && s.queryErrors * 2 > s.checked) return 'majority_failed';
  return 'ok';
}

const ALERT_SOURCE = 'reconcile-pending-payments';

/** 帳本 summary.heal：只放計數（camelCase、failed 是數字），不放訂單 id。SQL streak 讀這一份。 */
export type HealLedgerSummary = {
  candidates: number;
  completed: number;
  failed: number;
  skippedLocked: number;
  amountMismatch: number;
  truncated: boolean;
  error: boolean;
};

/** heal 回傳的 data 是外部（RPC／注入）來的，逐鍵防禦：形狀不符就當 0，不擲錯。 */
export function healLedgerSummary(data: unknown, error: unknown): HealLedgerSummary {
  const r = (data && typeof data === 'object' ? data : null) as Partial<HealResult> | null;
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  return {
    candidates: n(r?.candidates_found),
    completed: n(r?.completed_count),
    failed: Array.isArray(r?.failed) ? r.failed.length : 0,
    skippedLocked: n(r?.skipped_locked),
    amountMismatch: n(r?.amount_mismatch),
    truncated: r?.truncated === true,
    error: !!error || r === null,
  };
}

export type ReconcileHandlerDeps = {
  heal: () => Promise<{ data: unknown; error: unknown }>; // 正式路徑回 HealResult
  reconcile: () => Promise<ReconcileSummary>;
  alertOnce: (
    source: string,
    dedupe: Record<string, string>,
    context: Record<string, unknown>,
    message: string,
    severity: 'info' | 'warning' | 'error',
  ) => Promise<void>;
  now: () => Date;
  logError: (message: string, ...detail: unknown[]) => void;
};

export async function handleReconcile(deps: ReconcileHandlerDeps): Promise<ScheduledRunOutcome> {
  // 先跑自癒 pass：把「已存有 PayUni SUCCESS 回應」的卡單直接收斂成
  // 訂閱（migration 0007），不需要 PayUni 查詢 API。補完的訂單會離開
  // pending，下面的掃描自然不會再碰到。
  const { data: healSummary, error: healError } = await deps.heal();
  // heal 失敗：寫進帳本 summary.heal.error（第 6 波 S1，R5 P2-8），scheduler_health 的
  // healFailedStreak 看得到連續失敗；依 W6-11（維持 W5-18）不推 LINE，端點照常對帳、回 success。
  if (healError) deps.logError('[reconcile-pending-payments] heal pass 失敗:', healError);
  const healLedger = healLedgerSummary(healSummary, healError);

  const summary = await deps.reconcile();
  const heal = healSummary ?? null;
  const ratio = `${summary.queryErrors}/${summary.checked}`;
  // UTC 小時桶：沒人 resolve 時，下一小時會再推（同 payuni-failure-burst）。
  const hour = deps.now().toISOString().slice(0, 13);
  const context = { checked: summary.checked, queryErrors: summary.queryErrors };

  switch (classifyReconcileOutcome(summary)) {
    case 'all_failed': {
      const message =
        `【對帳】PayUni 查詢本輪全部失敗（${ratio}），付款狀態無法確認，訂單不會被標過期。` +
        '請確認 PayUni 查詢 API 與正式站 Edge Secrets 的 PAYUNI_* 憑證；恢復後下一輪自動重試。持續中會每小時再告警。';
      await deps.alertOnce(
        ALERT_SOURCE,
        { reason: 'query_all_failed', hour },
        context,
        message,
        'error',
      );
      return {
        status: 'failed',
        errorCode: 'query_all_failed',
        summary: { ...summary, heal: healLedger },
        response: {
          httpStatus: 502,
          body: {
            success: false,
            error: { code: 'query_all_failed', message: 'PayUni 查詢本輪全部失敗' },
            data: { ...summary, heal },
          },
        },
      };
    }
    case 'majority_failed': {
      const message = `【對帳】PayUni 查詢本輪過半失敗（${ratio}），部分付款可能延後開通。` +
        '請確認 PayUni 狀態；持續中會每小時再告警。';
      await deps.alertOnce(
        ALERT_SOURCE,
        { reason: 'query_majority_failed', hour },
        context,
        message,
        'error',
      );
      const degraded = { ...summary, degraded: true };
      return {
        status: 'succeeded',
        summary: { ...degraded, heal: healLedger },
        response: { httpStatus: 200, body: { success: true, data: { ...degraded, heal } } },
      };
    }
    default:
      return {
        status: 'succeeded',
        summary: { ...summary, heal: healLedger },
        response: { httpStatus: 200, body: { success: true, data: { ...summary, heal } } },
      };
  }
}

/** 對帳端點的完整流程：租約＋帳本（withScheduledRun）包住 handleReconcile。 */
export function runScheduledReconcile(
  run: ScheduledRunDeps,
  trigger: ScheduledTrigger,
  deps: ReconcileHandlerDeps,
): Promise<ScheduledRunOutcome['response']> {
  return withScheduledRun(run, 'reconcile', trigger, () => handleReconcile(deps));
}
