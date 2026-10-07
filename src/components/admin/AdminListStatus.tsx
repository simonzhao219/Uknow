export interface AdminListStatusProps {
  id?: string;
  shown: number;
  total: number;
  state: 'loading' | 'ready' | 'hidden';
  suffix?: string;
}

export function AdminListStatus({ id, shown, total }: AdminListStatusProps) {
  return (
    <p id={id}>
      已顯示 {shown} / {total} 筆
    </p>
  );
}
