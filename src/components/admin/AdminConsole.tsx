import type { AdminCache } from './adminCache';
import type { MemberManagementProps } from './MemberManagement';
import type { WithdrawalManagementProps } from './WithdrawalManagement';

export interface AdminConsoleProps {
  withdrawals: Pick<
    WithdrawalManagementProps,
    'loadWithdrawals' | 'updateStatus' | 'batchMarkPaid'
  >;
  members: Omit<MemberManagementProps, 'cache' | 'busy'>;
  /** 測試接縫：可觀察的 store 工廠。預設 `createAdminCache`。 */
  createCache?: () => AdminCache;
}

export function AdminConsole(_props: AdminConsoleProps) {
  return null;
}
