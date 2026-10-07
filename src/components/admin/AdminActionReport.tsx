export interface AdminActionReportProps {
  status: { tone: 'success' | 'warning'; text: string } | null;
  failure: string | null;
  focusFailure?: boolean;
  onDismiss: () => void;
}

export function AdminActionReport(_props: AdminActionReportProps) {
  return null;
}
