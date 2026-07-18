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
  return schema((v, p) => (typeof v === 'number' && Number.isFinite(v) ? [] : [`${p}: 預期 number，收到 ${typeof v}`]));
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
  id:                     str(),
  name:                   nullable(str()),
  phone:                  nullable(str()),
  birthDate:              nullable(str()),
  nationalId:             nullable(str()),
  bankCode:               nullable(str()),
  bankAccount:            nullable(str()),
  isAdmin:                bool(),
  registrationStep:       num(),
  lastTradeNo:            nullable(str()),
  paidAwaitingActivation: bool(),
  referralCode:           nullable(str()),
  referredByCode:         nullable(str()),
  referralProgramJoined:  bool(),
  referralSignatureUrl:   nullable(str()),
  accountStatus:          literals('active', 'grace', 'expired'),
  subscriptionEndDate:    nullable(str()),
  email:                  optional(str()),
});
export type ProfileResponse = Infer<typeof ProfileResponseSchema>;

export const SubscriptionStatusResponseSchema = obj({
  success: bool(),
  data: obj({
    hasSubscription:    bool(),
    status:             literals('active', 'grace', 'expired'),
    activeUntil:        nullable(str()),
    gracePeriodEnd:     nullable(str()),
    currentPeriodStart: nullable(str()),
    currentPeriodEnd:   nullable(str()),
  }),
});
export type SubscriptionStatusResponse = Infer<typeof SubscriptionStatusResponseSchema>;

export const RewardsSummaryResponseSchema = obj({
  success: bool(),
  data: obj({
    availableRewards:  num(),
    pendingRewards:    num(),
    withdrawnRewards:  num(),
    totalEarned:       num(),
    hasWithdrawnToday: bool(),
  }),
});
export type RewardsSummaryResponse = Infer<typeof RewardsSummaryResponseSchema>;

export const WithdrawalRecordSchema = obj({
  id:          str(),
  userId:      str(),
  amount:      num(),
  fee:         num(),
  status:      literals('pending', 'awaiting_collection', 'completed', 'rejected'),
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
export const RewardHistoryRecordSchema = obj({
  id:          str(),
  type:        str(), // referral_reward | task_monthly_king | withdrawal | adjustment（資料庫值直通）
  amount:      num(),
  description: str(),
  issuedAt:    str(),
  requestedAt: optional(str()),
  generation:  optional(num()),
  balance:     optional(num()),
});
export type RewardHistoryRecord = Infer<typeof RewardHistoryRecordSchema>;

export const RewardHistoryResponseSchema = obj({
  success: bool(),
  data: obj({
    history: arr(RewardHistoryRecordSchema),
    total:   num(),
    limit:   num(),
    offset:  num(),
  }),
});
export type RewardHistoryResponse = Infer<typeof RewardHistoryResponseSchema>;

const ReferralLinkSchema = obj({
  userId:           str(),
  userName:         str(),
  userReferralCode: nullable(str()),
  listingId:        nullable(str()),
  listingName:      nullable(str()),
});

export const ReferralMemberSchema = obj({
  userId:           str(),
  userName:         str(),
  userReferralCode: nullable(str()),
  listingId:        nullable(str()),
  listingName:      nullable(str()),
  serviceType:      nullable(str()),
  city:             nullable(str()),
  activeUntil:      nullable(str()),
  isActive:         bool(),
  referrer:         nullable(ReferralLinkSchema),
  createdAt:        str(),
});
export type ReferralMember = Infer<typeof ReferralMemberSchema>;

export const ReferralTreeResponseSchema = obj({
  success: bool(),
  data: obj({
    userReferralCode: str(),
    referralTree: obj({
      firstGeneration:  arr(ReferralMemberSchema),
      secondGeneration: arr(ReferralMemberSchema),
      thirdGeneration:  arr(ReferralMemberSchema),
    }),
    summary: obj({
      firstGenCount:  num(),
      secondGenCount: num(),
      thirdGenCount:  num(),
      totalReferrals: num(),
    }),
  }),
});
export type ReferralTreeResponse = Infer<typeof ReferralTreeResponseSchema>;

export const TaskSchema = obj({
  id:          str(),
  type:        literals('monthly_king'),
  title:       str(),
  description: str(),
  target:      num(),
  current:     num(),
  completed:   bool(),
  reward:      obj({ type: literals('free_renewal_year'), label: str() }),
  progress:    num(),
  hasUnclaimedReward:   bool(),
  unclaimedRewardCount: num(),
  details: any(),
});
export type Task = Infer<typeof TaskSchema>;

export const TasksResponseSchema = obj({
  success: bool(),
  data: obj({
    tasks:   arr(TaskSchema),
    rawData: any(),
  }),
});
export type TasksResponse = Infer<typeof TasksResponseSchema>;

export const PendingRewardSchema = obj({
  id:          str(),
  type:        literals('monthly_king'),
  rewardType:  literals('free_renewal_year'),
  amount:      num(),
  achievedAt:  str(),
  status:      literals('pending', 'claimed', 'expired'),
  description: str(),
  details:     any(),
});
export type PendingReward = Infer<typeof PendingRewardSchema>;

export const PendingRewardsResponseSchema = obj({
  success: bool(),
  data:    arr(PendingRewardSchema),
});
export type PendingRewardsResponse = Infer<typeof PendingRewardsResponseSchema>;

/**
 * GET /tasks/current-month-top —— 修 #6（查看本月推薦詳情 crash）。
 * 舊回應是排行榜 { month, rankings }（順帶全表掃 + 洩漏所有用戶
 * 姓名/推薦數），前端要的是「自己本月的推薦明細」
 * { month, total, completedCount, currentProgress, referrals }。
 */
export const MonthlyReferralRecordSchema = obj({
  userId:           str(),
  userName:         str(),
  userReferralCode: nullable(str()),
  createdAt:        nullable(str()),
});
export type MonthlyReferralRecord = Infer<typeof MonthlyReferralRecordSchema>;

export const CurrentMonthReferralsResponseSchema = obj({
  success: bool(),
  data: obj({
    month:           str(),
    total:           num(),
    completedCount:  num(),
    currentProgress: num(),
    referrals:       arr(MonthlyReferralRecordSchema),
  }),
});
export type CurrentMonthReferralsResponse = Infer<typeof CurrentMonthReferralsResponseSchema>;

export const ClaimRewardResponseSchema = obj({
  success: bool(),
  data: obj({
    subscriptionId: str(),
    activeUntil:    str(),
    gracePeriodEnd: str(),
  }),
});
export type ClaimRewardResponse = Infer<typeof ClaimRewardResponseSchema>;

export const API_PATHS = {
  profile:               '/profile',
  subscriptionStatus:    '/subscriptions/status',
  rewards:               '/rewards',
  rewardsWithdrawals:    '/rewards/withdrawals',
  rewardsHistory:        '/rewards/history',
  referralsMyTree:       '/referrals/my-tree',
  tasks:                 '/tasks',
  tasksPendingRewards:   '/tasks/pending-rewards',
  tasksCurrentMonthTop:  '/tasks/current-month-top',
  tasksClaimReward:      (id: string) => `/tasks/claim-reward/${id}`,
} as const;
