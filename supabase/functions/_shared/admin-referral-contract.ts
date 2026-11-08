// ============================================================
// 後台推薦樹查帳：/admin/referral-tree/* 的契約（第 6 波 S3a）。
//
// 為什麼不放在 api-contract.ts：那份檔案被前端入口 bundle 直接 import，模組頂層的
// schema 物件（obj()/literals() 的呼叫）無法被 tree-shake，放進去會讓每一位訪客都
// 多下載後台才用得到的定義（CI ae25f1be 的 bundle 預算：entry gzip 316.1／316 kB）。
// 本檔只被 Edge 端與後台（lazy 載入）引用，前端經 alias `@admin-referral-contract`。
//
// 零依賴（同 api-contract.ts）：只 import 同目錄的 combinator。
// ============================================================
import {
  arr,
  bool,
  type Infer,
  literals,
  nullable,
  num,
  obj,
  optional,
  str,
} from './api-contract.ts';

export const ADMIN_REFERRAL_ANOMALY_KINDS = [
  'cycle',
  'self_referral',
  'missing_reward',
  'recipient_mismatch',
] as const;

const AdminReferralAnomalyKindSchema = literals(...ADMIN_REFERRAL_ANOMALY_KINDS);
export type AdminReferralAnomalyKind = Infer<typeof AdminReferralAnomalyKindSchema>;

const AdminReferralNodeFields = {
  id: str(),
  name: str(),
  referralCode: nullable(str()),
  /** 第 N 層（從頂層算）；在環上或往上超過 50 層時為 null。 */
  layer: nullable(num()),
  directCount: num(),
  status: literals('active', 'expiring', 'expired', 'suspended'),
  daysToExpiry: nullable(num()),
  endDate: nullable(str()),
  referralProgramJoined: bool(),
  referralProgramJoinedAt: nullable(str()),
  anomalyKinds: arr(AdminReferralAnomalyKindSchema),
  /** 付款異常只掃最近 50 筆；超過時為 true。 */
  anomalyScanTruncated: bool(),
} as const;

export const AdminReferralNodeSchema = obj(AdminReferralNodeFields);
export type AdminReferralNode = Infer<typeof AdminReferralNodeSchema>;

export const AdminReferralNodesResponseSchema = obj({
  success: bool(),
  data: obj({
    total: num(),
    nodes: arr(AdminReferralNodeSchema),
    pinned: nullable(AdminReferralNodeSchema),
    /** 只在頂層回應出現：「無法接上推薦樹的會員」群組人數（W6-21）。 */
    unplaceableCount: optional(num()),
  }),
});
export type AdminReferralNodesResponse = Infer<typeof AdminReferralNodesResponseSchema>;

export const AdminReferralSearchMatchSchema = obj({
  ...AdminReferralNodeFields,
  /** 由頂層到父；定位不到樹上時為 null。 */
  ancestorIds: nullable(arr(str())),
  unplaceableReason: nullable(literals('cycle', 'truncated')),
});
export type AdminReferralSearchMatch = Infer<typeof AdminReferralSearchMatchSchema>;

export const AdminReferralSearchResponseSchema = obj({
  success: bool(),
  data: obj({ total: num(), matches: arr(AdminReferralSearchMatchSchema) }),
});
export type AdminReferralSearchResponse = Infer<typeof AdminReferralSearchResponseSchema>;

const AdminReferralPersonSchema = obj({
  id: str(),
  name: str(),
  referralCode: nullable(str()),
});

export const AdminReferralMemberAuditSchema = obj({
  node: AdminReferralNodeSchema,
  /** 由近到遠：推薦人、往上第 2 位……最多 50 位。 */
  upline: arr(AdminReferralPersonSchema),
  uplineStatus: literals('root', 'cycle', 'truncated'),
  rewards: obj({
    byGeneration: obj({ g1: num(), g2: num(), g3: num() }),
    available: num(),
    totalEarned: num(),
  }),
  tasks: obj({
    monthKey: str(),
    monthlyCount: num(),
    threshold: nullable(num()),
    creditsUnclaimed: num(),
    creditsClaimed: num(),
  }),
  withdrawals: obj({
    pendingAmount: num(),
    awaitingCollectionAmount: num(),
    completedAmount: num(),
  }),
  referrerHistory: obj({
    /** 曾有過的推薦人（無順序，W6-16）。 */
    pastReferrers: arr(AdminReferralPersonSchema),
    /** 新約付款單事件（新到舊）；只有最新一筆可能 confirmed。 */
    freshEvents: arr(obj({
      completedAt: str(),
      newReferrerId: str(),
      newReferrerName: nullable(str()),
      effective: literals('confirmed', 'unknown'),
    })),
  }),
  /** 推薦人資料兩處不一致（資訊提示，不算異常）。 */
  referrerMismatch: bool(),
  anomalies: arr(AdminReferralAnomalyKindSchema),
  paymentSummary: obj({ missingCount: num(), mismatchCount: num() }),
});
export type AdminReferralMemberAudit = Infer<typeof AdminReferralMemberAuditSchema>;

export const AdminReferralMemberAuditResponseSchema = obj({
  success: bool(),
  data: AdminReferralMemberAuditSchema,
});
export type AdminReferralMemberAuditResponse = Infer<typeof AdminReferralMemberAuditResponseSchema>;

export const ADMIN_REFERRAL_GEN_RESULTS = [
  'paid',
  'missing',
  'recipient_mismatch',
  'not_applicable',
  'cycle_stopped',
  'undeterminable',
] as const;

export const AdminReferralGenerationSchema = obj({
  generation: num(),
  result: literals(...ADMIN_REFERRAL_GEN_RESULTS),
  reason: nullable(literals('no_subscription', 'changed_after', 'referrer_mismatch')),
  expectedId: nullable(str()),
  expectedName: nullable(str()),
  actualId: nullable(str()),
  actualName: nullable(str()),
  actualAmount: nullable(num()),
});
export type AdminReferralGeneration = Infer<typeof AdminReferralGenerationSchema>;

export const AdminReferralPaymentItemSchema = obj({
  kind: literals('payment', 'claim'),
  eventId: str(),
  at: nullable(str()),
  subscriptionId: nullable(str()),
  claimId: nullable(str()),
  generations: arr(AdminReferralGenerationSchema),
});
export type AdminReferralPaymentItem = Infer<typeof AdminReferralPaymentItemSchema>;

export const AdminReferralPaymentsResponseSchema = obj({
  success: bool(),
  data: obj({ total: num(), items: arr(AdminReferralPaymentItemSchema) }),
});
export type AdminReferralPaymentsResponse = Infer<typeof AdminReferralPaymentsResponseSchema>;
