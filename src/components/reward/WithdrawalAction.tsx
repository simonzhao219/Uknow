export interface WithdrawalActionProps {
  availableRewards: number;
  hasWithdrawnToday: boolean;
  subscriptionStatus?: string | null;
  referralProgramJoined?: boolean;
  onStartWithdrawal: () => void;
}

export function WithdrawalAction(_props: WithdrawalActionProps) {
  return null;
}
