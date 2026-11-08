// 階段 5a 紅燈 stub：真正的實作在綠燈 commit 從 index.ts 搬過來。
export type NodeStatus = 'active' | 'expiring' | 'expired' | 'suspended';

export function deriveNodeStatus(
  _acct: { status?: string | null; end_date?: string | null } | null | undefined,
  _suspendedAt: string | null,
  _now: number = Date.now(),
): { status: NodeStatus; daysToExpiry: number | null } {
  return { status: 'active', daysToExpiry: null };
}
