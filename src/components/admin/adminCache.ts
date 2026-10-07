export type AdminResource = 'withdrawals' | 'members' | 'announcements';

export type AdminSlot = `${AdminResource}:${string}`;

export interface AdminQuery<P> {
  id: string;
  slot: AdminSlot | null;
  resource: AdminResource | null;
  params: P;
}

export interface WithdrawalListParams {
  status: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface MemberListParams {
  search?: string;
}

export const adminQuery = {
  withdrawals(q: WithdrawalListParams): AdminQuery<WithdrawalListParams> {
    return { id: '', slot: null, resource: null, params: q };
  },
  members(q: { search: string }): AdminQuery<MemberListParams> {
    return { id: '', slot: null, resource: null, params: q };
  },
  announcements(): AdminQuery<Record<string, never>> {
    return { id: '', slot: null, resource: null, params: {} };
  },
  idReviews(): AdminQuery<Record<string, never>> {
    return { id: '', slot: null, resource: null, params: {} };
  },
};

export interface AdminSnapshot<T = unknown, M = unknown> {
  items: T[];
  total: number;
  meta?: M;
  fetchedAt: number;
}

export type AdminMutationEvent =
  | 'withdrawalStatus'
  | 'withdrawalBatchPaid'
  | 'memberSuspend'
  | 'memberAdmin'
  | 'announcementCreate'
  | 'announcementDelete'
  | 'accessLost';

export const ADMIN_MUTATION_GROUPS: Record<AdminMutationEvent, readonly AdminResource[]> = {
  withdrawalStatus: [],
  withdrawalBatchPaid: [],
  memberSuspend: [],
  memberAdmin: [],
  announcementCreate: [],
  announcementDelete: [],
  accessLost: [],
};

export interface AdminView {
  withdrawalStatus: string;
  memberTab: string;
}

export interface AdminCache {
  read<T = unknown, M = unknown>(slot: AdminSlot): AdminSnapshot<T, M> | undefined;
  write(slot: AdminSlot, snapshot: AdminSnapshot, stamp: number): void;
  invalidate(event: AdminMutationEvent): void;
  fenceOf(resource: AdminResource): number;
  readView(): AdminView;
  writeView(partial: Partial<AdminView>): void;
  open(): void;
  dispose(): void;
}

export function createAdminCache(): AdminCache {
  return {
    read: () => undefined,
    write: () => {},
    invalidate: () => {},
    fenceOf: () => 0,
    readView: () => ({ withdrawalStatus: '', memberTab: '' }),
    writeView: () => {},
    open: () => {},
    dispose: () => {},
  };
}
