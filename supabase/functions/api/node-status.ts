// ============================================================
// 會籍四態（規格書 §7.2 節點狀態）：推薦網絡、會員驗證、後台推薦樹共用同一份。
//
// 從 index.ts 抽出（第 6 波 S3a 階段 5a），讓 admin-referral-tree.ts 不必反向
// import index.ts。行為不變，由 node-status.unit.test.ts 的 characterization 釘住。
// 順序：停權優先 → 非 active 即失效 → 距到期 ≤ RENEWAL_NOTICE_DAYS 天
// （無條件進位）為即將到期 → 其餘訂閱中。
// ============================================================
import { RENEWAL_NOTICE_DAYS } from '../_shared/api-contract.ts';

export type NodeStatus = 'active' | 'expiring' | 'expired' | 'suspended';

export function deriveNodeStatus(
  acct: { status?: string | null; end_date?: string | null } | null | undefined,
  suspendedAt: string | null,
  now: number = Date.now(),
): { status: NodeStatus; daysToExpiry: number | null } {
  if (suspendedAt) return { status: 'suspended', daysToExpiry: null };
  if (acct?.status !== 'active') return { status: 'expired', daysToExpiry: null };
  const dl = acct?.end_date
    ? Math.ceil((new Date(acct.end_date).getTime() - now) / 86_400_000)
    : null;
  if (dl !== null && dl >= 0 && dl <= RENEWAL_NOTICE_DAYS) {
    return { status: 'expiring', daysToExpiry: dl };
  }
  return { status: 'active', daysToExpiry: dl };
}
