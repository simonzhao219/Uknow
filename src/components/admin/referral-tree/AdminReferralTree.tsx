// 階段 7 紅燈 stub。
import type { ReferralTreeLoaders } from './loaders';

export interface AdminReferralTreeProps {
  loaders: ReferralTreeLoaders;
  onOpenNode: (id: string) => void;
  focusId?: string | null;
  onFocusConsumed?: () => void;
  searchDebounceMs?: number;
}

export function AdminReferralTree(_props: AdminReferralTreeProps) {
  return null;
}
