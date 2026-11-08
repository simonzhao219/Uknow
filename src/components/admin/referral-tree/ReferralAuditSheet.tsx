// 階段 8 紅燈 stub。
import type { ReferralTreeLoaders } from './loaders';

export interface ReferralAuditSheetProps {
  loaders: ReferralTreeLoaders;
  userId: string;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function ReferralAuditSheet(_props: ReferralAuditSheetProps) {
  return null;
}
