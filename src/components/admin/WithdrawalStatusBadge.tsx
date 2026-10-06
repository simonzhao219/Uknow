import { Badge } from '../ui/badge';

// 提領生命週期（與後端 SQL 函數一致）：
//   pending（待處理）→ awaiting_collection（已匯款，待查收）
//                   → completed（用戶已確認查收）
//   pending → rejected（退件，點數自動退回）
//
// **後台**的狀態對照只有這一張表：提領管理（表格、手機卡片、CSV、轉換歷史、篩選
// 選單）與會員詳情的近期提領都從這裡取，同一筆在兩頁不會是兩種顏色。會員端
// `reward/WithdrawalSection.tsx` 依受眾另有一份（標籤用「處理中／已拒絕」），
// 不併進來；待查收在兩端的顏色統一另案處理。
type BadgeVariant = 'secondary' | 'warning' | 'outline' | 'destructive';

const WITHDRAWAL_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: '待處理', variant: 'secondary' },
  awaiting_collection: { label: '待查收', variant: 'warning' },
  completed: { label: '已完成', variant: 'outline' },
  rejected: { label: '已退件', variant: 'destructive' },
};

/** 四個狀態值，依生命週期排序（篩選選單用）。 */
export const WITHDRAWAL_STATUS_VALUES = Object.keys(WITHDRAWAL_STATUS);

/** 狀態的中文標籤；未知值原樣回傳（後端新增狀態時至少看得到原字）。 */
export function withdrawalStatusLabel(status: string): string {
  return WITHDRAWAL_STATUS[status]?.label ?? status;
}

export function WithdrawalStatusBadge({ status }: { status: string }) {
  const entry = WITHDRAWAL_STATUS[status];
  return <Badge variant={entry?.variant ?? 'secondary'}>{entry?.label ?? status}</Badge>;
}
