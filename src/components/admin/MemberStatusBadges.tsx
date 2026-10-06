import { Badge } from '../ui/badge';

// 會員狀態徽章的**單一來源**：桌機表格、手機卡片、詳情身分卡共用。三處各自手刻
// 的那天，就會有一處的「已暫停」換了顏色而另外兩處沒跟上。
//
// S2 色彩收斂（D3）：active 是「這人現在能用」的正向狀態 → success-subtle；expired
// 是中性的過期事實，不是警示，走 secondary。
const ACCOUNT_STATUS_BADGE: Record<
  string,
  { label: string; variant: 'success-subtle' | 'secondary' }
> = {
  active: { label: '有效會員', variant: 'success-subtle' },
  expired: { label: '已失效', variant: 'secondary' },
};

export function AccountStatusBadge({ status }: { status: string }) {
  const badge = ACCOUNT_STATUS_BADGE[status] ?? ACCOUNT_STATUS_BADGE.expired;
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

export function SuspendedBadge() {
  return <Badge variant="destructive">已暫停</Badge>;
}

export function AdminBadge() {
  return <Badge variant="default">管理員</Badge>;
}
