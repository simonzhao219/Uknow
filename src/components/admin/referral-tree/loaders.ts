// 後台推薦樹的資料存取介面：AdminDashboard 以 apiClient 實作，經
// AdminConsole → MemberManagement 整包注入（規劃 §3，不在 MemberManagementProps 上逐一加欄位）。
import type {
  AdminReferralMemberAudit,
  AdminReferralNodesResponse,
  AdminReferralPaymentsResponse,
  AdminReferralSearchResponse,
} from '@admin-referral-contract';

// unplaceableCount 只在頂層回應出現；契約的 optional() 推導成「必有 key、值可為
// undefined」，這裡放寬成真正的可省略欄位，呼叫端與測試不必補 undefined。
export type NodesData = Omit<AdminReferralNodesResponse['data'], 'unplaceableCount'> & {
  unplaceableCount?: number;
};
export type SearchData = AdminReferralSearchResponse['data'];
export type PaymentsData = AdminReferralPaymentsResponse['data'];

export interface NodesParams {
  parentId?: string | null;
  group?: 'unplaceable' | null;
  ensureId?: string | null;
  limit: number;
  offset: number;
}

export interface ReferralTreeLoaders {
  loadNodes: (params: NodesParams) => Promise<NodesData>;
  search: (params: { q: string; limit: number; offset: number }) => Promise<SearchData>;
  loadMember: (id: string) => Promise<AdminReferralMemberAudit>;
  loadPayments: (id: string, params: { limit: number; offset: number }) => Promise<PaymentsData>;
}
