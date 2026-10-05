import type { ReactNode } from 'react';

export interface AdminToolbarProps {
  filter: ReactNode;
  onRefresh: () => void;
  isRefreshing: boolean;
  onExport?: () => void;
  isExporting?: boolean;
  disabled?: boolean;
}

export function AdminToolbar(_props: AdminToolbarProps) {
  return null;
}
