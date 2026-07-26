// 會員核身結果的會籍狀態 → 顯示映射（純函式，便於單元測試）。
// 與後端 deriveNodeStatus 的四態一致；顯示一律「顏色＋文字＋圖示」三管齊下，
// 不只靠顏色（比照 SubscriptionStatusCard；紅綠色覺辨識障礙也讀得懂）。

export type MemberVerifyStatus = 'active' | 'expiring' | 'expired' | 'suspended';

export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface MemberVerifyStatusDisplay {
  label: string;
  tone: StatusTone;
}

export function memberVerifyStatusDisplay(status: MemberVerifyStatus): MemberVerifyStatusDisplay {
  switch (status) {
    case 'active':
      return { label: '會籍有效', tone: 'good' };
    case 'expiring':
      return { label: '即將到期', tone: 'warn' };
    case 'expired':
      return { label: '會籍已過期', tone: 'bad' };
    case 'suspended':
      return { label: '已停權', tone: 'bad' };
  }
}
