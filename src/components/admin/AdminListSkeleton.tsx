export interface AdminListSkeletonProps {
  label: string;
  variant: 'rows' | 'cards';
  count?: number;
  message?: string;
}

export function AdminListSkeleton({ label }: AdminListSkeletonProps) {
  return <output aria-label={label} />;
}
