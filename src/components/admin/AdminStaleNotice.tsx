export interface AdminStaleNoticeProps {
  kind: 'failed' | 'slow';
  age: string;
  reason?: string;
  hidden?: string;
  onRetry?: () => void;
  announce?: boolean;
}

export function AdminStaleNotice(_props: AdminStaleNoticeProps) {
  return null;
}
