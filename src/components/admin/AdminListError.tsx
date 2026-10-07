export interface AdminListErrorProps {
  message: string;
  retryLabel: string;
  tone: 'flow' | 'secondary';
  onRetry: () => void;
  id?: string;
}

export function AdminListError({ message }: AdminListErrorProps) {
  return <p>{message}</p>;
}
