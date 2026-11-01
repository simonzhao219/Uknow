import type { ReferralInviteAcceptErrorCode } from '@contract';
import { decodeReferralInvitePayload } from '@referral-invite-payload';

// 註冊/登入這條「連續流程」的單一決策來源。
//
// 背景：註冊是一條多步驟流程——
//   建立帳號(未驗證) → Email OTP 驗證 → 完善基本資料 → 付款 → 完成
// 這條流程的每一步若中斷（關掉分頁、重新整理），都必須能「接得回去」，
// 不能變成死巷。過去 AuthPage、OTPVerificationPage 各自維護一份
// 「registrationStep → 下一步該去哪」的 if/else，容易走針、也難測試；
// 而「帳號已建立但 Email 未驗證」這個前置狀態根本不在任何狀態機裡，
// 導致登入時被錯誤地當成「密碼錯誤」而無路可走。
//
// 這個模組把「下一步去哪」與「登入錯誤怎麼分類」收斂成純函式，
// 讓路由決策只有一份、可被單元測試釘死。

/** 註冊流程進度。由後端 effective_registration_step 即時算出（見 migration 0011）。 */
export type RegistrationStep = number | null | undefined;

export interface PostLoginAction {
  /** 登入/驗證成功後應導向的路徑。 */
  route: string;
  /**
   * 是否要把此使用者視為「已通過的登入者」寫入 UserContext。
   * 只有已完成基本資料（step ≥ 1）才設定 user，讓 ProtectedRoute 放行；
   * step 0 的新用戶尚未填資料，先不設 user，交由 CompleteProfile 收尾。
   */
  authenticate: boolean;
  toast?: { message: string; type: 'success' | 'info' };
}

/**
 * registrationStep → 登入後動作的單一決策。
 * AuthPage.handleLogin 與 OTPVerificationPage 都應該用這個，而不是各寫一份。
 *
 * - step 3：註冊完成，進 dashboard 並設定 user。
 * - step 1/2：基本資料已填、待付款/待開通，設定 user 讓路由守衛放行，靜默導向付款。
 * - step 0 / null / 未知：尚未填基本資料，導向完善資料頁（不設 user）。
 */
export function resolvePostLoginAction(step: RegistrationStep): PostLoginAction {
  switch (step) {
    case 3:
      return {
        route: '/dashboard',
        authenticate: true,
        toast: { message: '登入成功！', type: 'success' },
      };
    case 1:
    case 2:
      // 靜默導向：PaymentCheckout 頁面自己會說明，這裡不再彈 toast。
      return { route: '/payment/checkout', authenticate: true };
    case 0:
      return {
        route: '/auth/complete-profile',
        authenticate: false,
        toast: { message: '請完善您的個人資料', type: 'info' },
      };
    default:
      // 未知狀態，保守導向完善資料（與舊行為一致）。
      return {
        route: '/auth/complete-profile',
        authenticate: false,
        toast: { message: '請完善您的個人資料', type: 'info' },
      };
  }
}

/**
 * 純粹「下一步路徑」——OTP 驗證成功後只需要路徑、不需要 setUser 語意時使用。
 */
export function nextRouteForStep(step: RegistrationStep): string {
  return resolvePostLoginAction(step).route;
}

/**
 * 漏斗頁面（CompleteProfile / PaymentCheckout）守衛需要用到的 profile 欄位子集。
 * 刻意只列出決策會讀到的欄位，讓這些純函式與整包 ProfileResponse 解耦、好測試。
 */
export interface FunnelProfile {
  registrationStep?: RegistrationStep;
  name?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  referralCode?: string | null;
  accountStatus?: 'active' | 'expired' | string | null;
  paidAwaitingActivation?: boolean | null;
  lastTradeNo?: string | null;
  subscriptionEndDate?: string | null;
}

/**
 * 註冊完成後身分資料（姓名、身分證字號、生日、手機）與推薦人鎖定，後端拒絕
 * 重填（/auth/register 403、reset-registration 400）。CompleteProfile 的編輯
 * 守衛與 403 出口、PaymentCheckout 的編輯入口共用這一個判準。
 *
 * 後端的判準是「有 completed 訂單」，前端看得到的對應訊號是 step 3；曾有訂閱
 * （subscriptionEndDate，續約者）必然有過完成的付款，補上快取沒帶到進度的情況。
 * 已付款待開通（step 2）不算——開通才鎖定（規格書 §4.1）。
 */
export function isRegistrationLocked(
  profile: Pick<FunnelProfile, 'registrationStep' | 'subscriptionEndDate'>,
): boolean {
  return profile.registrationStep === 3 || !!profile.subscriptionEndDate;
}

/**
 * 基本資料是否已填齊。App.tsx / CompleteProfile / PaymentCheckout 過去各自
 * 寫一份 `!!(name && phone && birthDate)`，語意一旦走針就會互相彈跳。收斂成
 * 一個函式，讓「什麼叫做資料填完」只有一個定義。
 */
export function isProfileComplete(profile: FunnelProfile): boolean {
  return !!(profile.name && profile.phone && profile.birthDate);
}

/**
 * CompleteProfile 頁的守衛：回傳「應該把使用者導去哪」，null = 留在本頁。
 *
 * 關鍵設計——「使用者意圖」是一等公民：
 * 從結帳頁按「編輯」回來的人，資料本來就填齊了。若守衛只看「資料是否存在」
 * 就會把想改資料的人立刻彈回結帳頁（本次修的 bug）。因此當 editing=true 時，
 * 留在本頁（註冊已完成者除外，那時資料已鎖定）；否則才用 registrationStep
 * 這個單一事實來源決定漏斗前進的去向。
 *
 * 第二道防線（與 resolveCheckoutPageRedirect 對稱）：基本資料未填齊就一律留在
 * 本頁，不論後端把 step 算成多少。少了它，一旦 step 漂移到 ≥1（正是空白結帳頁
 * 事故的形狀），這頁會用 step 把空資料使用者導去結帳頁、結帳頁又用
 * isProfileComplete 把他導回這頁，形成 ping-pong。兩頁都以 isProfileComplete
 * 當防線，才能保證「資料沒填齊 → 一定停在填資料頁」這個不變式。
 *
 * 用 nextRouteForStep 而非另寫一份 if/else——與登入後導向共用同一張
 * step→route 對照表，兩邊永遠一致，不會再出現「登入去 A、守衛去 B」的分歧。
 */
export function resolveProfilePageRedirect(
  profile: FunnelProfile,
  opts?: { editing?: boolean },
): string | null {
  // 編輯意圖只在付款前有效：註冊完成後後端一律拒絕寫入（/auth/register 回
  // 403），留在本頁只會讓人填一張送不出去的表單。會走到這裡的是「停在編輯頁
  // 時另一個分頁付完款」或重新整理後沿用舊 history state 的人。資料未填齊者
  // 不在此列——見下方「資料沒填齊 → 一定停在填資料頁」的不變式。
  if (opts?.editing && isRegistrationLocked(profile) && isProfileComplete(profile)) {
    return nextRouteForStep(3);
  }

  // 使用者主動要回來改資料——尊重意圖，不做任何彈跳。
  if (opts?.editing) return null;

  // 基本資料未填齊 → 留在本頁讓他填，不被 step 帶走（見上方 ping-pong 說明）。
  if (!isProfileComplete(profile)) return null;

  const route = nextRouteForStep(profile.registrationStep);
  // 目標就是本頁（step 0 / 未知）→ 留下讓他填資料。
  return route === '/auth/complete-profile' ? null : route;
}

/**
 * PaymentCheckout 頁的守衛：回傳「應該把使用者導去哪」，null = 留在結帳頁。
 *
 * 判斷順序（與 buildProfileResponse 的兩態會籍模型對齊）：
 *   1. 會籍有效（active）→ 已是會員，回會員中心。
 *   2. 已付款、開通中（paidAwaitingActivation + lastTradeNo）→ 結果頁自癒輪詢。
 *   3. 基本資料未填齊（step 0 / 缺值 / 姓名·生日·手機任一為空）→ 回完善資料頁。
 *   4. 其餘（step 1 首購 / step 2 付款失敗重試 / 過期續約）→ 留在結帳頁。
 *
 * 特意「不擋 expired」：失效會籍是「到期後續訂」的正常入口，要留在結帳頁完成
 * 付款，否則會與 dashboard 守衛互彈（見 PaymentCheckout 內原有註解）。
 *
 * 第 3 條除了看 registrationStep，也直接用 isProfileComplete 檢查真實欄位——
 * 這是對「後端把 step 誤算成 ≥1 但資料其實沒填」這一整類 bug 的第二道防線
 * （本次修的空白結帳頁根因）。少了它，只要 step 一旦漂移到 ≥1，結帳頁就會
 * 顯示一張空白的「註冊資訊確認」。與 App.tsx 啟動守衛用同一個 isProfileComplete，
 * 讓「資料是否填齊」在整個前端只有一個定義。
 */
export function resolveCheckoutPageRedirect(profile: FunnelProfile): string | null {
  if (profile.accountStatus === 'active') return '/dashboard';

  if (profile.paidAwaitingActivation && profile.lastTradeNo) {
    return `/payment/result?tradeNo=${profile.lastTradeNo}`;
  }

  if (!profile.registrationStep || !isProfileComplete(profile)) {
    return '/auth/complete-profile';
  }

  return null;
}

export type LoginErrorKind =
  /** 帳號已建立、密碼正確，但 Email 尚未驗證——可復原，應導回 OTP 驗證。 */
  | 'email_not_confirmed'
  /** 帳密真的錯了。 */
  | 'invalid_credentials'
  /** 其他未分類錯誤。 */
  | 'unknown';

/**
 * 把 Supabase signInWithPassword 的錯誤分類。
 *
 * 關鍵：`email_not_confirmed`（未驗證）長得跟一般登入失敗很像，但語意完全不同——
 * 它代表「這是一個沒走完驗證的註冊」，帳號其實是活的，只是被卡住。過去把所有錯誤
 * 一律說成「Email 或密碼錯誤」，正是把可復原狀態顯示成死巷的根因。
 *
 * 同時吃 `code` 與 `message`，因為不同版本的 gotrue / supabase-js
 * 對這些錯誤的欄位命名不一致。
 */
export function classifyLoginError(
  error: { code?: string; message?: string; error_description?: string } | null | undefined,
): LoginErrorKind {
  if (!error) return 'unknown';

  const code = error.code ?? '';
  const text = `${error.message ?? ''} ${error.error_description ?? ''}`;

  if (code === 'email_not_confirmed' || /email\s+not\s+confirmed|not\s+confirmed/i.test(text)) {
    return 'email_not_confirmed';
  }

  if (
    code === 'invalid_credentials' ||
    code === 'invalid_grant' ||
    /invalid[\s_]+(login\s+)?credentials|invalid[\s_]+grant/i.test(text)
  ) {
    return 'invalid_credentials';
  }

  return 'unknown';
}

// ------------------------------------------------------------
// Email 邀請（R2）：從信中連結進入註冊頁中段
// ------------------------------------------------------------

export type InviteEntry = { kind: 'undecodable' } | { kind: 'valid'; email: string; code: string };

/**
 * 邀請連結 token → 入口狀態。只解碼、不驗簽、不看到期時間 `x`：
 * 過期與否由 accept 的回應決定（伺服器時鐘是唯一判準，不以裝置時鐘分流）。
 */
export function resolveInviteEntry(token: string): InviteEntry {
  const payload = decodeReferralInvitePayload(token);
  if (!payload) return { kind: 'undecodable' };
  return { kind: 'valid', email: payload.e, code: payload.c };
}

export interface InviteAcceptErrorAction {
  /** stay2B：留在設定密碼步驟；to2A：轉登入步驟（email 帶入）；toStep1：回輸入 email 步驟。 */
  target: 'stay2B' | 'to2A' | 'toStep1';
  /** 轉登入步驟時是否清空密碼欄（already_accepted：要用先前設定的密碼登入）。 */
  clearPassword: boolean;
}

/**
 * accept 的每個 error code 是否轉登入步驟、是否清密碼。以 Record 綁契約的 code 聯集：
 * 後端新增 code 時這裡 typecheck 就紅，不會靜默落到預設分支。
 */
const INVITE_ACCEPT_ERROR_ROUTES: Record<
  ReferralInviteAcceptErrorCode,
  { leave: boolean; clearPassword: boolean }
> = {
  // 連結本身不能用了：轉登入步驟（email 帶入），已設過密碼的人可直接登入、沒設過的走忘記密碼。
  expired: { leave: true, clearPassword: false },
  invalid_token: { leave: true, clearPassword: false },
  gone: { leave: true, clearPassword: false },
  // 已完成設定：要用先前設定的密碼登入，剛打的這組清掉。
  already_accepted: { leave: true, clearPassword: true },
  // 帳號沒被動到，留在設定密碼步驟可重試。
  weak_password: { leave: false, clearPassword: false },
  rate_limited: { leave: false, clearPassword: false },
  unavailable: { leave: false, clearPassword: false },
  disabled: { leave: false, clearPassword: false },
};

/** accept 失敗的 error code → 下一步。無 code（網路失敗、非 JSON）與未知 code 視為暫時性、留在原步驟。 */
export function classifyInviteAcceptError(
  code: string | undefined,
  hasEmail: boolean,
): InviteAcceptErrorAction {
  const route =
    code && code in INVITE_ACCEPT_ERROR_ROUTES
      ? INVITE_ACCEPT_ERROR_ROUTES[code as ReferralInviteAcceptErrorCode]
      : undefined;
  if (!route?.leave) return { target: 'stay2B', clearPassword: false };
  return { target: hasEmail ? 'to2A' : 'toStep1', clearPassword: route.clearPassword };
}

/**
 * 已登入但基本資料未完成時，是否該被拉去完善資料頁。
 * 完善資料頁本身與重設密碼頁（忘記密碼 → recovery 後要先把密碼設好）豁免。
 */
export function shouldRedirectToCompleteProfile(pathname: string): boolean {
  return pathname !== '/auth/complete-profile' && pathname !== '/auth/reset-password';
}

// ------------------------------------------------------------
// 會籍分類與註冊漏斗（T1 auth-state-trust）
// ------------------------------------------------------------

/** `resolveMembershipRedirect`、`isFirstTimeFunnel` 共用的 profile 欄位子集。 */
export interface GateProfile extends FunnelProfile {
  isAdmin?: boolean | null;
  suspended?: boolean | null;
}

export type MembershipGate = 'admin' | 'active' | 'activating' | 'renew' | 'profile' | 'checkout';

/**
 * 會籍守衛的短路決策表（由上而下，見 RequireMembershipRoute 的決策表註解）。
 * 守衛導向（redirectForGate）與「首購漏斗」判定（isFirstTimeFunnel）共用這一份，
 * 兩者不會各自走針。
 */
export function classifyMembershipGate(p: GateProfile): MembershipGate {
  if (p.isAdmin) return 'admin';
  if (p.accountStatus === 'active') return 'active';
  if (p.paidAwaitingActivation) return 'activating';
  if (p.subscriptionEndDate) return 'renew';
  if ((p.registrationStep ?? 0) === 0 || !isProfileComplete(p)) return 'profile';
  return 'checkout';
}

/**
 * gate → 守衛導向路徑；null = 放行。`resolveMembershipRedirect` 是它的薄包裝——
 * 放在這裡而非守衛元件檔，因為守衛元件 import App，本模組不能反向依賴它。
 */
export function redirectForGate(p: GateProfile, opts?: { allowExpired?: boolean }): string | null {
  switch (classifyMembershipGate(p)) {
    case 'admin':
    case 'active':
      return null;
    // 已付款、後端收斂中 → 開通中頁面輪詢；絕不能把已付款的人送回結帳頁造成重複付款。
    case 'activating':
      return p.lastTradeNo ? `/payment/result?tradeNo=${p.lastTradeNo}` : '/payment/checkout';
    // 曾是會員、已過期 → 直接續約，不重走註冊漏斗。
    case 'renew':
      return opts?.allowExpired ? null : '/payment/checkout';
    case 'profile':
      return '/auth/complete-profile';
    // step 1（資料已填未付款）、或 step 2 但付款失敗 → 去結帳。
    case 'checkout':
      return '/payment/checkout';
  }
}

/**
 * 「註冊中（尚未成為會員）」：從未訂閱過、非 admin、未停權，且還在首購漏斗裡
 * （資料未齊、未付款，或已付款待開通）。頁首只給登出（W2-22、D1＝A）。
 * 曾是會員者（有 subscriptionEndDate）即使正在續約付款也維持頭像。
 */
export function isFirstTimeFunnel(p: GateProfile): boolean {
  if (p.suspended || p.subscriptionEndDate) return false;
  if (p.accountStatus === 'unknown') return false;
  const gate = classifyMembershipGate(p);
  return gate === 'activating' || gate === 'profile' || gate === 'checkout';
}

/** 註冊中的人「下一步」去哪（E4 鈕）；與守衛同一來源。非漏斗者回 null。 */
export function nextFunnelRoute(p: GateProfile): string | null {
  if (!isFirstTimeFunnel(p)) return null;
  if (!isProfileComplete(p)) return '/auth/complete-profile';
  return redirectForGate(p);
}

export type FunnelNextKind = 'profile' | 'checkout' | 'result';

const FUNNEL_NEXT_ROUTES: Record<FunnelNextKind, string> = {
  profile: '/auth/complete-profile',
  checkout: '/payment/checkout',
  result: '/payment/result',
};

/** 下一步路徑 → 目的地種類（存進本機提示，不存 tradeNo）。 */
export function funnelNextKind(route: string | null): FunnelNextKind | null {
  if (!route) return null;
  const path = route.split('?')[0];
  for (const [kind, target] of Object.entries(FUNNEL_NEXT_ROUTES)) {
    if (path === target) return kind as FunnelNextKind;
  }
  return null;
}

/** 提示的目的地種類 → 首繪暫用連結（結果頁不帶 tradeNo，/profile 回來後補上）。 */
export function routeForFunnelNext(next: FunnelNextKind | null): string | null {
  return next ? FUNNEL_NEXT_ROUTES[next] : null;
}

/** E4 鈕文案依**目的地**決定：去結果頁是「查看開通進度」（F2），其餘「繼續完成註冊」。 */
export function funnelCtaLabel(route: string | null): string {
  return funnelNextKind(route) === 'result' ? '查看開通進度' : '繼續完成註冊';
}

/**
 * 漏斗路由：判定前畫中性占位（D5）、漏斗頁首不多放「繼續完成註冊」。完整路徑精確
 * 比對（去結尾斜線），不用前綴。與 shouldRedirectToCompleteProfile 的豁免清單語意
 * 不同，各自獨立。
 */
export const FUNNEL_ROUTES: readonly string[] = [
  '/auth/complete-profile',
  '/auth/verify-otp',
  '/payment/checkout',
  '/payment/result',
];

export function isFunnelRoute(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return FUNNEL_ROUTES.includes(path);
}
