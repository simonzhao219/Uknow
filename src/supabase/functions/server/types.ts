/**
 * Uknow 系統類型定義
 * 
 * 此文件定義了後端和前端共用的資料結構
 * 遵循新規格：移除身分證字號、一個用戶一個刊登、推薦碼綁定到用戶
 */

// ============================================
// User Types
// ============================================

/**
 * 用戶基本資料
 * ✅ Phase 9: 使用 registrationStep 替代 needsOnboarding
 */
export interface UserProfile {
  id: string;
  publicUserId: string | null;  // 第一次創建刊登時才生成
  email: string;
  name: string;                  // 真實姓名（可修改，需同步到推薦樹）
  phone: string;
  birthDate: string;             // YYYY-MM-DD
  
  // 銀行資訊（提領時填寫）
  bankCode?: string;
  bankAccount?: string;
  
  // 系統欄位
  isAdmin: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  registrationStep: 1 | 2 | 3;   // ✅ 1=基本資訊完成, 2=付款中, 3=註冊完成
  
  // ✅ Phase 9: 推薦系統欄位
  referralCode: string | null;           // 付款後生成的推薦碼
  referredByCode: string | null;         // 註冊時使用的推薦碼
  referredByUserId: string | null;       // 推薦人用戶 ID
  referredByListingId: string | null;    // 推薦人刊登 ID
  
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}

/**
 * 帳號狀態類型
 */
export type AccountStatusType = 'Active' | 'Canceled' | 'Grace' | 'Fail';

/**
 * 用戶帳號狀態（SSOT - Single Source of Truth）
 */
export interface AccountStatus {
  status: AccountStatusType;               // 帳號狀態
  currentSubscriptionId: string | null;    // 當前有效訂閱 ID
  activeReferralCodeId: string | null;     // 當前有效推薦碼 ID
  activeListingId: string | null;          // ✅ 當前有效刊登 ID（唯一）
  // ❌ 移除 pointBalance（違反 SSOT，點數由 user:${userId}:rewards 統一管理）
  lastStatusUpdate: string;                // 最後狀態更新時間
  lastSubscriptionEndDate: string | null;  // 最後訂閱結束日期
  gracePeriodEndDate: string | null;       // 寬限期結束日期（僅 Grace 狀態）
}

// ============================================
// Subscription Types
// ============================================

/**
 * 訂閱狀態類型
 */
export type SubscriptionStatus = 'Active' | 'Canceled' | 'Expired' | 'Grace';

/**
 * 訂閱記錄
 */
export interface Subscription {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  startDate: string;           // 訂閱開始日期
  endDate: string;             // 訂閱結束日期
  gracePeriodEnd: string;      // 寬限期結束日期 (endDate + 60天)
  amount: number;              // 1200
  paymentMethod: string;       // 'newebpay' | 'manual'
  paymentTransactionId: string;
  newebpayTradeNo?: string;    // 藍新金流訂單編號
  isCanceled: boolean;         // 用戶是否手動取消
  canceledAt: string | null;
  isRenewal: boolean;          // 是否為補繳（true = 周期接續）
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Referral Code Types
// ============================================

/**
 * 推薦碼狀態類型
 */
export type ReferralCodeStatus = 'Active' | 'Inactive' | 'Fail';

/**
 * 推薦碼（綁定到 User）
 */
export interface ReferralCode {
  id: string;
  userId: string;              // 所屬用戶
  code: string;                // abc123456 (3小寫英文+6數字)
  status: ReferralCodeStatus;
  // Active: 使用中
  // Inactive: 已被新碼替換（補繳/重新訂閱）
  // Fail: 永久失效（>60天或取消後到期）
  
  isActive: boolean;           // 快速查詢
  activatedAt: string;         // 激活時間（付款成功）
  inactivatedAt: string | null;
  subscriptionId: string;      // 關聯的訂閱 ID
  createdAt: string;
}

// ============================================
// Referral Relationship Types
// ============================================

/**
 * 推薦關係項目
 */
export interface ReferralRelationship {
  userId: string;              // 被推薦人用戶 ID
  referredAt: string;          // 推薦時間
  referralCodeUsed: string;    // 被推薦人使用的推薦碼 ID
}

/**
 * 推薦關係集合（SSOT）
 */
export interface ReferralRelationships {
  generation1: ReferralRelationship[];
  generation2: ReferralRelationship[];
  generation3: ReferralRelationship[];
  lastUpdated: string;
}

/**
 * 推薦樹成員（緩存數據）
 */
export interface ReferralTreeMember {
  userId: string;
  userName: string;            // ⚠️ 緩存，需定期同步
  accountStatus: AccountStatusType;
  referredAt: string;
  activeReferralCodeId: string | null;
}

/**
 * 推薦樹（Cached）
 */
export interface ReferralTree {
  firstGeneration: ReferralTreeMember[];
  secondGeneration: ReferralTreeMember[];
  thirdGeneration: ReferralTreeMember[];
  lastUpdated: string;
}

/**
 * 被推薦來源
 */
export interface ReferredBy {
  referrerUserId: string;
  referralCodeId: string;
  referredAt: string;
}

// ============================================
// Listing Types
// ============================================

/**
 * 聯絡方式類型
 */
export interface ContactMethod {
  platform: 'line' | 'instagram' | 'facebook' | 'telegram' | 'wechat' | 'phone';
  value: string;
}

/**
 * 刊登（簡化為 1:1 關係）
 * ❌ 移除 referralCode, referrerUserId, referrerListingId
 */
export interface Listing {
  id: string;
  userId: string;              // ✅ 所屬用戶（1:1 關係）
  publicListingId: string;     // 公開刊登 ID
  name: string;
  category: string;
  city: string;
  district: string;
  gender: string;
  photos: string[];
  contactMethods: ContactMethod[];
  serviceAreas: string[];
  description: string;
  
  activeUntil: string;         // ✅ 跟隨用戶訂閱狀態
  isActive: boolean;           // ✅ 跟隨用戶帳號狀態
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Reward Types
// ============================================

/**
 * 獎勵歷史項目
 */
export interface RewardHistoryItem {
  id: string;
  type: string;  // "referral_gen1_month1", "referral_gen2_month3", etc.
  amount: number;
  
  // ✅ 被推薦人完整信息
  referee?: {
    userId: string;
    userName: string;
    listingId?: string;
    listingName?: string;
  };
  
  // ✅ 推薦人完整信息（可選，二代/三代有值）
  referrer?: {
    userId: string;
    userName: string;
    listingId?: string;
    listingName?: string;
  };
  
  generation?: number;        // 1, 2, 或 3
  monthNumber?: number;       // 1~12
  issuedAt: string;          // ISO 8601
  description: string;       // "推薦獎勵 - Admin-台北按摩服務（第2代）- 第1個月"
}

/**
 * 獎勵排程
 */
export interface RewardSchedule {
  id: string;
  userId: string;            // 接收獎勵的用戶ID
  
  // ✅ 被推薦人完整信息
  referee: {
    userId: string;
    userName: string;
    listingId?: string;
    listingName?: string;
  };
  
  // ✅ 推薦人完整信息（可選）
  referrer?: {
    userId: string;
    userName: string;
    listingId?: string;
    listingName?: string;
  };
  
  generation: number;
  monthNumber: number;
  amount: number;
  scheduledDate: string;     // "2025-01-15"
  status: string;            // "pending" | "completed" | "cancelled"
  createdAt: string;
  completedAt: string | null;
  cancellationReason?: string;
}

// ============================================
// Task Types
// ============================================

/**
 * 任務進度
 */
export interface TaskProgress {
  consecutiveReferral: {
    count: number;
    lastReferredAt: string | null;
  };
  monthlyKing: {
    monthlyReferrals: {
      [monthKey: string]: Array<{
        userId: string;
        referredAt: string;
      }>;
    };
    totalReferrals: number;
  };
}

// ============================================
// Payment Types
// ============================================

/**
 * 付款訂單
 */
export interface PaymentOrder {
  orderId: string;
  userId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  paymentMethod?: string;
  transactionId?: string;
  createdAt: string;
  completedAt?: string;
}

// ============================================
// API Response Types
// ============================================

/**
 * 標準 API 成功響應
 */
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
}

/**
 * 標準 API 錯誤響應
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
}

/**
 * API 響應類型（聯合類型）
 */
export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;