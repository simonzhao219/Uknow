// ============================================================
// Uknow API 契約 SSOT
// ============================================================
//
// 問題背景：前端最初是照「舊版 KV 後端」（src/supabase/functions/server/，
// 現已死碼）的回應格式寫的；新後端（supabase/functions/api/index.ts）
// 改了格式沒人發現——/rewards/history 回 transactions 但前端讀 history
// （永遠空白）、/tasks/current-month-top 回排行榜但前端要個人月推薦
// 明細（dialog crash）。這個檔案讓「兩邊講同一種形狀」變成可以被
// 編譯器與測試檢查的事實，而不是文件裡的約定。
//
// 設計：runtime validator 是 SSOT，TS 型別由它推導（Infer<S>）——
// 這樣同一份定義同時服務三個用途：
//   1. 後端 handler 用 `satisfies XxxResponse` 做編譯期把關
//      （deno task check 涵蓋，因為 index.ts import 這個檔案）。
//   2. 契約測試（api-contract.test.ts）用 assertShape() 在執行期
//      驗證真實回應——編譯期型別攔不住「欄位名稱打錯」這種漂移，
//      這裡才攔得住。
//   3. 前端透過 vite alias `@contract` import 同一份型別，
//      `import.meta.env.DEV` 時可選擇性用 assertShape() 做開發期
//      runtime 檢查。
//
// 零依賴：不可 import `npm:`/`jsr:`——前端 Vite 也要能直接讀這個檔案。
// ============================================================

// ------------------------------------------------------------
// Schema combinator（~80 行）
// ------------------------------------------------------------

export type Schema<T = any> = {
  readonly __type?: T; // phantom，只用於型別推導，執行期不存在
  check(value: unknown, path: string): string[]; // 回傳錯誤訊息列表（空陣列 = 通過）
};

export type Infer<S> = S extends Schema<infer T> ? T : never;

function schema<T>(check: (value: unknown, path: string) => string[]): Schema<T> {
  return { check } as Schema<T>;
}

export function str(): Schema<string> {
  return schema((v, p) => (typeof v === 'string' ? [] : [`${p}: 預期 string，收到 ${typeof v}`]));
}

export function num(): Schema<number> {
  return schema((
    v,
    p,
  ) => (typeof v === 'number' && Number.isFinite(v)
    ? []
    : [`${p}: 預期 number，收到 ${typeof v}`])
  );
}

export function bool(): Schema<boolean> {
  return schema((v, p) => (typeof v === 'boolean' ? [] : [`${p}: 預期 boolean，收到 ${typeof v}`]));
}

/** 允許任意值（用於尚未收斂形狀的欄位，例如 details/rawData） */
export function any(): Schema<any> {
  return schema(() => []);
}

export function literals<T extends string>(...values: T[]): Schema<T> {
  return schema((v, p) =>
    typeof v === 'string' && (values as string[]).includes(v)
      ? []
      : [`${p}: 預期 ${values.map((x) => `'${x}'`).join(' | ')}，收到 ${JSON.stringify(v)}`]
  );
}

export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return schema((v, p) => (v === null ? [] : inner.check(v, p)));
}

export function optional<T>(inner: Schema<T>): Schema<T | undefined> {
  return schema((v, p) => (v === undefined ? [] : inner.check(v, p)));
}

export function arr<T>(inner: Schema<T>): Schema<T[]> {
  return schema((v, p) => {
    if (!Array.isArray(v)) return [`${p}: 預期 array，收到 ${typeof v}`];
    return v.flatMap((item, i) => inner.check(item, `${p}[${i}]`));
  });
}

type ObjShape = Record<string, Schema<any>>;
type InferObj<S extends ObjShape> = { [K in keyof S]: Infer<S[K]> };

export function obj<S extends ObjShape>(shape: S): Schema<InferObj<S>> {
  return schema((v, p) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return [`${p}: 預期 object，收到 ${Array.isArray(v) ? 'array' : typeof v}`];
    }
    const rec = v as Record<string, unknown>;
    return Object.entries(shape).flatMap(([key, s]) => s.check(rec[key], `${p}.${key}`));
  });
}

/** 驗證失敗就 throw，訊息含完整路徑清單；驗證通過回傳原值（narrow 成 T）。 */
export function assertShape<T>(s: Schema<T>, value: unknown, label: string): T {
  const errors = s.check(value, label);
  if (errors.length) {
    throw new Error(`契約驗證失敗（${label}）：\n` + errors.join('\n'));
  }
  return value as T;
}

// ------------------------------------------------------------
// 端點 schemas
// ------------------------------------------------------------

export const ProfileResponseSchema = obj({
  id: str(),
  name: nullable(str()),
  phone: nullable(str()),
  birthDate: nullable(str()),
  // 遮罩值（profile-masking.test.ts）：nationalId 頭 3 尾 3（A12****789）、
  // bankAccount 僅末 4 碼。完整值只存在 DB，比對走 POST /rewards/verify-id。
  nationalId: nullable(str()),
  bankCode: nullable(str()),
  bankAccount: nullable(str()),
  isAdmin: bool(),
  registrationStep: num(),
  lastTradeNo: nullable(str()),
  paidAwaitingActivation: bool(),
  referralCode: nullable(str()),
  referredByCode: nullable(str()),
  // referredByCode 是否由預設推薦人機制自動寫入（profiles.referred_by_is_default）。
  // 前端據此抑制顯示與資料擷取；fresh 換線到真推薦人時後端會重置為 false。
  isAutoReferral: bool(),
  referralProgramJoined: bool(),
  referralSignatureUrl: nullable(str()),
  accountStatus: literals('active', 'expired'),
  subscriptionEndDate: nullable(str()),
  suspended: bool(),
  email: optional(str()),
});
export type ProfileResponse = Infer<typeof ProfileResponseSchema>;

/**
 * 續約資訊（renewal-backfill）：補繳制的結帳頁揭露（A2/A7/A14）與
 * 建單守衛前端對應所需的全部數字。從未訂閱過 = null。
 * hasPaidAnyBackfill 定義：最新一筆訂閱的 end_date < 其對應訂單的
 * completed_at（補繳付款的獨有特徵——付款當下算出的效期已在過去）。
 */
export const RenewalInfoSchema = obj({
  extendAnchorDate: str(), // 'YYYY-MM-DD' 下一筆的起算日
  extendEndDate: str(), // 'YYYY-MM-DD' 下一筆付完的到期日
  backfillCount: num(), // 還要付幾筆才會 active（active 時 0）
  backfillAmount: num(), // backfillCount × 年費
  backfillFinalEndDate: str(), // 補滿後的最終到期日（active 時 = 現到期日）
  expiredForMonths: num(), // 已過期的完整月數（active 時固定 0）
  hasPaidAnyBackfill: bool(),
  // 本輪已付的補繳筆數與金額（A15 二次確認要唸出具體數字）。定義：從最新
  // 訂閱往前走，連續滿足「end_date < 對應訂單 completed_at」的筆數；沒付過
  // 恆為 0（hasPaidAnyBackfill === paidBackfillCount > 0）。
  paidBackfillCount: num(),
  paidBackfillAmount: num(), // paidBackfillCount × 年費
  freshForfeitPoints: num(), // 選 fresh 將作廢的可提領點數（A14 揭露）
  freshForfeitReferrals: num(), // 選 fresh 將歸零的累積推薦人數（A14）
});
export type RenewalInfo = Infer<typeof RenewalInfoSchema>;

/** /payuni/result 的精簡版：PaymentResult 只需判斷補繳中間筆與去路文案。 */
export const PayuniResultRenewalSchema = obj({
  backfillCount: num(),
  backfillAmount: num(),
  extendAnchorDate: str(), // 'YYYY-MM-DD' 下一筆起算日——「已補至」= 它的前一天
  extendEndDate: str(),
});
export type PayuniResultRenewal = Infer<typeof PayuniResultRenewalSchema>;

export const SubscriptionStatusResponseSchema = obj({
  success: bool(),
  data: obj({
    hasSubscription: bool(),
    status: literals('active', 'expired'),
    activeUntil: nullable(str()),
    currentPeriodStart: nullable(str()),
    currentPeriodEnd: nullable(str()),
    renewal: nullable(RenewalInfoSchema),
    // A16 建單守衛的前端對應（是建單條件、不是續約概念，故在頂層）。
    // 只認 status='pending'——不得複用 reward_balances.pending（涵蓋
    // awaiting_collection，集合不同）。
    hasPendingWithdrawal: bool(),
  }),
});
export type SubscriptionStatusResponse = Infer<typeof SubscriptionStatusResponseSchema>;

// 會員身分驗證（member-verify-qr）——與推薦碼分離的另一組。
// 會員自取的短效簽章碼；admin 掃碼解析後回會員身分＋會籍四態。
export const MemberVerifyTokenResponseSchema = obj({
  success: bool(),
  data: obj({
    token: str(),
    expiresAt: str(),
  }),
});
export type MemberVerifyTokenResponse = Infer<typeof MemberVerifyTokenResponseSchema>;

export const MemberVerifyResponseSchema = obj({
  success: bool(),
  data: obj({
    displayName: str(),
    // 會籍四態，與推薦網絡節點狀態同一套（deriveNodeStatus）。
    status: literals('active', 'expiring', 'expired', 'suspended'),
    activeUntil: nullable(str()),
  }),
});
export type MemberVerifyResponse = Infer<typeof MemberVerifyResponseSchema>;

export const RewardsSummaryResponseSchema = obj({
  success: bool(),
  data: obj({
    availableRewards: num(),
    pendingRewards: num(),
    withdrawnRewards: num(),
    totalEarned: num(),
    hasWithdrawnToday: bool(),
  }),
});
export type RewardsSummaryResponse = Infer<typeof RewardsSummaryResponseSchema>;

export const WithdrawalRecordSchema = obj({
  id: str(),
  userId: str(),
  amount: num(),
  fee: num(),
  status: literals('pending', 'awaiting_collection', 'completed', 'rejected'),
  /** 這筆現在的說明，取自 `withdrawal_events` 最新一筆。退件理由靠它到達會員。 */
  note: nullable(str()),
  /** 管理員代為結案（非會員本人查收）。誠實揭露，不讓會員誤以為自己按過。 */
  completedByAdmin: bool(),
  requestedAt: str(),
  processedAt: nullable(str()),
  completedAt: nullable(str()),
});
export type WithdrawalRecord = Infer<typeof WithdrawalRecordSchema>;

export const WithdrawalsResponseSchema = obj({
  success: bool(),
  data: obj({ withdrawals: arr(WithdrawalRecordSchema) }),
});
export type WithdrawalsResponse = Infer<typeof WithdrawalsResponseSchema>;

/**
 * GET /rewards/history —— 修 #4（獎勵明細永遠空白）。
 * 舊回應是 { data: { transactions } }，前端讀 { data: { history, total,
 * limit, offset } }；這裡固定新格式，後端與前端都以此為準。
 */
/**
 * 獎勵明細來源分類（view 衍生欄 source_category，見 migration 0725 0002）。
 * 分辨/篩選點數來源的單一詞彙表，前後端共享：SQL 用 CASE 產出、edge 直通、
 * 前端讀 enum——取代前端切 description 反推分類的舊反模式。
 *
 * 分類軸是「拉新／續約」加「帳本事件」（規格書 §8.4 的語彙），不是冪等鍵：
 *   referral_signup    這位被推薦人第一次替我帶來獎勵（配對視角，非全域首購）
 *   referral_renewal   同一位被推薦人的後續獎勵——付款續約與任務免費續約皆是
 *   withdrawal         點數提領扣款
 *   withdrawal_refund  提領退件退還（adjustment 且綁 withdrawal_id）
 *   adjustment_manual  人工調整（目前無端點產生；有資料才會出現在篩選器）
 *   ledger_reset       新約重置——選 fresh 續約時清空帳本的負額沖銷列
 *
 * 付款續約 vs 任務免費續約的差別沒有消失，改由 RewardHistoryRecord.viaFreeRenewal
 * 承載（明細第二行註記），不再佔一個分類。
 */
export const REWARD_SOURCE_CATEGORIES = [
  'referral_signup',
  'referral_renewal',
  'withdrawal',
  'withdrawal_refund',
  'adjustment_manual',
  'ledger_reset',
] as const;
export const RewardSourceCategorySchema = literals(...REWARD_SOURCE_CATEGORIES);
export type RewardSourceCategory = Infer<typeof RewardSourceCategorySchema>;

/**
 * 分類 facet：這位使用者實際存在的來源分類與筆數（見 SQL function
 * reward_source_facets）。恆為未篩選的全集，篩選器照它渲染——空分類不出現、
 * schema 允許但清單沒列的分類（人工調整）真的出現時自動長出來，
 * 「各分類筆數加總 = 全部」永遠守恆。
 */
export const RewardSourceFacetSchema = obj({
  sourceCategory: RewardSourceCategorySchema,
  count: num(),
});
export type RewardSourceFacet = Infer<typeof RewardSourceFacetSchema>;

export const RewardHistoryRecordSchema = obj({
  id: str(),
  type: str(), // referral_reward | task_monthly_king | withdrawal | adjustment（資料庫值直通）
  // 來源分類（view source_category 衍生欄）：分辨/篩選點數來源的結構化真相，
  // 取代前端切 description 反推分類。見 migration 0725 0001。
  sourceCategory: RewardSourceCategorySchema,
  amount: num(),
  description: str(),
  issuedAt: str(),
  requestedAt: optional(str()),
  generation: optional(num()),
  balance: optional(num()),
  // 推薦獎勵專用：發獎當下的名字快照（見 migration 0719 0001）。
  // refereeName          = 被推薦人（因其訂閱而發此獎）。
  // refereeReferrerName  = 被推薦人的直接推薦人；第 1 代為空（即收獎者本人）。
  // 兩者僅推薦獎勵有值，其餘型別 / 舊資料為 undefined，前端 fallback。
  refereeName: optional(str()),
  refereeReferrerName: optional(str()),
  // 這筆續約獎勵是下線用「推薦王免費續約券」換來的（source_claim_id 非 null）。
  // 分類軸改成拉新／續約後，付款續約與免費續約同屬 referral_renewal；這個旗標
  // 讓明細第二行仍能註記「任務免費續約」，資訊不流失、也不多佔一個篩選分類。
  // 僅該情形為 true，其餘為 undefined。
  viaFreeRenewal: optional(bool()),
});
export type RewardHistoryRecord = Infer<typeof RewardHistoryRecordSchema>;

export const RewardHistoryResponseSchema = obj({
  success: bool(),
  data: obj({
    history: arr(RewardHistoryRecordSchema),
    total: num(),
    limit: num(),
    offset: num(),
    // 未篩選的分類全集（不隨 ?source= 變動）——篩選器的選項來源。
    sources: arr(RewardSourceFacetSchema),
  }),
});
export type RewardHistoryResponse = Infer<typeof RewardHistoryResponseSchema>;

// 推薦網絡節點共通欄位（封頂 3 代）。
// 節點姓名於伺服器端遮罩（二、三代），前端不持有未遮罩資料。
// status 由帳戶兩態（active/expired）+ suspended_at + 距到期天數推導：
//   active｜expiring（active 且 ≤30 天到期）｜expired｜suspended
const ReferralNodeFields = {
  userId: str(),
  name: str(), // 已遮罩（二、三代）
  generation: num(),
  status: literals('active', 'expiring', 'expired', 'suspended'),
  daysToExpiry: nullable(num()), // 僅 active/expiring 有值
  endDate: nullable(str()),
  joinedAt: str(),
  listingId: nullable(str()), // 供「查看刊登」；失效/停權者前端不連
  childCount: num(),
} as const;

const ReferralSummarySchema = obj({
  firstGenCount: num(),
  secondGenCount: num(),
  thirdGenCount: num(),
  totalReferrals: num(),
});

// ------------------------------------------------------------
// 推薦網絡懶載入端點（Tier B）：/referrals/network/*
// 節點改為「扁平」形狀（無 children）——樹由前端依 childCount 懶載入組裝。
// 排序在伺服器（真名 + Intl.Collator zh-Hant），sort 回聲讓前端快取正確。
// 「更新順序」的排序鍵是節點自身的 joinedAt——每一代各自排序，子樹新血
// 不影響上層位置。先前的 subtreeLatestJoinedAt（子樹最新加入時間）已隨
// 該變更失去用途並移除。
// ------------------------------------------------------------
export const NetworkSortModeSchema = literals(
  'updated_desc',
  'updated_asc',
  'name_asc',
  'name_desc',
);
export type NetworkSortMode = Infer<typeof NetworkSortModeSchema>;

/**
 * 預設排序：前後端共用的**單一來源**。
 *
 * 先前這個值在兩個 runtime 共散落四處硬編碼（伺服器 parseSortMode、前端
 * parseSortMode、readStoredSort 的 catch、以及排序晶片「非預設才亮指示點」
 * 的判斷式），改預設時漏掉任何一處都不會有測試或 typecheck 報錯——晶片那處
 * 尤其危險，漏改會讓亮點語意完全反轉且純視覺不報錯。
 */
export const DEFAULT_NETWORK_SORT: NetworkSortMode = 'updated_asc';

export const NetworkNodeSchema = obj(ReferralNodeFields);
export type NetworkNode = Infer<typeof NetworkNodeSchema>;

export const NetworkOverviewResponseSchema = obj({
  success: bool(),
  data: obj({
    userReferralCode: str(),
    sort: NetworkSortModeSchema,
    roots: arr(NetworkNodeSchema), // 一代（排序後；children 走懶載入）
    attention: obj({ // 需要關注：伺服器依緊急度排序 + 上限
      total: num(),
      items: arr(NetworkNodeSchema),
    }),
    summary: ReferralSummarySchema,
  }),
});
export type NetworkOverviewResponse = Infer<typeof NetworkOverviewResponseSchema>;

export const NetworkChildrenResponseSchema = obj({
  success: bool(),
  data: obj({
    parentId: str(),
    sort: NetworkSortModeSchema,
    nodes: arr(NetworkNodeSchema), // parentId 的直接下線（排序後）
  }),
});
export type NetworkChildrenResponse = Infer<typeof NetworkChildrenResponseSchema>;

export const NetworkSearchResponseSchema = obj({
  success: bool(),
  data: obj({
    query: str(),
    sort: NetworkSortModeSchema,
    // total 是「全部命中數」，永遠不受 limit/offset 影響——前端據此顯示
    // 「已顯示 X / Y」與載入更多。搜尋不得靜默截斷：符合條件的都要搜得到。
    total: num(),
    limit: num(), // 本頁大小（回聲；夾在 1..200）
    offset: num(), // 本頁起點（回聲；越界回空頁而非錯誤）
    matches: arr(obj({
      node: NetworkNodeSchema, // 顯示名已遮罩（比對用真名在伺服器）
      ancestorPath: arr(str()), // 一代 → 命中者本身（含）的 userId 序列
    })),
  }),
});
export type NetworkSearchResponse = Infer<typeof NetworkSearchResponseSchema>;

export const TaskSchema = obj({
  id: str(),
  type: literals('monthly_king'),
  title: str(),
  description: str(),
  target: num(),
  current: num(),
  completed: bool(),
  reward: obj({ type: literals('free_renewal_year'), label: str() }),
  progress: num(),
  hasUnclaimedReward: bool(),
  unclaimedRewardCount: num(),
  details: any(),
});
export type Task = Infer<typeof TaskSchema>;

export const TasksResponseSchema = obj({
  success: bool(),
  data: obj({
    tasks: arr(TaskSchema),
    rawData: any(),
  }),
});
export type TasksResponse = Infer<typeof TasksResponseSchema>;

export const PendingRewardSchema = obj({
  id: str(),
  type: literals('monthly_king'),
  rewardType: literals('free_renewal_year'),
  amount: num(),
  achievedAt: str(),
  status: literals('pending', 'claimed', 'expired'),
  description: str(),
  details: any(),
});
export type PendingReward = Infer<typeof PendingRewardSchema>;

export const PendingRewardsResponseSchema = obj({
  success: bool(),
  data: arr(PendingRewardSchema),
});
export type PendingRewardsResponse = Infer<typeof PendingRewardsResponseSchema>;

/**
 * GET /tasks/current-month-top —— 修 #6（查看本月推薦詳情 crash）。
 * 舊回應是排行榜 { month, rankings }（順帶全表掃 + 洩漏所有用戶
 * 姓名/推薦數），前端要的是「自己本月的推薦明細」
 * { month, total, completedCount, currentProgress, referrals }。
 */
export const MonthlyReferralRecordSchema = obj({
  userId: str(),
  userName: str(),
  userReferralCode: nullable(str()),
  createdAt: nullable(str()),
});
export type MonthlyReferralRecord = Infer<typeof MonthlyReferralRecordSchema>;

export const CurrentMonthReferralsResponseSchema = obj({
  success: bool(),
  data: obj({
    month: str(),
    total: num(),
    completedCount: num(),
    currentProgress: num(),
    referrals: arr(MonthlyReferralRecordSchema),
    target: num(), // 推薦王月門檻（reward_config），前端進度以此為準
  }),
});
export type CurrentMonthReferralsResponse = Infer<typeof CurrentMonthReferralsResponseSchema>;

export const ClaimRewardResponseSchema = obj({
  success: bool(),
  data: obj({
    subscriptionId: str(),
    activeUntil: str(),
  }),
});
export type ClaimRewardResponse = Infer<typeof ClaimRewardResponseSchema>;

export const PointsPreviewResponseSchema = obj({
  success: bool(),
  data: obj({
    currentAvailable: num(),
    currentTotal: num(),
    currentPending: num(),
    currentWithdrawn: num(),
  }),
});
export type PointsPreviewResponse = Infer<typeof PointsPreviewResponseSchema>;

// 會員端看自己的證件狀態。`none` = 還沒交齊雙面。
export const IdVerificationStatusSchema = literals('none', 'pending', 'approved', 'rejected');
export type IdVerificationStatus = Infer<typeof IdVerificationStatusSchema>;

export const IdPhotosResponseSchema = obj({
  success: bool(),
  data: obj({
    frontUrl: nullable(str()),
    backUrl: nullable(str()),
    verificationStatus: IdVerificationStatusSchema,
    // 退回理由必須到得了會員面前——看不到理由就只會重送一模一樣的照片。
    rejectReason: nullable(str()),
  }),
});
export type IdPhotosResponse = Infer<typeof IdPhotosResponseSchema>;

export const WithdrawResponseSchema = obj({
  success: bool(),
  data: obj({
    withdrawalId: str(),
    status: literals('pending'),
    amount: num(),
    fee: num(),
    requestedAt: str(),
  }),
});
export type WithdrawResponse = Infer<typeof WithdrawResponseSchema>;

export const ConfirmCollectionResponseSchema = obj({
  success: bool(),
  data: obj({
    withdrawalId: str(),
    status: literals('completed'),
    completedAt: nullable(str()),
  }),
});
export type ConfirmCollectionResponse = Infer<typeof ConfirmCollectionResponseSchema>;

export const AnnouncementSchema = obj({
  id: str(),
  title: str(),
  message: str(),
  type: literals('info', 'warning', 'error'),
  startsAt: str(),
  endsAt: nullable(str()),
});
export type Announcement = Infer<typeof AnnouncementSchema>;

export const ActiveAnnouncementsResponseSchema = obj({
  success: bool(),
  data: obj({ announcements: arr(AnnouncementSchema) }),
});
export type ActiveAnnouncementsResponse = Infer<typeof ActiveAnnouncementsResponseSchema>;

// GET /admin/system-alerts（SystemAlerts tab）。欄位沿用 DB snake_case
// ——這是內部維運資料，不做前端命名轉換。context 為任意 jsonb 物件。
export const SystemAlertSchema = obj({
  id: str(),
  source: str(),
  severity: literals('info', 'warning', 'error'),
  message: str(),
  context: obj({}),
  created_at: str(),
  resolved_at: nullable(str()),
});

export const SystemAlertsResponseSchema = obj({
  success: bool(),
  data: obj({
    alerts: arr(SystemAlertSchema),
    total: num(),
  }),
});

export type SystemAlert = Infer<typeof SystemAlertSchema>;
export type SystemAlertsResponse = Infer<typeof SystemAlertsResponseSchema>;

// 提領狀態轉換的一筆歷史（withdrawal_events）。
// `byAdmin: false` = 會員自己的查收確認——只回類別，不外洩是哪個 admin。
export const WithdrawalEventSchema = obj({
  fromStatus: str(),
  toStatus: str(),
  note: nullable(str()),
  bankRef: nullable(str()),
  transferredOn: nullable(str()),
  byAdmin: bool(),
  createdAt: str(),
});
export type WithdrawalEvent = Infer<typeof WithdrawalEventSchema>;

// 待匯款總額用 amount（銀行實付）而非 amount + fee——手續費是平台收的，
// 不會匯出去。admin 拿這個數字去對網銀的轉出總額。
export const AdminWithdrawalStatsSchema = obj({
  pendingAmount: num(),
  byStatus: obj({
    pending: num(),
    awaiting_collection: num(),
    completed: num(),
    rejected: num(),
  }),
});
export type AdminWithdrawalStats = Infer<typeof AdminWithdrawalStatsSchema>;

/** 入口 badge 用的輕量彙總。刻意不含列表——帶了就等於把整頁記錄搬到導覽列。 */
export const AdminWithdrawalSummaryResponseSchema = obj({
  success: bool(),
  data: obj({ pendingCount: num(), pendingAmount: num() }),
});
export type AdminWithdrawalSummaryResponse = Infer<typeof AdminWithdrawalSummaryResponseSchema>;

export const AdminWithdrawalRecordSchema = obj({
  id: str(),
  userId: str(),
  userName: str(),
  userPhone: nullable(str()),
  idNumber: nullable(str()),
  amount: num(),
  fee: num(),
  status: literals('pending', 'awaiting_collection', 'completed', 'rejected'),
  bankCode: nullable(str()),
  bankAccount: nullable(str()),
  // 主表的 note 自 20260802000004 起 vestigial；這個值取自事件表最新一筆。
  note: nullable(str()),
  events: arr(WithdrawalEventSchema),
  requestedAt: str(),
  processedAt: nullable(str()),
  completedAt: nullable(str()),
  idCardFrontUrl: nullable(str()),
  idCardBackUrl: nullable(str()),
});
export type AdminWithdrawalRecord = Infer<typeof AdminWithdrawalRecordSchema>;

export const AdminWithdrawalsResponseSchema = obj({
  success: bool(),
  data: obj({
    withdrawals: arr(AdminWithdrawalRecordSchema),
    total: num(),
    limit: num(),
    offset: num(),
    stats: AdminWithdrawalStatsSchema,
  }),
});
export type AdminWithdrawalsResponse = Infer<typeof AdminWithdrawalsResponseSchema>;

export const AdminMemberSchema = obj({
  id: str(),
  name: nullable(str()),
  email: str(),
  phone: nullable(str()),
  isAdmin: bool(),
  suspended: bool(),
  suspendedAt: nullable(str()),
  accountStatus: literals('active', 'expired'),
  /** 會籍到期日；從未付費者為 null。 */
  endDate: nullable(str()),
  idVerificationStatus: IdVerificationStatusSchema,
  listingCount: num(),
  createdAt: str(),
});
export type AdminMember = Infer<typeof AdminMemberSchema>;

/**
 * 會員列表的統計卡數字。
 *
 * **全站，不是當前頁。** 在 SQL 的 filtered CTE 上算完再回來，`limit` 只作用
 * 在 members 陣列——前端拿到後直接顯示，不得從 `members` 加總（那樣算出來的
 * 數字會隨分頁改變，等於一組會說謊的統計卡）。
 */
export const AdminMemberStatsSchema = obj({
  total: num(),
  active: num(),
  expired: num(),
  suspended: num(),
  admins: num(),
});
export type AdminMemberStats = Infer<typeof AdminMemberStatsSchema>;

export const AdminMembersResponseSchema = obj({
  success: bool(),
  data: obj({
    members: arr(AdminMemberSchema),
    total: num(),
    stats: AdminMemberStatsSchema,
  }),
});

/**
 * 詳情面板裡的一筆提領記錄。
 *
 * §1.1 的頭號客服情境是「我提領怎麼還沒到」——這幾個欄位就是那句話的答案，
 * 不是附加資訊。`note` 讀該筆事件表最新一筆，與 `/admin/withdrawals` 同源。
 */
export const AdminMemberWithdrawalSchema = obj({
  id: str(),
  amount: num(),
  fee: num(),
  status: literals('pending', 'awaiting_collection', 'completed', 'rejected'),
  note: nullable(str()),
  requestedAt: str(),
  processedAt: nullable(str()),
  completedAt: nullable(str()),
});
export type AdminMemberWithdrawal = Infer<typeof AdminMemberWithdrawalSchema>;

/**
 * 會員詳情。
 *
 * **`idNumber` 與 `bankAccount` 是遮罩值**（需求方裁決）。需要全碼時回提領
 * 作業台看——那裡因匯款作業需要而維持完整值。`bankCode` 不遮：它識別的是
 * 銀行不是個人，遮了反而讓客服對不出是哪一家。
 */
export const AdminMemberDetailSchema = obj({
  id: str(),
  name: nullable(str()),
  email: str(),
  phone: nullable(str()),
  isAdmin: bool(),
  suspended: bool(),
  suspendedAt: nullable(str()),
  createdAt: str(),
  accountStatus: literals('active', 'expired'),
  endDate: nullable(str()),
  idVerificationStatus: IdVerificationStatusSchema,
  idRejectReason: nullable(str()),
  /** 遮罩值（`A1****789`）。 */
  idNumber: nullable(str()),
  bankCode: nullable(str()),
  /** 遮罩值（末四碼可見）。 */
  bankAccount: nullable(str()),
  referrerName: nullable(str()),
  directChildCount: num(),
  listingCount: num(),
  availablePoints: num(),
  pendingPoints: num(),
  withdrawnPoints: num(),
  recentWithdrawals: arr(AdminMemberWithdrawalSchema),
});
export type AdminMemberDetail = Infer<typeof AdminMemberDetailSchema>;

export const AdminMemberDetailResponseSchema = obj({
  success: bool(),
  data: obj({ member: AdminMemberDetailSchema }),
});
export type AdminMemberDetailResponse = Infer<typeof AdminMemberDetailResponseSchema>;
export type AdminMembersResponse = Infer<typeof AdminMembersResponseSchema>;

// 證件審核佇列。`none`（照片沒交齊）不會出現在佇列裡，所以列舉不含它。
export const AdminIdReviewSchema = obj({
  userId: str(),
  name: nullable(str()),
  email: str(),
  phone: nullable(str()),
  status: literals('pending', 'approved', 'rejected'),
  rejectReason: nullable(str()),
  reviewedAt: nullable(str()),
  /** 送審時間。佇列依它排「等最久的」——`createdAt` 是註冊時間，講的是另一件事。 */
  submittedAt: str(),
  createdAt: str(),
  idCardFrontUrl: nullable(str()),
  idCardBackUrl: nullable(str()),
});
export type AdminIdReview = Infer<typeof AdminIdReviewSchema>;

export const AdminIdReviewsResponseSchema = obj({
  success: bool(),
  data: obj({ reviews: arr(AdminIdReviewSchema), total: num() }),
});
export type AdminIdReviewsResponse = Infer<typeof AdminIdReviewsResponseSchema>;

export const API_PATHS = {
  profile: '/profile',
  subscriptionStatus: '/subscriptions/status',
  rewards: '/rewards',
  rewardsWithdrawals: '/rewards/withdrawals',
  rewardsHistory: '/rewards/history',
  networkOverview: '/referrals/network/overview',
  networkChildren: '/referrals/network/children',
  networkSearch: '/referrals/network/search',
  tasks: '/tasks',
  tasksPendingRewards: '/tasks/pending-rewards',
  tasksCurrentMonthTop: '/tasks/current-month-top',
  tasksClaimReward: (id: string) => `/tasks/claim-reward/${id}`,
} as const;
