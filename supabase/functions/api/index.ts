// ============================================================
// Uknow API Edge Function
// 取代舊 make-server-5c6718b9，使用新的正規化 schema
// ============================================================
import { Hono } from 'npm:hono@4';
import { cors } from 'npm:hono@4/cors';
import { etag, RETAINED_304_HEADERS } from 'npm:hono@4/etag';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { decryptPayUni, encryptPayUni, generatePayUniHash } from './crypto.ts';
import {
  signMemberToken,
  verifyMemberToken,
  type VerifyMemberTokenResult,
} from './member-token.ts';
import {
  backfillPlan,
  twCompactTimestamp,
  twDayOf,
  twDayPlusDays,
  twMonthKey,
} from './tw-dates.ts';
import { DEFAULT_NETWORK_SORT } from '../_shared/api-contract.ts';
import type {
  CurrentMonthReferralsResponse,
  MemberVerifyResponse,
  MemberVerifyTokenResponse,
  NetworkChildrenResponse,
  NetworkNode,
  NetworkOverviewResponse,
  NetworkSearchResponse,
  NetworkSortMode,
  PayuniResultRenewal,
  RewardHistoryResponse,
} from '../_shared/api-contract.ts';

// Supabase 將函數名稱（/api）保留在傳給函數的路徑中，
// 因此所有路由需掛在 /api basePath 下，否則一律 404。
// export 供測試以 app.request() 直接打路由（import.meta.main 已防止測試時啟動 server）。
export const app = new Hono().basePath('/api');

// ============================================================
// CORS
// ============================================================
/** 是不是本專案 Cloudflare Pages 專案底下的網域（含各 branch / commit 預覽別名）。 */
function isPagesPreviewHost(host: string): boolean {
  // 以解析後的 hostname 精確比對，避免 uknow.pages.dev.attacker.com（後綴）
  // 與 evil-uknow.pages.dev（前綴）這兩類繞過。
  return host === 'uknow.pages.dev' || host.endsWith('.uknow.pages.dev');
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * 決定一個 Origin 能不能拿到 CORS 放行——純函式，好在 CI 用不同的環境組合
 * 單元測試（同 resolvePayuniConfig 的理由：真正決定安全性的分支，不能只靠
 * 「線上看起來能用」來驗）。
 *
 * 規則有三條，順序即優先序：
 *   1. 與本部署的 FRONTEND_URL 完全相同 → 放行。這是每個環境的正身。
 *   2. `*.uknow.pages.dev` 預覽網域 → **只有當本部署自己就是預覽環境時**才放行。
 *   3. localhost → 只在明確的開發旗標下放行（DEV_CORS / PayUni sandbox）。
 *
 * 第 2 條的「自己也是預覽環境」是 2026-07 收緊的重點。原本這條是無條件放行，
 * 理由是「預覽站跑的是 production edge function，不放行會被擋成 Failed to
 * fetch」——但那個前提在前端改成分支感知之後就不成立了：現在非 main 分支的
 * 預覽一律打 develop 分支 DB，需要放行預覽網域的是 develop 那個部署，不是
 * 正式站。留著等於讓「預覽站誤打正式站」這個**應該要爆炸的錯誤**靜默地成功，
 * 而它正是環境沒分乾淨時最難察覺的一種。
 *
 * 判準取自 FRONTEND_URL 本身而不是另開一個旗標：那個值每個環境本來就必須
 * 正確（付款完成導回頁靠它），多一個旗標就多一個會與它不一致的東西。
 * develop 的 FRONTEND_URL 是 https://develop.uknow.pages.dev（預覽網域）→
 * 放行手足預覽；正式站是 https://uknow.com.tw → 只認自己。
 */
export function resolveCorsOrigin(
  origin: string,
  read: (key: string) => string | undefined,
): string {
  // 去掉結尾斜線再比對：瀏覽器 Origin 不帶斜線，但 FRONTEND_URL 可能被填成帶斜線
  const allowed = (read('FRONTEND_URL') || '').replace(/\/$/, '');
  const o = origin.replace(/\/$/, '');
  if (allowed && o === allowed) return origin;

  const host = hostnameOf(o);
  if (host === null) return ''; // 非法 Origin → 拒絕

  const selfHost = hostnameOf(allowed);
  if (selfHost && isPagesPreviewHost(selfHost) && isPagesPreviewHost(host)) return origin;

  const devMode = read('DEV_CORS') === 'true' || read('PAYUNI_SANDBOX') === 'true';
  if (devMode && (host === 'localhost' || host === '127.0.0.1')) return origin;

  return '';
}

app.use(
  '*',
  cors({
    origin: (origin) => resolveCorsOrigin(origin, (key) => Deno.env.get(key)),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // If-None-Match：搭配讀端點的 ETag 條件請求（見下方 etag middleware）
    allowHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
    exposeHeaders: ['ETag'],
    // preflight 快取 2 小時：每個帶 Authorization 的請求本來都要多付一次
    // OPTIONS round-trip，這是整條 API 路徑上最大的單項頻寬/延遲節省。
    maxAge: 7200,
    credentials: true,
  }),
);

// ============================================================
// 讀端點的條件請求（stale-while-revalidate 的頻寬優化）
//
// 前端改為「每次進頁都背景 revalidate」之後，多數 revalidate 的回應
// 其實跟上次一模一樣。掛 etag middleware + Cache-Control: private,
// no-cache 後，瀏覽器會自動帶 If-None-Match，內容沒變就回 304 空
// body——確認新鮮度的成本從整包 JSON 降到幾乎為零，前端程式碼零改動
// （fetch 對 304 透明地回快取內容）。
// 前提：回應內容必須是決定性的（同樣的資料 → 同樣的 body），所以
// /rewards 移除了無人使用的 lastUpdated=new Date() 欄位。
// ============================================================
const READ_PATHS = [
  '/subscriptions/status',
  '/rewards',
  '/rewards/*',
  '/referrals/network/*',
  '/tasks',
  '/tasks/*',
  '/announcements/active',
] as const;
// 304 也必須帶 CORS 標頭：hono/etag 預設只保留 RETAINED_304_HEADERS，
// 會把 Access-Control-Allow-Origin 從 304 剝掉。瀏覽器 HTTP 快取按 URL
// 共用（*.uknow.pages.dev 各預覽網域同屬一個 site partition），舊部署存下
// 的快取條目可能帶著「別的預覽網域」的 ACAO——revalidate 拿到的 304 若沒有
// 新 ACAO，瀏覽器就沿用快取裡的舊值，CORS 檢查直接失敗（症狀：preview 登入
// 後所有讀端點被擋，錯誤訊息指著另一個 pages.dev 網域）。304 帶上本次請求
// 算出的 CORS 標頭後，規範要求瀏覽器用 304 的標頭更新快取條目——等於順手
// 把中毒的快取治好。
const CORS_304_HEADERS = [
  ...RETAINED_304_HEADERS,
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-expose-headers',
];
for (const p of READ_PATHS) {
  app.use(p, etag({ retainedHeaders: CORS_304_HEADERS }));
  app.use(p, async (c, next) => {
    await next();
    if (c.req.method === 'GET') {
      c.header('Cache-Control', 'private, no-cache');
      c.header('Vary', 'Authorization');
    }
  });
}

// ============================================================
// 工具：建立 service_role Supabase 客戶端
// ============================================================
function sb() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ============================================================
// 獎勵可變常數單一真相：讀 reward_config（見 migration 0719 0002）。
// 推薦王門檻 8 以前散在 SQL 函數、這裡、前端三處；現在 SQL 函數與這裡都
// 讀同一張表，前端再由 task payload 拿到 target，不再各自硬編。讀不到就
// fallback 回現值，永不因設定缺失而算錯進度。
// ============================================================
async function getRewardConfig(
  client: any,
): Promise<{ referralRewardAmount: number; referralKingThreshold: number }> {
  const { data } = await client
    .from('reward_config')
    .select('referral_reward_amount, referral_king_monthly_threshold')
    .eq('id', true)
    .maybeSingle();
  return {
    referralRewardAmount: data?.referral_reward_amount ?? 100,
    referralKingThreshold: data?.referral_king_monthly_threshold ?? 8,
  };
}

// ============================================================
// 工具：是否有審核中（pending）的提領。A16 的 fresh 建單守衛與
// /subscriptions/status 的 hasPendingWithdrawal 共用這一份（單一真相）。
// ⚠️ 不得複用 reward_balances.pending——該欄位涵蓋 awaiting_collection，
// 集合不同（只有 pending 可能被退件、退款落回帳本）。
// ============================================================
async function hasPendingWithdrawal(userId: string): Promise<boolean> {
  const { data } = await sb()
    .from('withdrawals')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ============================================================
// 工具：從 Authorization header 取得已驗證 user
// ============================================================
async function requireAuth(c: any): Promise<{ id: string; email?: string } | null> {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await sb().auth.getUser(token);
  return error || !user ? null : user;
}

// ============================================================
// 工具：管理員判斷（所有 /admin/** 路由的統一守門）
// ============================================================
async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await sb().from('profiles').select('is_admin').eq('id', userId).single();
  return !!data?.is_admin;
}

// ============================================================
// 工具：身分證字號驗證——提領申請/查收確認/領獎/敏感操作共用。
// 比對 profiles.national_id（不分大小寫、去空白）。
// ============================================================
async function verifyNationalId(client: any, userId: string, idNumber: string): Promise<boolean> {
  const { data } = await client.from('profiles').select('national_id').eq('id', userId).single();
  const input = (idNumber ?? '').trim().toUpperCase();
  return !!data?.national_id && input === data.national_id.trim().toUpperCase();
}

// ============================================================
// 工具：敏感欄位遮罩。GET /profile 不回傳完整身分證字號/銀行帳號——
// 持有 access token 的一方不應能拿到完整值，否則「敏感操作需輸入
// 身分證驗證」（verify-id / 提領 / 領獎）形同虛設。完整值只存在 DB，
// 比對一律走伺服器端（verifyNationalId）。管理員匯款作業所需的完整
// 值仍由 GET /admin/withdrawals 提供（admin 守門 + 匯款必要）。
// ============================================================
function maskNationalId(id: string | null | undefined): string | null {
  if (!id) return null;
  const v = id.trim();
  if (v.length <= 6) return '*'.repeat(v.length);
  return v.slice(0, 3) + '*'.repeat(v.length - 6) + v.slice(-3);
}

function maskBankAccount(acct: string | null | undefined): string | null {
  if (!acct) return null;
  const v = acct.trim();
  return '*'.repeat(Math.max(v.length - 4, 0)) + v.slice(-4);
}

// ============================================================
// 工具：漢字偵測範圍與姓名格式驗證。
//
// 漢字偵測範圍：U+3400–U+9FFF（統一表意文字＋擴充A）＋ U+F900–U+FAFF（相容表意文字）。
// 必須用 \u 跳脫寫死：字面「豈」(U+F900) 曾被編輯器 NFC 正規化成同形的 U+8C48，
// 範圍尾端因此悄悄涵蓋全部 surrogate——單一 emoji 姓名會被誤判為 CJK、
// 走進 '○'.repeat(-1) 直接把端點打成 500（對抗審查抓到的位元組級事故）。
//
// 這三個常數原本放在推薦網絡段（緊鄰 maskNameByGen），現在被姓名格式驗證與
// 遮罩兩處共用，故搬到共用工具段——「被多處共用」的常數放在共用段才名副其實。
// 前端 src/utils/profileValidation.ts 有一份逐字複製（兩個 runtime 隔離、
// 無法共用常數），改動這裡務必同步那裡，且兩側跑同一份
// _shared/name-validation-cases.ts 的案例表。
// ============================================================
const HAN_RANGE = '\\u3400-\\u9FFF\\uF900-\\uFAFF';
const HAS_HAN = new RegExp(`[${HAN_RANGE}]`);
const HAN_LEAD = new RegExp(`^[${HAN_RANGE}]`);

// 中文姓名：字元全為漢字，且「恰好 0 或 1 個半形空格；有空格時兩邊各至少 2 字」。
const ZH_NAME = new RegExp(`^(?:[${HAN_RANGE}]+|[${HAN_RANGE}]{2,} [${HAN_RANGE}]{2,})$`);
// 外文姓名：僅英文字母，單字間單一半形空格，每個單字首字母大寫（其餘大小寫不限）。
const FOREIGN_NAME = /^[A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*$/;
// 分隔符號類標點：Unicode 的**標點**(\p{P})與**分隔符**(\p{Z})兩大類，
// 半形空格本身除外（它是合法的姓名分隔）。
// 刻意不列舉碼點——只鎖三個間隔號會讓 bullet、半形中點、全形空格等變體漏網。
// 但也不能用「非漢字非英數非空格」反向定義：那會把 HAN_RANGE 之外的漢字
// （擴充 B 區以上、造字區，即戶政「缺字」問題）一併當標點，給出文不對題的
// 「請改用半形空格分隔」。缺字姓名該走的是下方那句罕用字客服出口。
const SEPARATOR_LIKE = new RegExp('(?=[\\p{P}\\p{Z}])[^ ]', 'u');

// 後端的姓名格式規則是**聯集**：合乎中文規則或外文規則即通過。
// 前端依切換鈕狀態嚴格把關（中文模式拒 `Peter`），後端不能——它只收到姓名
// 字串，就算前端多送一個模式旗標，攻擊者也只要宣稱自己是外文模式即可繞過，
// 旗標沒有安全價值。兩者職責不同：後端是安全邊界（擋任何模式都不合法的值），
// 前端是 UX 引導（讓「預設你該填中文」有強制力、錯誤訊息對得上當下模式）。
const NAME_MAX_LENGTH = 50;

export function validateNameFormat(name: unknown): string | undefined {
  // 型別防禦:`PUT /auth/profile` 的觸發條件是 `'name' in body`,只檢查鍵存在、
  // 不檢查型別,所以這裡可能收到 null/數字/物件。一律回「格式不符」而**不拋錯**
  // ——HAN_RANGE 上方註解記載的正是「未防禦邊界輸入把端點打成 500」的事故。
  if (typeof name !== 'string') return '姓名格式不正確';
  if (!name.trim()) return '請填寫姓名';

  // 分隔符號優先判定,訊息要能行動:原住民漢字音譯姓名與新住民歸化漢名在
  // 身分證上帶間隔號,不放行就得讓對方知道改用半形空格,否則等於沒放行。
  if (SEPARATOR_LIKE.test(name)) {
    return '姓名不可含標點符號，請改用半形空格分隔（例：谷辣斯 尤達卡）';
  }

  // 聯集:合乎中文規則**或**外文規則即通過。
  if (!ZH_NAME.test(name) && !FOREIGN_NAME.test(name)) {
    // 缺字的逃生口（與前端 validateName 同一條規則）:HAN_RANGE 不含擴充 B 區
    // 以上與造字區。那些字元既非拉丁字母也非數字，拿「須為中文字」回應一個
    // 明明在打中文的人是誤導；用「不含拉丁字母也不含數字」偵測缺字的形狀。
    if (!/[A-Za-z0-9]/.test(name)) {
      return '此姓名可能含系統未支援的罕用字，請聯繫客服協助';
    }
    return '姓名須為中文字，或首字母大寫的英文（例：王小明、John Smith）';
  }

  // 字元合法之後才談長度——否則會拿「須為中文字」去回應一個全是合法中文字、
  // 只是太長的輸入。
  if ([...name].length > NAME_MAX_LENGTH) return `姓名最多 ${NAME_MAX_LENGTH} 個字元`;

  return undefined;
}

// ============================================================
// 工具：組建 profile 回應（供多個路由共用）
// ============================================================
export async function buildProfileResponse(
  client: any,
  userId: string,
  email?: string,
  alreadyHealed = false,
) {
  const [
    { data: profile },
    { data: acct },
    { data: code },
    { data: pendingOrders },
    { data: step },
  ] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).single(),
    client.from('user_account_status').select('status, end_date').eq('user_id', userId).single(),
    client.from('referral_codes').select('code').eq('user_id', userId).eq('status', 'active')
      .maybeSingle(),
    // 抓多筆 pending：卡單使用者可能又重試了一次付款，最新那筆 pending
    // 沒有 payuni_response，但更早那筆已存了 SUCCESS——判斷「已付款待
    // 開通」必須看得到全部 pending，不能只看最新一筆。
    client.from('payment_orders').select('transaction_id, payuniStatus:payuni_response->>Status')
      .eq('user_id', userId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(10),
    client.rpc('effective_registration_step', { p_user_id: userId }),
  ]);

  if (!profile) return null;

  // registrationStep 由 payment_orders 即時算出（見 migration 0011），
  // 不再信任 profiles.registration_step 這個手動維護的欄位。
  const registrationStep = step ?? 1;

  // 已付款待開通：任一 pending 訂單上已存有 PayUni 的 SUCCESS 回應
  // （persistRawResponseBestEffort 在內部處理失敗時寫入的復原資料來源，
  // 見 migration 0007）。前端守衛靠這個旗標把「付了錢等開通」跟
  // 「還沒付錢」區分開，不會把已付款的人送回結帳頁造成重複付款。
  const paidOrder = (pendingOrders ?? []).find((o: any) => o.payuniStatus === 'SUCCESS');
  let paidAwaitingActivation = !!paidOrder;

  // 自癒：PayUni 已說 SUCCESS 但訂單還卡在 pending → 立刻補完，並有界
  // 重入一次重算整份 profile——使用者這一次載入就直接拿到 step 3 +
  // active，不需要再重新整理。特意 await（isolate 終止問題，同下方
  // repair 的註解）；補不完（例如金額不符待人工）就維持旗標讓前端顯示
  // 「開通處理中」。
  if (registrationStep === 2 && paidAwaitingActivation && !alreadyHealed) {
    const healed = await healPaidPendingOrdersBestEffort(userId);
    if (healed) return buildProfileResponse(client, userId, email, true);
  }

  // 機會性補跑：已付款完成的使用者每次讀自己 profile 時，順便確認
  // 推薦碼/獎勵/任務進度有沒有缺（見 repair_orphaned_payments）。
  // best-effort（內部已吞掉所有錯誤，不影響這次回應的成功與否）；
  // 特意 await 而不是 fire-and-forget——Edge Function 執行環境可能在
  // response 回傳後就終止這個 isolate，沒 await 完成的背景工作不保證
  // 會真的跑完。對已經修復好的使用者，repair 內部的偵測查詢應該找不到
  // 任何候選、開銷很小。
  if (registrationStep === 3) {
    await repairOrphanedPaymentsBestEffort(userId);
    paidAwaitingActivation = false;
  }

  return {
    id: profile.id,
    name: profile.name,
    phone: profile.phone,
    birthDate: profile.birth_date,
    nationalId: maskNationalId(profile.national_id),
    bankCode: profile.bank_code,
    bankAccount: maskBankAccount(profile.bank_account),
    isAdmin: profile.is_admin,
    registrationStep,
    // 待開通時優先指向「已付款成功」的那筆訂單，讓前端守衛導去的
    // 結果頁顯示正確的訂單；否則維持最新一筆 pending 的舊語意。
    lastTradeNo: registrationStep === 2
      ? (paidOrder?.transaction_id ?? pendingOrders?.[0]?.transaction_id ?? null)
      : null,
    paidAwaitingActivation,
    referralCode: code?.code ?? null,
    referredByCode: profile.referred_by_code,
    // 自動綁定旗標：前端據此抑制預設推薦人的顯示與資料擷取
    // （PaymentCheckout 確認卡 + fetchReferrerInfo 早退）。
    isAutoReferral: !!profile.referred_by_is_default,
    referralProgramJoined: profile.referral_program_joined,
    referralSignatureUrl: profile.referral_signature_url,
    accountStatus: acct?.status ?? 'expired',
    subscriptionEndDate: acct?.end_date ?? null,
    suspended: !!profile.suspended_at,
    email,
  };
}

// ============================================================
// PayUni 設定 — 整合式支付頁（UPP / UNiPaypage），一次性付款
// 文件：https://docs.payuni.com.tw/web/#/7/34
// ============================================================
export type PayuniMode = 'sandbox' | 'production';

export interface PayuniConfig {
  merID: string;
  hashKey: string;
  hashIV: string;
  version: string;
  apiUrl: string;
  queryUrl: string;
  mode: PayuniMode;
}

// 純函式：從環境變數讀取器解析 PayUni 設定。抽成 pure fn 是為了能在 CI
// 用不同的環境組合單元測試，不必碰真的 Deno.env 或 PayUni 網路端點。
//
// 核心不變式（過去被違反 → 線上「授權失敗(模擬)」的根因）：
//   sandbox（測試站）與正式站是兩套完全獨立的帳號，三個憑證
//   MerID / HashKey / HashIV 必須「成套、同源」。舊版對每個欄位各自
//   `PAYUNI_TEST_X || PAYUNI_X` 逐欄回退，只要測試站憑證缺一角，就會把
//   正式站的 MerID/金鑰混進 sandbox 端點——PayUni 收到自己不認識的商店，
//   一律回傳含「(模擬)」浮水印的授權失敗。所以這裡改成：
//     * 依 mode 選定唯一一套前綴（PAYUNI_ 或 PAYUNI_TEST_）；
//     * 三個欄位缺任何一個就明確拋錯，絕不跨環境回退；
//     * 回傳 mode，讓呼叫端／前端／log 能看見「這筆到底打哪個環境」。
/**
 * 這個部署打哪個 PayUni 環境——**唯一**的判定處。
 *
 * 抽出來是為了讓 `/health` 能回報同一個答案而不必湊一份自己的判斷：
 * 這個設定沒有任何外顯訊號（憑證與端點一致時 PayUni 不會有浮水印、
 * 不會有錯誤），2026-07-26 靠人工比對 secrets 的 SHA256 digest 才發現
 * 正式站當時跑在 sandbox。判定只有一份，`/health` 就不可能說謊。
 *
 * 注意它**只讀 PAYUNI_SANDBOX、不碰憑證**——`/health` 必須永遠回得了話，
 * 不能因為憑證沒設就跟著炸。
 */
export function resolvePayuniMode(read: (key: string) => string | undefined): PayuniMode {
  return read('PAYUNI_SANDBOX') === 'true' ? 'sandbox' : 'production';
}

/** 該 mode 需要的三把憑證是否成套齊全（不回傳值,只回傳有沒有）。 */
export function isPayuniConfigured(read: (key: string) => string | undefined): boolean {
  const prefix = resolvePayuniMode(read) === 'sandbox' ? 'PAYUNI_TEST_' : 'PAYUNI_';
  return (['MER_ID', 'HASH_KEY', 'HASH_IV'] as const)
    .every((k) => (read(`${prefix}${k}`)?.trim() ?? '') !== '');
}

export function resolvePayuniConfig(read: (key: string) => string | undefined): PayuniConfig {
  const mode: PayuniMode = resolvePayuniMode(read);
  const prefix = mode === 'sandbox' ? 'PAYUNI_TEST_' : 'PAYUNI_';

  const merID = read(`${prefix}MER_ID`)?.trim();
  const hashKey = read(`${prefix}HASH_KEY`)?.trim();
  const hashIV = read(`${prefix}HASH_IV`)?.trim();

  const missing = [
    !merID && `${prefix}MER_ID`,
    !hashKey && `${prefix}HASH_KEY`,
    !hashIV && `${prefix}HASH_IV`,
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    // 明確、成套地失敗——寧可在建單當下就擋下（前端顯示「建立訂單失敗」），
    // 也不要把混搭憑證送去 PayUni，讓使用者走到付款頁才吃「授權失敗(模擬)」。
    const hint = mode === 'sandbox'
      ? ' 測試站需自成一套 PAYUNI_TEST_* 憑證，不會回退到正式站憑證；以正式站憑證打 sandbox 端點會得到「授權失敗(模擬)」。'
      : '';
    throw new Error(`PayUni 環境變數未設定（mode=${mode}）：缺少 ${missing.join('、')}。${hint}`);
  }

  return {
    merID: merID!,
    hashKey: hashKey!,
    hashIV: hashIV!,
    version: '1.0',
    apiUrl: mode === 'sandbox'
      ? 'https://sandbox-api.payuni.com.tw/api/upp'
      : 'https://api.payuni.com.tw/api/upp',
    // server-to-server 交易查詢（reconcile 對帳用）
    queryUrl: mode === 'sandbox'
      ? 'https://sandbox-api.payuni.com.tw/api/trade/query'
      : 'https://api.payuni.com.tw/api/trade/query',
    mode,
  };
}

function payuniConfig(): PayuniConfig {
  return resolvePayuniConfig((k) => Deno.env.get(k));
}

// MerTradeNo：限英數字。台灣日期時間(14) + 6 碼 CSPRNG 亂數 = 20 碼。
// Math.random 4 碼 base36 在同秒內碰撞機率約 1/168 萬——量大後偶發，
// 碰撞會撞 payment_orders 的唯一鍵讓使用者吃 500；CSPRNG 6 碼把機率
// 壓到 ~1/2×10⁹，且不可預測。export 供 hardening.test.ts 驗證格式。
export function generateTradeNo(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let rand = '';
  for (const b of bytes) rand += chars[b % 36];
  return `${twCompactTimestamp()}${rand}`; // 20 chars
}

// ============================================================
// GET /profile  （供 App.tsx 在啟動時載入用戶狀態）
// GET /auth/profile  （向下相容別名）
// ============================================================
const profileHandler = async (c: any) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const data = await buildProfileResponse(sb(), user.id, user.email);
  if (!data) return c.json({ error: '用戶不存在' }, 404);
  return c.json(data);
};

app.get('/profile', profileHandler);
app.get('/auth/profile', profileHandler);

// ============================================================
// POST /auth/check-email
// 檢查 email 是否已存在（AuthPage 步驟 1 使用）
// ============================================================
app.post('/auth/check-email', async (c) => {
  // 無驗證端點 + { exists } 本身就是帳號枚舉位元 → per-IP 限流
  // （bump_rate_limit，fail-open：限流器故障不擋正常註冊）。
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('cf-connecting-ip') ||
    'unknown';
  const { data: allowed } = await sb().rpc('bump_rate_limit', {
    p_key: `check-email:${ip}`,
    p_max: 10,
    p_window_seconds: 300,
  });
  if (allowed === false) {
    return c.json({ error: '請求過於頻繁，請稍後再試' }, 429);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ exists: false });
  }

  const email = body?.email?.trim()?.toLowerCase();
  if (!email) return c.json({ exists: false });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=50&search=${encodeURIComponent(email)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );

  if (!res.ok) return c.json({ exists: false });
  const data = await res.json();
  // 只回傳 exists。刻意「不」回傳 email 是否已驗證：一來避免多洩漏一個
  // 「這個 email 註冊到一半」的枚舉位元，二來未驗證帳號的復原改走「密碼優先」
  // （見 AuthPage.handleLogin），前端不需要在步驟 1 就知道驗證狀態。
  const exists = (data.users || []).some((u: any) => u.email?.toLowerCase() === email);
  return c.json({ exists });
});

// ============================================================
// POST /auth/register
// CompleteProfile：填完基本資料後呼叫，寫入 profiles + registration_step=1
// ============================================================
app.post('/auth/register', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '請求格式錯誤' }, 400);
  }

  const { name, nationalId, phone, birthDate, referralCode } = body;

  if (!name || !phone || !birthDate) {
    return c.json({ error: '請填寫姓名、手機、生日' }, 400);
  }

  // 姓名格式:前端 validateName 已依模式擋過,但前端驗證可被直接呼叫 API 繞過,
  // 而 profiles.name 是提領撥款時人工核對身分的依據。這裡是邊界驗證。
  const nameError = validateNameFormat(name);
  if (nameError) return c.json({ error: nameError }, 400);

  const client = sb();

  // 若有填推薦碼，先查出推薦人 user_id
  let referrerUserId: string | null = null;
  const cleanCode = referralCode?.toLowerCase().trim() || null;
  if (cleanCode) {
    const { data: rc } = await client
      .from('referral_codes')
      .select('user_id')
      .eq('code', cleanCode)
      .eq('status', 'active')
      .single();
    referrerUserId = rc?.user_id ?? null;
  }

  // 透過 service_role 更新 profile（包含 registration_step = 1）
  const updates: Record<string, any> = {
    name,
    phone,
    birth_date: birthDate,
    national_id: nationalId || null,
    registration_step: 1,
    referred_by_code: cleanCode,
    referred_by_user_id: referrerUserId,
  };

  const { error } = await client.from('profiles').update(updates).eq('id', user.id);
  if (error) {
    console.error('[register] update 失敗:', error);
    return c.json({ error: '更新失敗' }, 500);
  }

  const data = await buildProfileResponse(client, user.id, user.email);
  if (!data) return c.json({ error: '用戶不存在' }, 404);
  return c.json(data);
});

// ============================================================
// PUT /auth/profile
// 更新可編輯的基本資料欄位。registrationStep 不接受前端寫入 ——
// 由 payment_orders 即時算出（見 buildProfileResponse / migration 0011），
// 避免任何登入用戶自行 PUT 跳過付款流程。
// ============================================================
app.put('/auth/profile', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '請求格式錯誤' }, 400);
  }

  // 遮罩值防呆：GET /profile 回的是遮罩值（A12****789 / *****0123），
  // 前端若誤把它回填送出，會把 DB 的完整值蓋成星號——一律拒絕。
  for (const key of ['nationalId', 'bankCode', 'bankAccount']) {
    if (typeof body?.[key] === 'string' && body[key].includes('*')) {
      return c.json({ error: '欄位含遮罩字元，請輸入完整內容' }, 400);
    }
  }

  const client = sb();
  const allowedFields: Record<string, string> = {
    name: 'name',
    phone: 'phone',
    birthDate: 'birth_date',
    nationalId: 'national_id',
    bankCode: 'bank_code',
    bankAccount: 'bank_account',
  };

  // 姓名格式只在 body 帶 name 時檢查——本端點是逐欄位局部更新,無條件檢查會
  // 誤擋「只改手機/銀行帳號」的請求,也會對 undefined 呼叫字串方法而回 500。
  if ('name' in body) {
    const nameError = validateNameFormat(body.name);
    if (nameError) return c.json({ error: nameError }, 400);
  }

  const updates: Record<string, any> = {};
  for (const [jsKey, dbKey] of Object.entries(allowedFields)) {
    if (jsKey in body) updates[dbKey] = body[jsKey];
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: '沒有可更新的欄位' }, 400);
  }

  const { error } = await client.from('profiles').update(updates).eq('id', user.id);
  if (error) {
    console.error('[put /auth/profile] 更新失敗:', error);
    return c.json({ error: '更新失敗' }, 500);
  }

  const data = await buildProfileResponse(client, user.id, user.email);
  if (!data) return c.json({ error: '用戶不存在' }, 404);
  return c.json(data);
});

// ============================================================
// DELETE /auth/cancel-signup
// CompleteProfile「我晚點再填」：刪除尚未完成的帳號。
// 守衛：已完成付款或有提領紀錄的會員不得自助刪除——schema 全面
// on delete cascade，刪 auth user 會連鎖抹除 payment_orders /
// withdrawals / referral_edges，金流稽核紀錄與推薦樹對帳從此消失
// （與 /auth/reset-registration 的「已完成付款無法重置」同一原則）。
// ============================================================
app.delete('/auth/cancel-signup', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const client = sb();
  const [{ data: completedOrder }, { data: withdrawal }] = await Promise.all([
    client.from('payment_orders').select('id')
      .eq('user_id', user.id).eq('status', 'completed').limit(1).maybeSingle(),
    client.from('withdrawals').select('id')
      .eq('user_id', user.id).limit(1).maybeSingle(),
  ]);
  if (completedOrder || withdrawal) {
    return c.json({ error: '已完成付款的帳號無法取消註冊，如需刪除帳號請聯繫客服' }, 400);
  }

  const { error } = await client.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('[cancel-signup] 刪除失敗:', error);
    return c.json({ error: '刪除失敗' }, 500);
  }
  return c.json({ success: true });
});

// ============================================================
// POST /auth/complete-registration
// PaymentResult 的手動完成按鈕（新流程 webhook 已自動完成）
// 若 registration_step 已是 3，直接回傳 profile；否則回傳狀態
// ============================================================
app.post('/auth/complete-registration', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const client = sb();
  const data = await buildProfileResponse(client, user.id, user.email);
  if (!data) return c.json({ error: '用戶不存在' }, 404);

  if (data.registrationStep === 3 && data.referralCode) {
    return c.json({
      success: true,
      message: '已完成註冊',
      data: {
        referralCode: data.referralCode,
        activeUntil: data.subscriptionEndDate,
        accountStatus: data.accountStatus,
      },
    });
  }

  // 檢查是否有已完成的付款訂單
  const { data: order } = await client
    .from('payment_orders')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .limit(1)
    .single();

  if (order) {
    return c.json({
      success: false,
      message: '付款已成功，系統正在處理中，請稍後重新整理頁面',
    }, 202);
  }

  return c.json({
    success: false,
    message: '尚未完成付款，請先完成付款',
  }, 400);
});

// ============================================================
// POST /auth/reset-registration
// PaymentCheckout「編輯」：讓用戶回到 CompleteProfile 修改基本資料。
// registrationStep 已改為即時算出（見 buildProfileResponse），這裡不需要
// 寫任何「step 0」旗標 —— 只要擋掉已付款會員誤觸重置即可；使用者重新
// 送出 /auth/register 時 registration_step 會自然設回 1。
// ============================================================
app.post('/auth/reset-registration', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const { data: completedOrder } = await sb()
    .from('payment_orders')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .limit(1)
    .maybeSingle();

  if (completedOrder) {
    return c.json({ error: '已完成付款，無法重置註冊資料' }, 400);
  }

  return c.json({ success: true });
});

// ============================================================
// GET /referrals/validate/:code
// CompleteProfile / PaymentCheckout 驗證推薦碼
// ============================================================
app.get('/referrals/validate/:code', async (c) => {
  const code = c.req.param('code')?.toLowerCase().trim();
  if (!code) return c.json({ valid: false, error: { message: '推薦碼不能為空' } });

  const { data, error } = await sb().rpc('validate_referral_code', { p_code: code });

  if (error || !data || data.length === 0) {
    return c.json({ valid: false, error: { message: '推薦碼不存在或已失效' } });
  }

  const row = data[0];
  return c.json({
    valid: true,
    referrer: {
      userId: row.referrer_user_id,
      userName: row.referrer_name,
      listingName: row.listing_name ?? null,
    },
    // 舊欄位名稱（向下相容）
    referrerName: row.referrer_name,
    referrerUserId: row.referrer_user_id,
  });
});

// ============================================================
// POST /referrals/join-program
// 使用者同意推廣獎勵規章/契約書並簽名後，標記加入推薦計畫。
// 只更新 profiles 的同意狀態；referral_code 由付款成功時另外產生。
// ============================================================
app.post('/referrals/join-program', async (c) => {
  const user = await requireAuth(c);
  if (!user) {
    return c.json({ success: false, error: { message: '未授權：請先登入' } }, 401);
  }

  const client = sb();

  const { data: profile } = await client
    .from('profiles')
    .select('referral_program_joined, referral_program_joined_at')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return c.json({ success: false, error: { message: '找不到用戶資料' } }, 404);
  }

  // 已加入過：直接回傳現況，不重複寫入/上傳（idempotent，容忍雙擊或重送）
  if (profile.referral_program_joined) {
    const { data: code } = await client
      .from('referral_codes').select('code')
      .eq('user_id', user.id).eq('status', 'active').maybeSingle();
    return c.json({
      success: true,
      data: {
        referralCode: code?.code ?? '',
        joinedAt: profile.referral_program_joined_at,
        message: '您已經加入推薦計畫',
      },
    });
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: { message: '請求格式錯誤' } }, 400);
  }

  const { agreedToTerms, signatureData } = body ?? {};
  if (agreedToTerms !== true) {
    return c.json({ success: false, error: { message: '請同意推廣獎勵規章與契約書' } }, 400);
  }
  if (typeof signatureData !== 'string' || !signatureData.startsWith('data:image/')) {
    return c.json({ success: false, error: { message: '請完成簽名' } }, 400);
  }

  const base64 = signatureData.split(',')[1] ?? '';
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  } catch {
    return c.json({ success: false, error: { message: '簽名資料格式錯誤' } }, 400);
  }
  if (bytes.byteLength > 2 * 1024 * 1024) {
    return c.json({ success: false, error: { message: '簽名圖片過大，請重新簽名' } }, 400);
  }

  // 簽名上傳失敗不擋加入流程 —— 同意條款才是核心動作
  let signaturePath: string | null = null;
  const path = `${user.id}/${Date.now()}.png`;
  const { error: uploadErr } = await client.storage
    .from('referral-signatures')
    .upload(path, bytes, { contentType: 'image/png', upsert: false });
  if (uploadErr) {
    console.error('[join-program] 簽名上傳失敗，仍允許加入:', uploadErr);
  } else {
    signaturePath = path;
  }

  const joinedAt = new Date().toISOString();
  const { error: updateErr } = await client.from('profiles').update({
    referral_program_joined: true,
    referral_program_joined_at: joinedAt,
    referral_signature_url: signaturePath,
  }).eq('id', user.id);

  if (updateErr) {
    console.error('[join-program] 更新失敗:', updateErr);
    return c.json({ success: false, error: { message: '加入推薦計畫失敗，請稍後再試' } }, 500);
  }

  const { data: code } = await client
    .from('referral_codes').select('code')
    .eq('user_id', user.id).eq('status', 'active').maybeSingle();

  return c.json({
    success: true,
    data: { referralCode: code?.code ?? '', joinedAt, message: '成功加入推薦計畫！' },
  });
});

// ============================================================
// POST /listings/verify-referral-code
// （向下相容別名，供 CompleteProfile 的 apiRequestJson 呼叫）
// ============================================================
app.post('/listings/verify-referral-code', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ valid: false });
  }
  const code = (body?.referralCode || body?.code || '').toLowerCase().trim();
  if (!code) return c.json({ valid: false, error: { message: '推薦碼不能為空' } });

  const { data, error } = await sb().rpc('validate_referral_code', { p_code: code });
  if (error || !data || data.length === 0) {
    return c.json({ valid: false, error: { message: '推薦碼不存在或已失效' } });
  }
  const row = data[0];
  return c.json({
    valid: true,
    referrerName: row.referrer_name,
    referrer: {
      userId: row.referrer_user_id,
      userName: row.referrer_name,
      listingName: row.listing_name ?? null,
    },
  });
});

// ============================================================
// /admin/** 統一守門 middleware：requireAuth + profiles.is_admin。
// 逐路由手貼守門漏一次就是權限漏洞（GET /admin/features 曾是無驗證
// 的漏網之魚，見 admin-gate.test.ts）——middleware 讓整個命名空間
// 一律先過這道網；個別 handler 內既有的檢查保留作為第二道防線。
// 必須註冊在所有 /admin 路由之前才會生效。
// ============================================================
app.use('/admin/*', async (c, next) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);
  await next();
});

// ============================================================
// system_alerts 的出口（見 system-alerts-api.test.ts）：這張表自
// 0716000004 起只進不出——「金額不符待人工裁決」等需要人工介入的
// 告警實際上無人看得到，且告警去重靠 resolved_at is null，永不
// resolve 代表同一訂單只告警一次、第一次漏看就永遠靜默。
// 這兩個端點刻意明確檢查 DB error 回 500（「查詢失敗」與「沒有資料」
// 對維運後台必須可區分，不得靜默轉成空 200）。
// ============================================================
app.get('/admin/system-alerts', async (c) => {
  const unresolvedOnly = c.req.query('unresolved') !== 'false';
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500);

  let query = sb().from('system_alerts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (unresolvedOnly) query = query.is('resolved_at', null);

  const { data: alerts, count, error } = await query;
  if (error) {
    console.error('[admin/system-alerts] 查詢失敗:', error);
    return c.json({ error: { message: '查詢告警失敗' } }, 500);
  }
  return c.json({ success: true, data: { alerts: alerts ?? [], total: count ?? 0 } });
});

app.post('/admin/system-alerts/:id/resolve', async (c) => {
  const id = c.req.param('id');
  const { data: resolved, error } = await sb().from('system_alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
    .is('resolved_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[admin/system-alerts/resolve] 更新失敗:', error);
    return c.json({ error: { message: '標記告警失敗' } }, 500);
  }
  if (!resolved) return c.json({ error: { message: '找不到未處理的告警' } }, 404);
  return c.json({ success: true });
});

// ============================================================
// GET /admin/features
// 功能開關（目前全部開啟，後續可改成資料庫設定）
// ============================================================
app.get('/admin/features', (c) => {
  return c.json({
    features: {
      serviceProviderManagement: true,
      referralManagement: true,
      taskCenter: true,
      rewardSystem: true,
    },
  });
});

// ============================================================
// Admin 後台：提領管理 / 會員管理 / 公告管理
// 所有 /admin/** 路由統一守門：requireAuth + profiles.is_admin。
// ============================================================

// GET /admin/withdrawals?status=
// 提領單列表（含申請人資料與身分證照片簽名網址）
app.get('/admin/withdrawals', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  const statusFilter = c.req.query('status');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const search = c.req.query('search')?.trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '200'), 500);
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);

  const client = sb();

  // 搜尋比對的是會員姓名，而姓名在 profiles——先解析出 user_id 集合再篩提領單。
  // 空集合要當成「查無此人」而不是「不篩」，否則搜尋不到的字串會回傳全部。
  let searchUserIds: string[] | null = null;
  if (search) {
    const { data: hits } = await client.from('profiles')
      .select('id')
      .ilike('name', `%${search}%`);
    searchUserIds = (hits ?? []).map((p: any) => p.id);
  }

  let query = client.from('withdrawals')
    .select('*', { count: 'exact' })
    .order('requested_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter);
  if (from) query = query.gte('requested_at', from);
  // to 是「當日含」：+1 天再取小於，否則當天申請的會被排除
  if (to) {
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    query = query.lt('requested_at', end.toISOString());
  }
  if (searchUserIds !== null) query = query.in('user_id', searchUserIds);

  const { data: rows, count, error: listErr } = await query;
  // 金流後台必須能區分「查詢失敗」與「真的沒有提領單」——DB 故障
  // 靜默轉成空 200 會讓 admin 以為沒有待審件，維運端零察覺。
  if (listErr) {
    console.error('[admin/withdrawals] 查詢失敗:', listErr);
    return c.json({ error: { message: '查詢提領單失敗' } }, 500);
  }

  const userIds = [...new Set((rows ?? []).map((w: any) => w.user_id))];
  let profMap: Record<string, any> = {};
  if (userIds.length) {
    const { data: profs } = await client.from('profiles')
      .select('id, name, phone, national_id, id_card_front_path, id_card_back_path')
      .in('id', userIds);
    profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
  }

  // 批次簽名證件照網址（1 小時）
  const allPaths = userIds.flatMap((id) => {
    const p = profMap[id];
    return [p?.id_card_front_path, p?.id_card_back_path].filter(Boolean) as string[];
  });
  const urlMap: Record<string, string> = {};
  if (allPaths.length) {
    const { data: signed } = await client.storage.from('id-cards').createSignedUrls(allPaths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlMap[s.path] = s.signedUrl;
    }
  }

  // 轉換歷史：一次 in 查詢後在應用層 group，不是逐筆打 DB（同上面證件照的
  // 批次簽名作法）。逐筆會讓 200 列變成 200 次往返。
  const withdrawalIds = (rows ?? []).map((w: any) => w.id);
  const eventMap: Record<string, any[]> = {};
  if (withdrawalIds.length) {
    const { data: evts } = await client.from('withdrawal_events')
      .select('*')
      .in('withdrawal_id', withdrawalIds)
      .order('created_at');
    for (const e of evts ?? []) {
      (eventMap[e.withdrawal_id] ??= []).push({
        fromStatus: e.from_status,
        toStatus: e.to_status,
        note: e.note,
        bankRef: e.bank_ref,
        transferredOn: e.transferred_on,
        // admin_id 為 null = 會員自己的動作（查收確認）。不外洩 admin 身分,
        // 只回布林——前端要區分的是「誰按的類別」不是「哪個 admin」。
        byAdmin: e.admin_id !== null,
        createdAt: e.created_at,
      });
    }
  }

  const withdrawals = (rows ?? []).map((w: any) => {
    const p = profMap[w.user_id];
    const events = eventMap[w.id] ?? [];
    return {
      id: w.id,
      userId: w.user_id,
      userName: p?.name ?? '',
      userPhone: p?.phone ?? null,
      idNumber: p?.national_id ?? null,
      amount: w.amount,
      fee: w.fee,
      status: w.status,
      bankCode: w.bank_code,
      bankAccount: w.bank_account,
      // 主表的 note 自 20260802000004 起 vestigial（讀它只會拿到 null）。
      // 取事件表最新一筆——那才是「這筆現在的說明」。
      note: events.length ? (events[events.length - 1].note ?? null) : null,
      events,
      requestedAt: w.requested_at,
      processedAt: w.processed_at,
      completedAt: w.completed_at,
      idCardFrontUrl: p?.id_card_front_path ? (urlMap[p.id_card_front_path] ?? null) : null,
      idCardBackUrl: p?.id_card_back_path ? (urlMap[p.id_card_back_path] ?? null) : null,
    };
  });

  // 彙總在 SQL 端對**整個篩選結果**算，不是對當前頁——後者會隨分頁改變，
  // 等於一個會說謊的總額，而 admin 拿它去對網銀的轉出金額。
  const { data: stats } = await client.rpc('admin_withdrawal_stats', {
    p_status: statusFilter ?? null,
    p_from: from ?? null,
    p_to: to ?? null,
    p_search: search ?? null,
  });

  return c.json({
    success: true,
    data: {
      withdrawals,
      total: count ?? 0,
      limit,
      offset,
      stats: {
        pendingAmount: stats?.pending_amount ?? 0,
        byStatus: stats?.by_status ?? {
          pending: 0,
          awaiting_collection: 0,
          completed: 0,
          rejected: 0,
        },
      },
    },
  });
});

// POST /admin/withdrawals/:id/status
// 狀態轉換：pending → awaiting_collection（已匯款）/ rejected（退件退點）
app.post('/admin/withdrawals/:id/status', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }

  const { data, error } = await sb().rpc('admin_update_withdrawal_status', {
    p_admin_id: user.id,
    p_withdrawal_id: c.req.param('id'),
    p_status: body?.status ?? '',
    p_note: body?.note ?? null,
  });

  if (error) {
    console.error('[admin-withdrawal-status] rpc error:', error);
    return c.json({ success: false, error: { message: '狀態更新失敗' } }, 500);
  }
  if (!data?.success) {
    const status = data?.error_code === 'not_found'
      ? 404
      : data?.error_code === 'forbidden'
      ? 403
      : 400;
    return c.json({ success: false, error: { message: data?.message ?? '狀態更新失敗' } }, status);
  }

  return c.json({
    success: true,
    data: {
      withdrawalId: c.req.param('id'),
      status: data.status,
      processedAt: data.processed_at ?? null,
    },
  });
});

// POST /admin/withdrawals/batch-mark-paid
// body: { items: [{ id, bankRef? }], transferredOn?, note? }
//
// admin 在網銀做完一批轉帳後一次標記。回傳逐筆明細而非只給筆數——批次裡
// 有一筆狀態被別人改過時，admin 要知道**哪幾筆**需要重做。
app.post('/admin/withdrawals/batch-mark-paid', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) {
    return c.json({ success: false, error: { message: '沒有選取任何提領單' } }, 400);
  }

  const { data, error } = await sb().rpc('admin_batch_mark_paid', {
    p_admin_id: user.id,
    // 前端用 camelCase，SQL 側用 snake_case——在邊界轉換，不讓命名慣例洩到對面。
    p_items: items.map((it: any) => ({ id: it?.id, bank_ref: it?.bankRef ?? null })),
    p_transferred_on: body?.transferredOn ?? null,
    p_note: body?.note ?? null,
  });

  if (error) {
    console.error('[admin/withdrawals/batch-mark-paid] rpc error:', error);
    return c.json({ success: false, error: { message: '批次標記失敗' } }, 500);
  }
  if (!data?.success) {
    return c.json({ success: false, error: { message: data?.message ?? '批次標記失敗' } }, 403);
  }

  return c.json({
    success: true,
    data: { succeeded: data.succeeded ?? [], failed: data.failed ?? [] },
  });
});

// GET /admin/members?search=&limit=&offset=
app.get('/admin/members', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  const { data, error } = await sb().rpc('admin_list_members', {
    p_search: c.req.query('search') ?? null,
    p_status: c.req.query('status') ?? null,
    p_sort: c.req.query('sort') ?? 'created_desc',
    p_limit: Math.min(parseInt(c.req.query('limit') || '50'), 200),
    p_offset: Math.max(parseInt(c.req.query('offset') || '0'), 0),
  });

  if (error) {
    console.error('[admin-members] rpc error:', error);
    return c.json({ success: false, error: { message: '無法取得會員列表' } }, 500);
  }

  const members = (data?.members ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    isAdmin: m.is_admin,
    suspended: !!m.suspended_at,
    suspendedAt: m.suspended_at,
    accountStatus: m.account_status,
    endDate: m.end_date ?? null,
    idVerificationStatus: m.id_verification_status ?? 'none',
    listingCount: m.listing_count,
    createdAt: m.created_at,
  }));

  return c.json({
    success: true,
    data: {
      members,
      total: data?.total ?? 0,
      // stats 直通 SQL 算好的全站數字。**不要在這裡從 members 加總**——
      // members 只有當前頁，那樣算出來的統計卡會隨分頁改變（M2 的反例）。
      stats: data?.stats ?? {
        total: 0,
        active: 0,
        expired: 0,
        suspended: 0,
        admins: 0,
      },
    },
  });
});

// ============================================================
// GET /admin/members/:id —— 會員詳情（含近期提領記錄）
//
// §1.1 的頭號客服情境是「我提領怎麼還沒到」，`recentWithdrawals` 就是那句話的
// 答案，不是附加資訊。
//
// **遮罩在這一層而不是 SQL**：同一份資料，提領作業台因匯款作業需要而回全碼、
// 查詢台回遮罩值。規則烤進資料層就沒辦法讓兩個呼叫端有不同的答案。
// 銀行代號不遮——它識別的是銀行不是個人，遮了反而讓客服對不出是哪一家。
// ============================================================
app.get('/admin/members/:id', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  const { data, error } = await sb().rpc('admin_member_detail', {
    p_user_id: c.req.param('id'),
  });

  if (error) {
    console.error('[admin-member-detail] rpc error:', error);
    return c.json({ success: false, error: { message: '無法取得會員詳情' } }, 500);
  }
  if (!data) return c.json({ success: false, error: { message: '查無此會員' } }, 404);

  const points = data.points ?? {};
  return c.json({
    success: true,
    data: {
      member: {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        isAdmin: data.is_admin,
        suspended: !!data.suspended_at,
        suspendedAt: data.suspended_at,
        createdAt: data.created_at,
        accountStatus: data.account_status,
        endDate: data.end_date ?? null,
        idVerificationStatus: data.id_verification_status ?? 'none',
        idRejectReason: data.id_reject_reason ?? null,
        idNumber: maskNationalId(data.national_id),
        bankCode: data.bank_code ?? null,
        bankAccount: maskBankAccount(data.bank_account),
        referrerName: data.referrer_name ?? null,
        directChildCount: data.direct_child_count ?? 0,
        listingCount: data.listing_count ?? 0,
        availablePoints: points.available ?? 0,
        pendingPoints: points.pending ?? 0,
        withdrawnPoints: points.withdrawn ?? 0,
        recentWithdrawals: (data.recent_withdrawals ?? []).map((w: any) => ({
          id: w.id,
          amount: w.amount,
          fee: w.fee,
          status: w.status,
          note: w.note ?? null,
          requestedAt: w.requested_at,
          processedAt: w.processed_at,
          completedAt: w.completed_at,
        })),
      },
    },
  });
});

// ============================================================
// POST /admin/members/:id/admin  body: { isAdmin: boolean }
//
// 授予／撤銷管理員。錯誤碼直通 SQL 的判定（cannot_demote_self / last_admin），
// 前端據此顯示不同的說明——把它們壓成同一句「操作失敗」會讓 admin 不知道
// 是自己不能撤自己，還是系統不允許歸零。
// ============================================================
app.post('/admin/members/:id/admin', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }

  if (typeof body?.isAdmin !== 'boolean') {
    return c.json({ success: false, error: { message: 'isAdmin 必須是布林值' } }, 400);
  }

  const { data, error } = await sb().rpc('admin_set_member_admin', {
    p_admin_id: user.id,
    p_target_id: c.req.param('id'),
    p_is_admin: body.isAdmin,
  });

  if (error) {
    console.error('[admin-set-member-admin] rpc error:', error);
    return c.json({ success: false, error: { message: '權限更新失敗' } }, 500);
  }
  if (!data?.success) {
    const messages: Record<string, string> = {
      cannot_demote_self: '不能撤銷自己的管理員權限，請由其他管理員操作',
      last_admin: '系統必須保留至少一位管理員',
      member_not_found: '查無此會員',
    };
    return c.json({
      success: false,
      error: {
        code: data?.error_code ?? 'unknown',
        message: messages[data?.error_code] ?? '權限更新失敗',
      },
    }, 400);
  }

  return c.json({ success: true, data: { isAdmin: body.isAdmin } });
});

// POST /admin/members/:id/suspend  body: { suspend: boolean }
app.post('/admin/members/:id/suspend', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }
  const suspend = !!body?.suspend;

  const targetId = c.req.param('id');
  if (targetId === user.id && suspend) {
    return c.json({ success: false, error: { message: '不能停權自己' } }, 400);
  }

  const { error } = await sb().from('profiles')
    .update({ suspended_at: suspend ? new Date().toISOString() : null })
    .eq('id', targetId);

  if (error) {
    console.error('[admin-suspend] error:', error);
    return c.json({ success: false, error: { message: '停權狀態更新失敗' } }, 500);
  }
  return c.json({ success: true, data: { userId: targetId, suspended: suspend } });
});

// ============================================================
// 證件審核（admin）——會員上傳雙面後進 pending 佇列，admin 核可或退回。
// 審核結果只在 rejected 時擋提領（見 20260802000002 的守衛 #5a）。
// ============================================================

// GET /admin/id-reviews?status=&limit=&offset=
app.get('/admin/id-reviews', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  const client = sb();
  const { data, error } = await client.rpc('admin_list_id_reviews', {
    p_status: c.req.query('status') ?? 'pending',
    p_limit: Math.min(parseInt(c.req.query('limit') || '50'), 200),
    p_offset: Math.max(parseInt(c.req.query('offset') || '0'), 0),
  });

  if (error) {
    console.error('[admin/id-reviews] rpc error:', error);
    return c.json({ success: false, error: { message: '無法取得審核佇列' } }, 500);
  }

  // 批次簽名證件照網址（1 小時）——與 /admin/withdrawals 同模式，一次
  // createSignedUrls 而不是逐列打 storage。
  const rows = (data?.reviews ?? []) as Array<Record<string, unknown>>;
  const paths = rows.flatMap((r) =>
    [r.id_card_front_path, r.id_card_back_path].filter(Boolean) as string[]
  );
  const urlMap: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await client.storage.from('id-cards').createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlMap[s.path] = s.signedUrl;
    }
  }

  const reviews = rows.map((r) => ({
    userId: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.id_verification_status,
    rejectReason: r.id_reject_reason,
    reviewedAt: r.id_verified_at,
    // 送審時間：佇列排序的依據，也是 admin 判斷「這個人等多久了」的數字。
    // 舊列 backfill 成近似值，仍保底 fallback 到註冊時間。
    submittedAt: r.id_submitted_at ?? r.created_at,
    createdAt: r.created_at,
    idCardFrontUrl: r.id_card_front_path ? (urlMap[r.id_card_front_path as string] ?? null) : null,
    idCardBackUrl: r.id_card_back_path ? (urlMap[r.id_card_back_path as string] ?? null) : null,
  }));

  return c.json({ success: true, data: { reviews, total: data?.total ?? 0 } });
});

// POST /admin/id-reviews/:userId/review  body: { approve: boolean, reason?: string }
app.post('/admin/id-reviews/:userId/review', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }

  const { data, error } = await sb().rpc('admin_review_id', {
    p_admin_id: user.id,
    p_user_id: c.req.param('userId'),
    p_approve: !!body?.approve,
    p_reason: body?.reason ?? null,
  });

  if (error) {
    console.error('[admin/id-reviews/review] rpc error:', error);
    return c.json({ success: false, error: { message: '審核失敗' } }, 500);
  }
  if (!data?.success) {
    const status = data?.error_code === 'not_found'
      ? 404
      : data?.error_code === 'forbidden'
      ? 403
      : 400;
    return c.json(
      { success: false, error: { message: data?.message ?? '審核失敗', code: data?.error_code } },
      status,
    );
  }

  return c.json({ success: true, data: { userId: c.req.param('userId'), status: data.status } });
});

// ============================================================
// 全站公告（前台橫幅 + admin CRUD）
// ============================================================

// GET /announcements/active（公開，不需登入——前台 MaintenanceBanner 用）
app.get('/announcements/active', async (c) => {
  const { data: rows } = await sb()
    .from('announcements')
    .select('id, title, message, type, starts_at, ends_at')
    .eq('is_active', true)
    .lte('starts_at', new Date().toISOString())
    .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
    .order('starts_at', { ascending: false });

  const announcements = (rows ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    message: a.message,
    type: a.type,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
  }));

  return c.json({ success: true, data: { announcements } });
});

// GET /admin/announcements（全部，含未生效/已停用）
app.get('/admin/announcements', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  const { data: rows } = await sb()
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const announcements = (rows ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    message: a.message,
    type: a.type,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    isActive: a.is_active,
    createdAt: a.created_at,
  }));

  return c.json({ success: true, data: { announcements } });
});

// POST /admin/announcements  body: { title, message, type, startsAt?, endsAt? }
app.post('/admin/announcements', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }

  const title = (body?.title ?? '').trim();
  const message = (body?.message ?? '').trim();
  const type = ['info', 'warning', 'error'].includes(body?.type) ? body.type : 'info';
  if (!title || !message) {
    return c.json({ success: false, error: { message: '請填寫完整的公告標題與內容' } }, 400);
  }

  const { data: row, error } = await sb().from('announcements').insert({
    title,
    message,
    type,
    starts_at: body?.startsAt ?? new Date().toISOString(),
    ends_at: body?.endsAt ?? null,
    created_by: user.id,
  }).select('id').single();

  if (error) {
    console.error('[admin-announcements] insert error:', error);
    return c.json({ success: false, error: { message: '公告建立失敗' } }, 500);
  }
  return c.json({ success: true, data: { id: row!.id } });
});

// DELETE /admin/announcements/:id
app.delete('/admin/announcements/:id', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  const { error } = await sb().from('announcements').delete().eq('id', c.req.param('id'));
  if (error) {
    return c.json({ success: false, error: { message: '公告刪除失敗' } }, 500);
  }
  return c.json({ success: true });
});

// ============================================================
// AdminSetup：首次系統設定（尚無任何管理員時，允許自助宣告）
// ============================================================
app.get('/admin-setup/check', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const client = sb();
  const [{ data: me }, { data: admins }] = await Promise.all([
    client.from('profiles').select('name, is_admin').eq('id', user.id).single(),
    client.from('profiles').select('id').eq('is_admin', true).limit(1),
  ]);

  const hasExistingAdmin = (admins?.length ?? 0) > 0;
  return c.json({
    success: true,
    isAdmin: !!me?.is_admin,
    hasExistingAdmin,
    canBecomeAdmin: !hasExistingAdmin,
    userId: user.id,
    userName: me?.name ?? '',
    userEmail: user.email ?? '',
  });
});

app.post('/admin-setup/set-self-admin', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const { data, error } = await sb().rpc('admin_setup_claim', { p_user_id: user.id });
  if (error) {
    console.error('[admin-setup] rpc error:', error);
    return c.json({ success: false, error: { message: '設置失敗，請稍後再試' } }, 500);
  }
  if (!data?.success) {
    return c.json({ success: false, error: { message: data?.message ?? '設置失敗' } }, 403);
  }
  return c.json({ success: true, message: '您已成為平台管理員' });
});

// ============================================================
// POST /payuni/prepare
// 建立付款訂單，回傳加密表單資料供前端送出給 PayUni
// ============================================================
app.post('/payuni/prepare', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ success: false, error: '未授權' }, 401);

  const client = sb();

  // 防重複：只擋「目前仍在效期內」的會員（active）。已失效（expired）
  // 才可以付款——這正是續訂（到期後接續）或重新訂閱的唯一入口
  // （會員兩態模型：付款即訂閱／續訂／重新訂，見 0721）。
  const { data: acct } = await client
    .from('user_account_status')
    .select('status')
    .eq('user_id', user.id)
    .single();
  if (acct?.status === 'active') {
    return c.json({ success: false, error: '已有有效訂閱，請到期後再續約' }, 400);
  }

  // 過期會員續費雙模式（見 migration 0008）：
  //   extend = 續約，效期接續前一筆訂閱的最後一天；
  //   fresh  = 新約，效期從付款日起算、可換新推薦人。
  // 首次付款沒有 body（renewalMode = null，語意同 fresh）。
  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 沒有 body = 首次付款 */ }
  const renewalMode: 'extend' | 'fresh' | null =
    body?.renewalMode === 'extend' || body?.renewalMode === 'fresh' ? body.renewalMode : null;

  if (renewalMode === 'extend') {
    // 補繳制（A1-A3）：extend 永遠可選，不因過期多久而消失。一筆一年
    // 從前期迄日隔天字面接續，算出來仍在過去也照建單——使用者重複付款
    // 直到迄日回到未來（process_successful_payment 不做 greatest(now())
    // 補救，正是補繳制要的行為）。唯一保留的擋：從未有訂閱紀錄的人
    // 沒有可接續的效期。
    const { data: lastSub } = await client
      .from('subscriptions')
      .select('end_date')
      .eq('user_id', user.id)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastSub?.end_date) {
      return c.json({ success: false, error: '沒有可接續的訂閱紀錄，請選擇新約' }, 400);
    }
  }

  // A16：有審核中（pending）提領時擋下 fresh——fresh 會清空帳本，而
  // pending 的提領之後可能被退件，退款會落進已清空的帳本。只擋 pending：
  // awaiting_collection 依狀態機不可再轉 rejected（錢已核准匯出）。
  // 必須擋在 W3 寫入之前，避免 400 前就先動了上代。
  if (renewalMode === 'fresh' && (await hasPendingWithdrawal(user.id))) {
    return c.json(
      { success: false, error: '您有一筆提領正在審核中，請等待審核完成，或聯繫客服' },
      400,
    );
  }

  // 新約可換推薦人：驗證新推薦碼並更新推薦來源。付款成功時
  // apply_referral_side_effects 會把推薦邊 rewire 到新推薦人（0008），
  // 之後的推薦獎勵歸新推薦人；舊推薦人的歷史獎勵不受影響。
  const referredByCode: string = typeof body?.referredByCode === 'string'
    ? body.referredByCode.toLowerCase().trim()
    : '';
  if (renewalMode === 'fresh' && referredByCode) {
    const { data: codeRows, error: codeErr } = await client
      .rpc('validate_referral_code', { p_code: referredByCode });
    if (codeErr || !codeRows || codeRows.length === 0) {
      return c.json({ success: false, error: '推薦碼不存在或已失效' }, 400);
    }
    const referrerUserId = codeRows[0].referrer_user_id;
    if (referrerUserId === user.id) {
      return c.json({ success: false, error: '不能使用自己的推薦碼' }, 400);
    }
    // referred_by_is_default 一併重置：使用者親自填碼換線 = 非自動來源。
    // 這裡是 referred_by_* 的第二個寫入點（不經 apply_referral_side_effects），
    // 漏掉會讓旗標永久卡 true，前端把使用者自己選的推薦人也一起隱藏。
    const { error: refErr } = await client
      .from('profiles')
      .update({
        referred_by_code: referredByCode,
        referred_by_user_id: referrerUserId,
        referred_by_is_default: false,
      })
      .eq('id', user.id);
    if (refErr) {
      console.error('[prepare] 更新推薦人失敗:', refErr);
      return c.json({ success: false, error: '更新推薦人失敗' }, 500);
    }
  } else if (renewalMode === 'fresh') {
    // A10：選新約 = 離開原本的樹；未填碼不等於「維持原狀」，而是比照
    // 首購未填碼的既有語意——套用平台預設推薦碼，referred_by_is_default
    // = true（前端據此隱藏這個碼，使用者視角就是「沒有上一代」）。
    // A11：任一步失敗 → 維持原上代不變 + 告警，**絕不阻斷金流**。
    // 碼的合法性唯一判準仍是 validate_referral_code（停權/失效都在裡面），
    // 不複製 resolve_default_referrer 的分類。
    const alertDefaultUnavailable = (reason: string, extra: Record<string, unknown> = {}) =>
      logSystemAlert(
        'payuni-prepare',
        { user_id: user.id, reason, ...extra },
        'default_referrer_unavailable_on_fresh',
      );
    const { data: cfgRow } = await client
      .from('reward_config')
      .select('default_referrer_code')
      .eq('id', true)
      .maybeSingle();
    const defaultCode = (cfgRow?.default_referrer_code ?? '').toLowerCase().trim();
    if (!defaultCode) {
      await alertDefaultUnavailable('unset');
    } else {
      const { data: codeRows, error: codeErr } = await client
        .rpc('validate_referral_code', { p_code: defaultCode });
      if (codeErr || !codeRows || codeRows.length === 0) {
        // 不存在、已失效、推薦人停權都落在這裡（validate 的職責）。
        await alertDefaultUnavailable('code_not_applicable', { code: defaultCode });
      } else if (codeRows[0].referrer_user_id === user.id) {
        // 預設碼主人就是本人（例如平台帳號自己續約）：自我推薦護欄。
        await alertDefaultUnavailable('self_referral', { code: defaultCode });
      } else {
        const { error: refErr } = await client
          .from('profiles')
          .update({
            referred_by_code: defaultCode,
            referred_by_user_id: codeRows[0].referrer_user_id,
            referred_by_is_default: true,
          })
          .eq('id', user.id);
        if (refErr) {
          await alertDefaultUnavailable('profile_update_failed', { error: refErr.message });
        }
      }
    }
  }

  const config = payuniConfig();

  // 建單先行（原本在加密之後）：tradeNo 會被烘進 EncryptInfo，不能事後
  // 再改——所以撞 payment_orders 唯一鍵（CSPRNG 下機率 ~1/2×10⁹）時要在
  // 「組加密 payload 之前」重產一次再試，拿到最終 tradeNo 才往下走。
  let tradeNo = generateTradeNo();
  {
    const orderRow = () => ({
      user_id: user.id,
      amount: 1200,
      status: 'pending',
      payment_method: 'payuni',
      transaction_id: tradeNo,
      renewal_mode: renewalMode,
    });
    let { error: insertErr } = await client.from('payment_orders').insert(orderRow());
    if (insertErr && insertErr.code === '23505') {
      tradeNo = generateTradeNo();
      ({ error: insertErr } = await client.from('payment_orders').insert(orderRow()));
    }
    if (insertErr) {
      console.error('[prepare] insert payment_orders 失敗:', insertErr);
      return c.json({ success: false, error: '建立訂單失敗' }, 500);
    }
  }

  // 「測試站在線上收真錢」是災難級誤設定：sandbox 只會回模擬結果，
  // 使用者永遠付不成功。把 mode 大聲寫進 log，讓維運能在告警／log 一眼看見。
  if (config.mode === 'sandbox') {
    console.warn(
      '[prepare] ⚠️ PayUni 以 sandbox（測試站）模式建單——付款只會得到模擬結果，正式環境請確認 PAYUNI_SANDBOX 未被設為 true。tradeNo:',
      tradeNo,
    );
  }

  // 雲端環境從 *.supabase.co 網址取 project id；本地 supabase start
  // （http://127.0.0.1:54321）比對不到時直接用該網址當 functions base，
  // 讓本地開發/測試不會在這裡炸掉。
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '');
  const projectId = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1];
  const functionsBase = projectId
    ? `https://${projectId}.supabase.co/functions/v1`
    : `${supabaseUrl}/functions/v1`;

  // 付款期限：3 天後（YYYY-MM-DD，台灣時區）
  const expire = twDayPlusDays(twDayOf(), 3);

  // UPP（整合式支付頁）加密內容
  const encryptData: Record<string, string | number> = {
    MerID: config.merID,
    MerTradeNo: tradeNo,
    TradeAmt: 1200,
    Timestamp: Math.floor(Date.now() / 1000),
    ProdDesc: 'Uknow 年費會員',
    UsrMail: user.email || '',
    ExpireDate: expire,
    NotifyURL: `${functionsBase}/api/webhooks/payuni/notify`,
    // ReturnURL 指向後端（不是前端頁面）——PayUni 導回時會用 POST 帶
    // EncryptInfo/HashInfo（跟 NotifyURL 收到的是同一份交易結果），
    // 後端解密後直接知道當下結果，302 導向前端並帶上 status，
    // 前端不需要再輪詢猜測付款是否成功。
    ReturnURL: `${functionsBase}/api/payuni/return`,
    // 啟用的付款方式（值為 1 代表開啟，PayUni 整合式支付頁會顯示對應按鈕）
    Credit: 1, // 信用卡
    ApplePay: 1, // Apple Pay
    GooglePay: 1, // Google Pay
    SamsungPay: 1, // Samsung Pay
    Lang: 'zh-tw',
  };

  const encryptInfo = await encryptPayUni(encryptData, config.hashKey, config.hashIV);
  const hashInfo = await generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);

  // payment_orders 已在組加密 payload 之前寫入（見上方建單先行區塊；
  // renewal_mode 記錄使用者選的續費模式，process_successful_payment
  // 依它決定效期錨點——效期在付款當下才決定，不信任前端傳日期）。

  return c.json({
    success: true,
    data: {
      MerID: config.merID,
      Version: config.version,
      EncryptInfo: encryptInfo,
      HashInfo: hashInfo,
      apiUrl: config.apiUrl,
      // 讓前端能明確知道這筆是打正式站還是測試站（前端已 log 這個值）。
      // sandbox 一律回傳含「(模擬)」的模擬結果，正式站才會有真實金流。
      mode: config.mode,
      tradeNo,
    },
  });
});

// ============================================================
// GET /payuni/result/:tradeNo
// 前端 polling 查詢付款結果
// ============================================================
app.get('/payuni/result/:tradeNo', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ success: false, error: '未授權' }, 401);

  const tradeNo = c.req.param('tradeNo');
  const fetchOrder = () =>
    sb()
      .from('payment_orders')
      .select('status, transaction_id, completed_at, payuni_response')
      .eq('transaction_id', tradeNo)
      .eq('user_id', user.id)
      .single();

  let { data: order, error } = await fetchOrder();
  if (error || !order) return c.json({ success: false, error: '訂單不存在' }, 404);

  // 自癒：訂單還 pending 但已存有 PayUni 的 SUCCESS 回應（內部處理曾
  // 失敗的卡單，見 migration 0007）→ 當場補完再回傳，使用者在結果頁的
  // 這一次輪詢就能拿到 completed，不用等下一輪。
  if (order.status === 'pending' && order.payuni_response?.Status === 'SUCCESS') {
    const healed = await healPaidPendingOrdersBestEffort(user.id);
    if (healed) {
      const refetched = await fetchOrder();
      if (refetched.data) order = refetched.data;
    }
  }

  // 精簡版續約資訊（renewal-backfill）：PaymentResult 據此判斷「這是
  // 補繳中間筆」（backfillCount > 0 → 顯示進度而非開通輪詢），不必另掛
  // useSubscription()。以查詢當下 DB 的最新訂閱迄日計算剩餘補繳。
  // 型別綁契約 PayuniResultRenewalSchema——欄位增減兩端都會被 TS 抓到。
  let renewal: PayuniResultRenewal | null = null;
  {
    const { data: latestSub } = await sb()
      .from('subscriptions')
      .select('end_date')
      .eq('user_id', user.id)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestSub?.end_date) {
      const plan = backfillPlan(twDayOf(latestSub.end_date), twDayOf(new Date()))!;
      renewal = {
        backfillCount: plan.backfillCount,
        backfillAmount: plan.backfillCount * 1200,
        extendAnchorDate: plan.extendAnchorDay,
        extendEndDate: plan.extendEndDay,
      };
    }
  }

  // orderStatus 只用來決定前端是否要繼續 polling；成功/失敗的實際原因與
  // 明細一律以 payuni（PayUni 原始回傳資料）為準，不再自創詞彙轉換。
  return c.json({
    success: true,
    data: {
      orderStatus: order.status,
      completedAt: order.completed_at,
      payuni: order.payuni_response ?? null,
      // 已付款但尚未收斂成訂閱（例如金額不符待人工）——前端顯示
      // 「開通處理中」而不是把使用者當成沒付錢。
      paidAwaitingActivation: order.status === 'pending' &&
        order.payuni_response?.Status === 'SUCCESS',
      renewal,
    },
  });
});

// ============================================================
// 共用：解析 PayUni 回傳資料並落地寫入 payment_orders。
// NotifyURL webhook 與 ReturnURL 導回端點都呼叫這裡——兩者收到的
// 是同一份加密交易結果，只是到達時間點不同；共用同一套邏輯，
// 並靠 process_successful_payment 內建的「已是 completed 就跳過」
// 判斷，保證誰先到都不會重複執行業務動作。
// ============================================================
// 診斷用：無論後續處理成功或失敗，都盡量把 PayUni 這次的原始回傳資料
// 留在對應的訂單上，讓卡單時能直接從 payment_orders.payuni_response 查
// 出當時收到的內容，不用再靠猜。失敗不拋錯，不影響原本的回傳結果。
// .neq('status','completed')：已完成訂單的 payuni_response 是
// process_successful_payment 原子寫入的權威資料，不能被（幾乎同時到達
// 的另一路通知走到失敗分支時的）過期回應蓋掉。
async function persistRawResponseBestEffort(merTradeNo: string, data: Record<string, string>) {
  try {
    await sb().from('payment_orders')
      .update({ payuni_response: data })
      .eq('transaction_id', merTradeNo)
      .neq('status', 'completed');
  } catch (e) {
    console.error('[persistRawResponseBestEffort]', e);
  }
}

// ============================================================
// 工具：把邊緣函數這端發生的失敗寫進 system_alerts，讓卡單/失敗有
// 地方可查。跟 SQL 那邊的 log_system_alert() 是同一張表，只是這裡是
// TypeScript 端自己失敗時用的——絕不能讓告警本身害呼叫端也失敗。
// ============================================================
async function logSystemAlert(
  source: string,
  context: Record<string, unknown>,
  message = 'edge function alert',
  severity: 'info' | 'warning' | 'error' = 'warning',
) {
  try {
    await sb().from('system_alerts').insert({ source, severity, message, context });
  } catch (e) {
    console.error('[logSystemAlert] failed to persist alert', e);
  }
}

// 常數時間字串比較：對兩邊 SHA-256 摘要做等長 XOR 比對（Web Crypto
// 沒有 timingSafeEqual）。長期靜態共享密鑰的直接 !== 比較是已知的
// timing side-channel 反模式。
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// ============================================================
// 工具：機會性補跑周邊業務邏輯（推薦碼/推薦邊/獎勵/任務進度）。
// best-effort——失敗只記 log，不影響呼叫端的回應。跟排程的
// reconcile-pending-payments 互補，不重複：這裡覆蓋「使用者自己的
// 請求剛好經過某個時機點」，排程覆蓋「完全沒人再碰這筆資料」的情況。
// ============================================================
async function repairOrphanedPaymentsBestEffort(userId: string) {
  try {
    await sb().rpc('repair_orphaned_payments', { p_user_id: userId });
    // 任務續約（claim）發獎的自癒：與付款路徑對稱，補回 cascade 當下失敗、
    // warning-only 沒寫成的上線續約獎勵。同樣 best-effort、冪等。
    await sb().rpc('repair_orphaned_claim_rewards', { p_user_id: userId });
    // fresh 清空帳本的自癒：補回付款當下沖銷失敗的 ledger_reset 列，
    // 金額取失敗時的告警快照（不是現值）。同樣 best-effort、冪等。
    await sb().rpc('repair_orphaned_forfeitures', { p_user_id: userId });
  } catch (e) {
    console.error('[repairOrphanedPaymentsBestEffort]', e);
  }
}

// ============================================================
// 工具：自癒卡單訂單（pending 但 payuni_response 已存 SUCCESS，見
// migration 0007）。best-effort——失敗只記 log；回傳是否真的補完了
// 任何訂單，讓呼叫端知道要不要重讀最新狀態。
// ============================================================
async function healPaidPendingOrdersBestEffort(userId?: string): Promise<boolean> {
  try {
    const { data, error } = await sb().rpc('complete_paid_pending_orders', {
      p_user_id: userId ?? null,
    });
    if (error) {
      console.error('[healPaidPendingOrdersBestEffort]', error);
      return false;
    }
    return (data?.completed_count ?? 0) > 0;
  } catch (e) {
    console.error('[healPaidPendingOrdersBestEffort]', e);
    return false;
  }
}

async function resolveOrderFromPayUni(
  data: Record<string, string>,
): Promise<{ ok: true; status: 'SUCCESS' | 'FAILED' } | { ok: false; message: string }> {
  const { Status, MerTradeNo, TradeNo } = data;

  if (!MerTradeNo) {
    return { ok: false, message: 'missing MerTradeNo' };
  }

  // 付款失敗：記錄但視為「處理成功」（呼叫端不需重試）。
  // payuni_response 存下完整解密資料，讓前端能顯示 PayUni 實際回傳的
  // ResCode/ResCodeMsg/Message，不用我們自己編一套錯誤訊息。
  // .eq('status', 'pending')：避免這筆訂單其實已經被（幾乎同時到達的）
  // 另一個真正成功的通知處理完成後，被對帳/重試呼叫的過期失敗結果
  // 誤蓋回 failed。
  // .or(...)：訂單上已存有 SUCCESS 回應時（= 卡單的復原資料來源，見
  // migration 0007），遲到的失敗結果不得覆蓋——否則會悄悄解除一位
  // 真的付了錢的使用者的自癒資格。
  if (Status !== 'SUCCESS') {
    await sb().from('payment_orders')
      .update({ status: 'failed', payuni_response: data })
      .eq('transaction_id', MerTradeNo)
      .eq('status', 'pending')
      .or('payuni_response.is.null,payuni_response->>Status.neq.SUCCESS');
    return { ok: true, status: 'FAILED' };
  }

  // 找訂單 + 冪等性
  const { data: order } = await sb()
    .from('payment_orders')
    .select('id, user_id, status')
    .eq('transaction_id', MerTradeNo)
    .single();

  if (!order) {
    await persistRawResponseBestEffort(MerTradeNo, data);
    return { ok: false, message: 'order not found' };
  }
  if (order.status === 'completed') {
    return { ok: true, status: 'SUCCESS' };
  }

  // 金額驗證
  if (data.TradeAmt && Number(data.TradeAmt) !== 1200) {
    await persistRawResponseBestEffort(MerTradeNo, data);
    return { ok: false, message: 'amount mismatch' };
  }

  // 呼叫原子性付款處理函數
  const { error } = await sb().rpc('process_successful_payment', {
    p_user_id: order.user_id,
    p_trade_no: MerTradeNo,
    p_transaction_id: TradeNo || MerTradeNo,
    p_payuni_response: data,
  });

  if (error) {
    await persistRawResponseBestEffort(MerTradeNo, data);
    // 付款處理失敗是 error 級事件（不是 warning）：PayUni 已回結果、
    // 我方入帳流程炸掉，必須人工介入。
    await logSystemAlert(
      'resolveOrderFromPayUni',
      { merTradeNo: MerTradeNo, error: error.message },
      '付款處理失敗，需人工介入',
      'error',
    );
    return { ok: false, message: error.message };
  }

  // 機會性補跑：如果這次呼叫的周邊邏輯（推薦碼/獎勵/任務進度）因為
  // 任何原因沒完全跑完，這裡立刻再試一次，不用等使用者剛好回來看
  // profile 或排程掃到。
  await repairOrphanedPaymentsBestEffort(order.user_id);

  return { ok: true, status: 'SUCCESS' };
}

// ============================================================
// 對帳：PayUni webhook 沒送達時，訂單會永遠卡在 pending。定期掃描
// 超過門檻時間還是 pending 的訂單，主動問 PayUni 真實狀態，透過既有
// 的 resolveOrderFromPayUni 走同一套處理路徑（不重複實作業務邏輯）。
//
// 核心迴圈抽成獨立、可注入依賴的函數，方便測試（也方便之後真的接上
// PayUni 查詢 API 時只換掉 queryFn 這個參數，不用動迴圈本身）。
// ============================================================
type QueryResult =
  | { stillProcessing: true }
  | { stillProcessing: false; data: Record<string, string> };

export async function reconcilePendingOrders(
  client: any,
  queryFn: (merTradeNo: string) => Promise<QueryResult>,
  resolveFn: typeof resolveOrderFromPayUni,
  opts: { thresholdMinutes: number; limit: number; expireAfterDays?: number },
): Promise<
  { checked: number; resolved: number; stillPending: number; expired: number; queryErrors: number }
> {
  const cutoff = new Date(Date.now() - opts.thresholdMinutes * 60_000).toISOString();
  // 殭屍單終態門檻：建單後棄付的訂單 PayUni 永遠查無此單（stillProcessing），
  // 沒有終態會累積在掃描視窗最前端（created_at ascending + limit），把真正
  // 需要對帳的卡單餓死。超過 PayUni ExpireDate（3 天）再留一天緩衝後仍查
  // 無結果 → 標 'expired'。已存 SUCCESS 存檔的卡單不在掃描範圍（下方 .or
  // 過濾），永不會被誤標。
  const expireCutoffMs = Date.now() - (opts.expireAfterDays ?? 4) * 24 * 60 * 60_000;

  // .or(...)：已存有 SUCCESS 回應的卡單走 complete_paid_pending_orders
  // 自癒（reconcile 路由的 heal pre-pass），這裡只處理「完全沒有存檔
  // 判決」的訂單——金額不符的卡單已有自己的去重告警，不該每輪對帳都
  // 再被 queryPayUniTradeStatus 的佔位錯誤重複告警一次。
  const { data: stuck, error } = await client
    .from('payment_orders')
    .select('id, transaction_id, user_id, created_at')
    .eq('status', 'pending')
    .or('payuni_response.is.null,payuni_response->>Status.neq.SUCCESS')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(opts.limit);

  if (error) throw new Error(`reconcilePendingOrders: 查詢 pending 訂單失敗: ${error.message}`);

  const summary = {
    checked: stuck?.length ?? 0,
    resolved: 0,
    stillPending: 0,
    expired: 0,
    queryErrors: 0,
  };

  for (const order of stuck ?? []) {
    try {
      const result = await queryFn(order.transaction_id!);
      if (result.stillProcessing) {
        if (order.created_at && new Date(order.created_at).getTime() < expireCutoffMs) {
          const { error: expireErr } = await client
            .from('payment_orders')
            .update({ status: 'expired' })
            .eq('id', order.id)
            .eq('status', 'pending');
          if (expireErr) {
            summary.queryErrors++;
            await logSystemAlert('reconcile-pending-payments', {
              tradeNo: order.transaction_id,
              error: `標記 expired 失敗: ${expireErr.message}`,
            });
          } else {
            summary.expired++;
          }
        } else {
          summary.stillPending++;
        }
        continue;
      }
      const outcome = await resolveFn(result.data);
      if (outcome.ok) {
        summary.resolved++;
      } else {
        await logSystemAlert('reconcile-pending-payments', {
          tradeNo: order.transaction_id,
          message: outcome.message,
        });
      }
    } catch (e) {
      summary.queryErrors++;
      await logSystemAlert('reconcile-pending-payments', {
        tradeNo: order.transaction_id,
        error: String(e),
      });
    }
  }

  return summary;
}

// PayUni server-to-server 交易查詢（https://docs.payuni.com.tw 的
// 交易查詢 API）。加密/雜湊格式與 UPP 相同（crypto.ts），payload 帶
// MerTradeNo。防禦性設計：
//   * 只有明確「已付款」（TradeStatus=1）才回 SUCCESS 交給
//     resolveOrderFromPayUni（會走 process_successful_payment，
//     付款時點錨定 PayTime/AuthDay）。
//   * 明確失敗/取消（2、3）回非 SUCCESS → 訂單標 failed。
//   * 查無此單、未付款、未知狀態一律 stillProcessing——不確定的資料
//     絕不拿來標記訂單，寧可下一輪再查。
// ⚠️ 欄位名稱以 PayUni 官方文件為準；上線前先在 sandbox 用
// workflow_dispatch 手動驗證一輪，確認無誤再打開 cron。
async function queryPayUniTradeStatus(merTradeNo: string): Promise<QueryResult> {
  const config = payuniConfig();

  const encryptInfo = await encryptPayUni(
    {
      MerID: config.merID,
      Timestamp: Math.floor(Date.now() / 1000),
      MerTradeNo: merTradeNo,
    },
    config.hashKey,
    config.hashIV,
  );
  const hashInfo = await generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);

  const res = await fetch(config.queryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      MerID: config.merID,
      Version: config.version,
      EncryptInfo: encryptInfo,
      HashInfo: hashInfo,
    }),
  });
  if (!res.ok) throw new Error(`PayUni 查詢 HTTP ${res.status}`);

  const raw = await res.json().catch(() => null) as Record<string, string> | null;
  if (!raw) throw new Error('PayUni 查詢回應不是 JSON');

  // 查詢層失敗（例如查無交易）：不代表付款失敗，只代表這輪還無法判定。
  if (raw.Status !== 'SUCCESS' || !raw.EncryptInfo) {
    return { stillProcessing: true };
  }

  const decrypted = Object.fromEntries(
    new URLSearchParams(await decryptPayUni(raw.EncryptInfo, config.hashKey, config.hashIV)),
  );

  // 結果可能是 Result（JSON 陣列字串）或平鋪欄位——兩種都接。
  let trade: Record<string, unknown> = decrypted;
  if (decrypted.Result) {
    try {
      const list = JSON.parse(decrypted.Result);
      if (Array.isArray(list) && list.length) {
        trade = list.find((t: any) => t?.MerTradeNo === merTradeNo) ?? list[0];
      }
    } catch { /* Result 不是 JSON → 沿用平鋪欄位 */ }
  }

  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(trade)) flat[k] = String(v ?? '');
  const tradeStatus = flat.TradeStatus ?? '';

  if (tradeStatus === '1') {
    return { stillProcessing: false, data: { ...flat, Status: 'SUCCESS' } };
  }
  if (tradeStatus === '2' || tradeStatus === '3') {
    // 付款失敗 / 付款取消 → 讓 resolveOrderFromPayUni 標 failed
    return { stillProcessing: false, data: { ...flat, Status: `FAILED_${tradeStatus}` } };
  }
  return { stillProcessing: true };
}

// ============================================================
// POST /internal/reconcile-pending-payments
// 給排程呼叫（見 .github/workflows/reconcile-payments.yml），不是給
// 使用者用——用共用密鑰驗證，不是 JWT。
// ============================================================
const RECONCILE_THRESHOLD_MINUTES = Number(Deno.env.get('RECONCILE_THRESHOLD_MINUTES') ?? '20');
const RECONCILE_BATCH_LIMIT = 50;

app.post('/internal/reconcile-pending-payments', async (c) => {
  const secret = Deno.env.get('RECONCILE_SECRET');
  if (!secret || !(await timingSafeEqual(c.req.header('x-internal-secret') ?? '', secret))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  try {
    // 先跑自癒 pass：把「已存有 PayUni SUCCESS 回應」的卡單直接收斂成
    // 訂閱（migration 0007），不需要 PayUni 查詢 API。補完的訂單會離開
    // pending，下面的掃描自然不會再碰到。
    const { data: healSummary, error: healError } = await sb()
      .rpc('complete_paid_pending_orders', { p_user_id: null });
    if (healError) console.error('[reconcile-pending-payments] heal pass 失敗:', healError);

    const summary = await reconcilePendingOrders(
      sb(),
      queryPayUniTradeStatus,
      resolveOrderFromPayUni,
      { thresholdMinutes: RECONCILE_THRESHOLD_MINUTES, limit: RECONCILE_BATCH_LIMIT },
    );
    return c.json({ success: true, data: { ...summary, heal: healSummary ?? null } });
  } catch (e) {
    console.error('[reconcile-pending-payments]', e);
    return c.json({ success: false, error: String(e) }, 500);
  }
});

// ============================================================
// 解密並驗證 PayUni form-data（notify webhook 與 return 導回共用）
// ============================================================
async function decryptPayUniFormBody(
  body: Record<string, string>,
  config: ReturnType<typeof payuniConfig>,
): Promise<{ ok: true; data: Record<string, string> } | { ok: false; message: string }> {
  const { EncryptInfo, HashInfo } = body;
  if (!EncryptInfo || !HashInfo) {
    return { ok: false, message: 'missing params' };
  }

  if (await generatePayUniHash(EncryptInfo, config.hashKey, config.hashIV) !== HashInfo) {
    return { ok: false, message: 'hash mismatch' };
  }

  try {
    const data = Object.fromEntries(
      new URLSearchParams(await decryptPayUni(EncryptInfo, config.hashKey, config.hashIV)),
    );
    return { ok: true, data };
  } catch (e) {
    return { ok: false, message: `decrypt error: ${e}` };
  }
}

// ============================================================
// POST /webhooks/payuni/notify
// PayUni 付款成功回調（form-data，不需 JWT）
// ============================================================
app.post('/webhooks/payuni/notify', async (c) => {
  let config: ReturnType<typeof payuniConfig>;
  try {
    config = payuniConfig();
  } catch {
    return c.json({ Status: 'FAILED', Message: 'config error' });
  }

  let body: Record<string, string>;
  try {
    const raw = await c.req.parseBody();
    body = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  } catch {
    return c.json({ Status: 'FAILED', Message: 'parse error' });
  }

  const decrypted = await decryptPayUniFormBody(body, config);
  if (!decrypted.ok) {
    console.error('[notify]', decrypted.message);
    return c.json({ Status: 'FAILED', Message: decrypted.message });
  }

  console.log('[notify] MerTradeNo:', decrypted.data.MerTradeNo, 'Status:', decrypted.data.Status);

  const result = await resolveOrderFromPayUni(decrypted.data);
  if (!result.ok) {
    console.error('[notify]', result.message, JSON.stringify(decrypted.data));
    return c.json({ Status: 'FAILED', Message: result.message });
  }

  console.log('[notify] ✅ 處理完成:', decrypted.data.MerTradeNo, result.status);
  return c.json({ Status: 'SUCCESS' });
});

// ============================================================
// POST /payuni/return
// 使用者付款完成後，PayUni 用瀏覽器導回這裡（form-data POST，
// 帶的 EncryptInfo/HashInfo 跟 NotifyURL 收到的是同一份交易結果）。
// 解密後立刻知道當下的付款結果，302 導向前端並帶上 status，
// 前端不需要再等待/輪詢猜測付款是否成功。
// ============================================================
app.post('/payuni/return', async (c) => {
  const frontendUrl = Deno.env.get('FRONTEND_URL')!.replace(/\/$/, '');
  const fallbackRedirect = (tradeNo?: string) =>
    c.redirect(`${frontendUrl}/payment/result${tradeNo ? `?tradeNo=${tradeNo}` : ''}`, 302);

  let config: ReturnType<typeof payuniConfig>;
  try {
    config = payuniConfig();
  } catch {
    return fallbackRedirect();
  }

  let body: Record<string, string>;
  try {
    const raw = await c.req.parseBody();
    body = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  } catch {
    return fallbackRedirect();
  }

  const decrypted = await decryptPayUniFormBody(body, config);
  if (!decrypted.ok) {
    console.error('[return]', decrypted.message);
    // 解密/驗簽失敗時（此時還不知道 tradeNo）不帶 status，
    // 讓前端 fallback 讀 DB——NotifyURL webhook 仍會是這筆訂單最終的真相來源。
    return fallbackRedirect();
  }

  const tradeNo = decrypted.data.MerTradeNo;
  console.log('[return] MerTradeNo:', tradeNo, 'Status:', decrypted.data.Status);

  // 解密成功的當下就已確知 PayUni 的付款結果——status 一律取自 PayUni
  // 的原話，跟我們內部處理成不成功「脫鉤」。過去內部處理失敗會走
  // fallbackRedirect 把已知的 SUCCESS 丟掉，前端只好自己查 DB 又查到
  // 卡在 pending 的訂單，形成付了錢卻進不了會員中心的死循環。內部失敗
  // 只記 log + alert（resolveOrderFromPayUni 內已寫入），卡單的收斂交給
  // 自癒機制（persistRawResponseBestEffort 存下的回應就是復原資料來源）。
  const payuniStatus = decrypted.data.Status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';

  const result = await resolveOrderFromPayUni(decrypted.data);
  if (!result.ok) {
    console.error('[return]', result.message, JSON.stringify(decrypted.data));
  }

  return c.redirect(`${frontendUrl}/payment/result?tradeNo=${tradeNo}&status=${payuniStatus}`, 302);
});

// ============================================================
// 工具：台灣時間目前月份字串 "YYYY-MM"
// ============================================================
function twCurrentMonth(): string {
  return twMonthKey();
}

// ============================================================
// GET /subscriptions/status
// RewardDashboard：查訂閱狀態
// ============================================================
app.get('/subscriptions/status', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const [{ data: acct }, { data: subs }, pendingWithdrawal] = await Promise.all([
    sb().from('user_account_status')
      .select('status, end_date')
      .eq('user_id', user.id)
      .single(),
    // 訂閱列表（新→舊）——[0] 供 SubscriptionStatusCard 顯示「訂閱週期」。
    // 過去只回 activeUntil，前端卡片的 currentPeriodStart/End 永遠拿不到
    // 值，會員在儀表板上根本看不到自己的到期日（領獎延長會籍後也就
    // 「看不到」有延長）。source_payment_order_id 供補繳簽名判定取對應
    // 訂單的付款時點；取多筆是為了往前走出「本輪已付幾筆」（A15）。
    sb().from('subscriptions')
      .select('start_date, end_date, source_payment_order_id')
      .eq('user_id', user.id)
      .order('end_date', { ascending: false })
      .limit(40),
    // A16 的前端對應：與 /payuni/prepare 守衛共用同一 helper（單一真相）。
    hasPendingWithdrawal(user.id),
  ]);

  // 續約資訊（renewal-backfill）：從未訂閱過 = null。日期算術與
  // process_successful_payment 的 extend 錨點同語意（backfillPlan 是
  // compute_subscription_period 的鏡射，最終寫進 DB 的值一律出自 SQL）。
  const sub = subs?.[0] ?? null;
  let renewal: Record<string, unknown> | null = null;
  if (sub?.end_date) {
    const plan = backfillPlan(twDayOf(sub.end_date), twDayOf(new Date()))!;

    const srcOrderIds = (subs ?? [])
      .map((s) => s.source_payment_order_id)
      .filter((id): id is string => !!id);
    const [{ data: srcOrders }, { data: bal }, { data: tp }] = await Promise.all([
      srcOrderIds.length > 0
        ? sb().from('payment_orders')
          .select('id, completed_at')
          .in('id', srcOrderIds)
        : Promise.resolve({ data: [] as { id: string; completed_at: string | null }[] }),
      sb().from('reward_balances').select('available').eq('user_id', user.id).maybeSingle(),
      sb().from('task_progress').select('total_referrals').eq('user_id', user.id).maybeSingle(),
    ]);

    // 補繳付款的獨有特徵：付款當下算出的效期已在過去。正常續約/首購的
    // end_date 恆在付款時點之後，永遠是 false（AC-8：老會員自然再到期
    // 不得被誤判成「本輪已補繳」）。從最新一筆往回走，連續帶著這個簽名
    // 的筆數 = 本輪已付補繳筆數（A15 對話框要唸出具體數字）；一遇到
    // 非補繳筆（那是上一輪的自然效期）就停。
    const completedAtById = new Map(
      (srcOrders ?? []).map((o) => [o.id, o.completed_at]),
    );
    let paidBackfillCount = 0;
    for (const s of subs ?? []) {
      const completedAt = s.source_payment_order_id
        ? completedAtById.get(s.source_payment_order_id)
        : null;
      const isBackfill = !!(
        completedAt &&
        new Date(s.end_date).getTime() < new Date(completedAt).getTime()
      );
      if (!isBackfill) break;
      paidBackfillCount++;
    }
    const hasPaidAnyBackfill = paidBackfillCount > 0;

    renewal = {
      extendAnchorDate: plan.extendAnchorDay,
      extendEndDate: plan.extendEndDay,
      backfillCount: plan.backfillCount,
      backfillAmount: plan.backfillCount * 1200,
      backfillFinalEndDate: plan.backfillFinalEndDay,
      expiredForMonths: plan.expiredForMonths,
      hasPaidAnyBackfill,
      paidBackfillCount,
      paidBackfillAmount: paidBackfillCount * 1200,
      freshForfeitPoints: Math.max(bal?.available ?? 0, 0),
      freshForfeitReferrals: tp?.total_referrals ?? 0,
    };
  }

  return c.json({
    success: true,
    data: {
      hasSubscription: acct?.status === 'active',
      status: acct?.status ?? 'expired',
      activeUntil: acct?.end_date ?? null,
      currentPeriodStart: sub?.start_date ?? null,
      currentPeriodEnd: sub?.end_date ?? null,
      renewal,
      hasPendingWithdrawal: pendingWithdrawal,
    },
  });
});

// ============================================================
// 會員身分核身（member-verify-qr）——線下 admin 掃會員動態短效碼確認身分＋會籍。
// 與推薦碼完全分離：推薦碼是公開可分享的，綁身分＝可冒充；這裡用簽章短效 token。
// ============================================================

/** 核身碼短效期（秒）。現場出示→掃描的時間窗；集中一處便於日後調整。 */
const MEMBER_VERIFY_TTL_SECONDS = 90;

// GET /members/verify-token —— 會員自取「身分核身」短效碼（登入會員本人）。
app.get('/members/verify-token', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  try {
    const now = Date.now();
    const token = await signMemberToken(user.id, MEMBER_VERIFY_TTL_SECONDS, now);
    const expiresAt = new Date(now + MEMBER_VERIFY_TTL_SECONDS * 1000).toISOString();
    return c.json(
      { success: true, data: { token, expiresAt } } satisfies MemberVerifyTokenResponse,
    );
  } catch (e) {
    // 缺 MEMBER_TOKEN_SECRET → fail-closed（member-token.ts 拋錯），明確 500，不簽空鑰。
    console.error('[members/verify-token] 簽發失敗（可能缺 MEMBER_TOKEN_SECRET）:', e);
    return c.json({ success: false, error: { message: '系統設定錯誤，暫時無法產生核身碼' } }, 500);
  }
});

// POST /admin/members/verify —— admin 掃會員核身碼：驗簽＋查會籍＋寫稽核＋回身分。
// 用 POST（非 GET）因為有稽核寫入：GET 語意上可被自動重試而重複寫入稽核。
// 守門：requireAuth + isAdminUser（本專案逐路由手貼；已登記進 admin-gate.test 的 ADMIN_ROUTES）。
app.post('/admin/members/verify', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }
  const token = typeof body?.token === 'string' ? body.token : '';

  let verified: VerifyMemberTokenResult;
  try {
    verified = await verifyMemberToken(token, Date.now());
  } catch (e) {
    console.error('[admin/members/verify] 驗章失敗（可能缺 MEMBER_TOKEN_SECRET）:', e);
    return c.json({ success: false, error: { message: '系統設定錯誤' } }, 500);
  }

  if (!verified.ok) {
    // token 過期/竄改/格式錯——與「會籍 expired」是不同語意，前端需區分顯示，
    // 別讓店家把「碼過期」誤讀成「這個人會籍過期」。
    const message = verified.reason === 'expired' ? '核身碼已過期，請對方重新出示' : '核身碼無效';
    return c.json({ success: false, error: { code: `token_${verified.reason}`, message } }, 400);
  }

  const memberId = verified.memberId;
  const [{ data: profile }, { data: acct }] = await Promise.all([
    sb().from('profiles').select('name, suspended_at').eq('id', memberId).maybeSingle(),
    sb().from('user_account_status').select('status, end_date').eq('user_id', memberId)
      .maybeSingle(),
  ]);

  if (!profile) {
    // token 有效但會員已被刪除（90 秒窗內的邊界）。
    return c.json({ success: false, error: { code: 'not_found', message: '查無此會員' } }, 404);
  }

  const { status } = deriveNodeStatus(acct, profile.suspended_at ?? null);

  // 稽核 fail-closed：寫不進去就擋下核身（回 5xx 要求重試），保證每次成功核身都有紀錄。
  const { error: auditErr } = await sb().from('member_verify_logs').insert({
    admin_id: user.id,
    member_id: memberId,
    result: 'ok',
  });
  if (auditErr) {
    console.error('[admin/members/verify] 稽核寫入失敗，拒絕回應（fail-closed）:', auditErr);
    return c.json({ success: false, error: { message: '核身暫時無法完成，請重試' } }, 500);
  }

  return c.json(
    {
      success: true,
      data: {
        displayName: profile.name ?? '',
        status,
        activeUntil: acct?.end_date ?? null,
      },
    } satisfies MemberVerifyResponse,
  );
});

// ============================================================
// GET /rewards
// RewardDashboard：獎勵餘額
// ============================================================
app.get('/rewards', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  // 單一 SSOT 讀取（get_reward_summary，migration 0718 0101）：
  // 帳本語意下申請提領當下即扣款，available 不需要再另外減 pending。
  // 不回 lastUpdated 之類的非決定性欄位——同樣的資料必須產生同樣的
  // body，ETag/304 條件請求才有意義（見 CORS 區塊下的 etag middleware）。
  const { data, error } = await sb().rpc('get_reward_summary', { p_user_id: user.id });
  if (error || !data) {
    console.error('[rewards] get_reward_summary error:', error);
    return c.json({ success: false, error: '無法取得獎勵資料' }, 500);
  }

  return c.json({
    success: true,
    data: {
      availableRewards: Math.max(0, data.available),
      pendingRewards: data.pending,
      withdrawnRewards: data.withdrawn,
      totalEarned: data.total_earned,
      hasWithdrawnToday: data.has_withdrawn_today,
    },
  });
});

// ============================================================
// GET /rewards/points-preview
// 領獎/提領三步驟對話框的第 2 步預覽——與 GET /rewards 讀同一個
// SSOT（get_reward_summary），兩邊永遠不會不同調。
// ============================================================
app.get('/rewards/points-preview', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const { data, error } = await sb().rpc('get_reward_summary', { p_user_id: user.id });
  if (error || !data) {
    console.error('[points-preview] get_reward_summary error:', error);
    return c.json({ success: false, error: '無法取得點數資料' }, 500);
  }

  return c.json({
    success: true,
    data: {
      currentAvailable: Math.max(0, data.available),
      currentTotal: data.total_earned,
      currentPending: data.pending,
      currentWithdrawn: data.withdrawn,
    },
  });
});

// ============================================================
// GET /rewards/withdrawals
// RewardDashboard：提領記錄
// ============================================================
app.get('/rewards/withdrawals', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const { data: rows, error: listErr } = await sb()
    .from('withdrawals')
    .select('*')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false });
  // 同 admin 列表：會員的提領紀錄是金流資料，「查詢失敗」不得偽裝成
  // 「沒有提領紀錄」的空 200。
  if (listErr) {
    console.error('[rewards/withdrawals] 查詢失敗:', listErr);
    return c.json({ error: { message: '查詢提領紀錄失敗' } }, 500);
  }

  // 事件表一次 in 查詢後在應用層 group（同 /admin/withdrawals）。會員端只
  // 取得出兩個衍生值，不回整條 events——那條歷史裡有 bank_ref 之類的作業
  // 欄位，是 admin 的作業紀錄，不是會員該讀的東西。
  const withdrawalIds = (rows ?? []).map((w: any) => w.id);
  const eventMap: Record<string, any[]> = {};
  if (withdrawalIds.length) {
    const { data: evts } = await sb().from('withdrawal_events')
      .select('withdrawal_id, to_status, note, admin_id, created_at')
      .in('withdrawal_id', withdrawalIds)
      .order('created_at');
    for (const e of evts ?? []) (eventMap[e.withdrawal_id] ??= []).push(e);
  }

  const withdrawals = (rows ?? []).map((w: any) => {
    const events = eventMap[w.id] ?? [];
    // 退件理由必須到得了會員面前：看不到理由的人只會重送一模一樣的東西，
    // 再被退一次——admin 多做一次工、會員多等一輪，兩邊都沒拿到資訊。
    // 主表的 note 自 20260802000004 起 vestigial，事件表最新一筆才是現況。
    const latest = events.length ? events[events.length - 1] : null;
    // 「誰結的案」看最後一筆 completed 事件：admin_id 非 null = 管理員代為
    // 結案。讓會員以為自己按過查收，是規劃 §6 開放問題 #2 明確否決的做法。
    const lastCompleted = [...events].reverse().find((e) => e.to_status === 'completed');
    return {
      id: w.id,
      userId: w.user_id,
      amount: w.amount,
      fee: w.fee,
      status: w.status,
      note: latest?.note ?? null,
      completedByAdmin: lastCompleted ? lastCompleted.admin_id !== null : false,
      requestedAt: w.requested_at,
      processedAt: w.processed_at,
      completedAt: w.completed_at,
    };
  });

  return c.json({ success: true, data: { withdrawals } });
});

// ============================================================
// POST /rewards/verify-id
// 提領第 3 步的身分證即時驗證（WithdrawalProcess 自動觸發）
// ============================================================
app.post('/rewards/verify-id', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }

  if (await verifyNationalId(sb(), user.id, body?.idNumber ?? '')) {
    return c.json({ success: true, message: '驗證成功' });
  }
  return c.json({ success: false, message: '身分證字號不正確' }, 400);
});

// ============================================================
// GET /rewards/id-photos
// 已上傳的身分證照片（私有 bucket，回 1 小時簽名網址）
// ============================================================
app.get('/rewards/id-photos', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const client = sb();
  const { data: profile } = await client
    .from('profiles')
    .select('id_card_front_path, id_card_back_path, id_verification_status, id_reject_reason')
    .eq('id', user.id)
    .single();

  const sign = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data } = await client.storage.from('id-cards').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  return c.json({
    success: true,
    data: {
      frontUrl: await sign(profile?.id_card_front_path ?? null),
      backUrl: await sign(profile?.id_card_back_path ?? null),
      // 退回理由必須到得了會員面前——看不到理由就只會重送一模一樣的照片。
      verificationStatus: profile?.id_verification_status ?? 'none',
      rejectReason: profile?.id_reject_reason ?? null,
    },
  });
});

// ============================================================
// POST /rewards/upload-id-photos
// 上傳身分證正反面（multipart；固定路徑 {userId}/front.jpg、back.jpg
// 覆寫——證件照跨提領重用，下次提領自動帶入）
// ============================================================
app.post('/rewards/upload-id-photos', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: { message: '未授權' } }, 401);

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { message: '解析上傳資料失敗' } }, 400);
  }

  const front = formData.get('idCardFront') as File | null;
  const back = formData.get('idCardBack') as File | null;
  if (!front && !back) {
    return c.json({ error: { message: '未提供檔案' } }, 400);
  }

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  for (const f of [front, back]) {
    if (!f) continue;
    if (!ALLOWED.includes(f.type)) {
      return c.json({ error: { message: '只支援 JPG、PNG、WEBP 格式' } }, 400);
    }
    if (f.size > 5 * 1024 * 1024) return c.json({ error: { message: '檔案不得超過 5MB' } }, 400);
  }

  const client = sb();
  const upload = async (file: File, side: 'front' | 'back'): Promise<string> => {
    const path = `${user.id}/${side}.jpg`;
    const { error } = await client.storage
      .from('id-cards')
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
    if (error) throw new Error(error.message);
    return path;
  };

  try {
    const patch: Record<string, string | null> = {};
    let frontPath: string | null = null;
    let backPath: string | null = null;
    if (front) {
      frontPath = await upload(front, 'front');
      patch.id_card_front_path = frontPath;
    }
    if (back) {
      backPath = await upload(back, 'back');
      patch.id_card_back_path = backPath;
    }

    // 這次上傳後是否「雙面齊全」——要把既有路徑算進來,會員常分兩次補齊。
    // 只有齊全才進審核佇列:沒交齊卻顯示「審核中」,會員會以為在等 admin,
    // 實際上是他自己還沒傳完;admin 那邊也會收到一筆缺圖的送審紀錄。
    const { data: current } = await client
      .from('profiles')
      .select('id_card_front_path, id_card_back_path')
      .eq('id', user.id)
      .single();
    const finalFront = frontPath ?? current?.id_card_front_path ?? null;
    const finalBack = backPath ?? current?.id_card_back_path ?? null;
    if (finalFront && finalBack) {
      patch.id_verification_status = 'pending';
      // 換照片＝重新送審,上一輪的痕跡要一起清掉:
      //   * 退回理由——否則會員會在「審核中」狀態下還看到舊的退件說明
      //   * 審核時間——否則 admin 的審核佇列會顯示「已於 X 時審核」,
      //     但那筆其實還沒被看過。在金流相鄰的稽核資料裡,一個會說謊的
      //     時間戳比沒有時間戳更糟:沒有只是資訊不足,說謊會讓人據以決策。
      patch.id_reject_reason = null;
      patch.id_verified_at = null;
      // 送審時刻——審核佇列依它排「等最久的」（B2 的裁決結果）。換照片＝
      // 重新送審，所以這裡是覆寫而不是「只在第一次設」：重傳的人重新排隊，
      // 不該帶著上一輪的等待時間插到最前面。
      patch.id_submitted_at = new Date().toISOString();
    }

    await client.from('profiles').update(patch).eq('id', user.id);

    return c.json({ success: true, data: { frontPath, backPath } });
  } catch (err) {
    console.error('[upload-id-photos] Storage error:', err);
    return c.json({ error: { message: err instanceof Error ? err.message : '上傳失敗' } }, 500);
  }
});

// ============================================================
// POST /rewards/withdraw
// 申請提領——業務規則（金額級距/單日上限/一天一次/餘額/會籍/證件照）
// 全在 SQL 函數 request_withdrawal（migration 0718 0101）內原子執行。
// ============================================================
app.post('/rewards/withdraw', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: { message: '未授權' } }, 401);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }

  const amount = Number(body?.amount);
  const idNumber = (body?.idNumber ?? '').trim();
  const bankCode = (body?.bankCode ?? '').trim();
  const bankAccount = (body?.bankAccount ?? '').replace(/-/g, '').trim();

  if (!Number.isInteger(amount) || amount <= 0) {
    return c.json({ success: false, error: { message: '提領金額不正確' } }, 400);
  }
  if (!/^\d{3,4}$/.test(bankCode)) {
    return c.json({ success: false, error: { message: '銀行代碼格式不正確' } }, 400);
  }
  if (!/^\d{10,16}$/.test(bankAccount)) {
    return c.json({ success: false, error: { message: '銀行帳號格式不正確' } }, 400);
  }

  const client = sb();
  if (!(await verifyNationalId(client, user.id, idNumber))) {
    return c.json({ success: false, error: { message: '身分證字號驗證失敗' } }, 400);
  }

  const { data, error } = await client.rpc('request_withdrawal', {
    p_user_id: user.id,
    p_amount: amount,
    p_bank_code: bankCode,
    p_bank_account: bankAccount,
  });

  if (error) {
    console.error('[withdraw] rpc error:', error);
    return c.json({ success: false, error: { message: '提領申請失敗，請稍後再試' } }, 500);
  }
  if (!data?.success) {
    const status = data?.error_code === 'subscription_invalid' || data?.error_code === 'not_joined'
      ? 403
      : 400;
    return c.json({ success: false, error: { message: data?.message ?? '提領申請失敗' } }, status);
  }

  return c.json({
    success: true,
    data: {
      withdrawalId: data.withdrawal_id,
      status: data.status,
      amount: data.amount,
      fee: data.fee,
      requestedAt: data.requested_at,
    },
  });
});

// ============================================================
// POST /rewards/withdrawals/:id/confirm
// 使用者「查收」確認（awaiting_collection → completed）
// ============================================================
app.post('/rewards/withdrawals/:id/confirm', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch { /* 空 body */ }

  const client = sb();
  if (!(await verifyNationalId(client, user.id, body?.idNumber ?? ''))) {
    return c.json({ success: false, error: { message: '身分證字號驗證失敗' } }, 400);
  }

  const { data, error } = await client.rpc('confirm_withdrawal_collection', {
    p_user_id: user.id,
    p_withdrawal_id: c.req.param('id'),
  });

  if (error) {
    console.error('[confirm-collection] rpc error:', error);
    return c.json({ success: false, error: { message: '查收確認失敗，請稍後再試' } }, 500);
  }
  if (!data?.success) {
    const status = data?.error_code === 'not_found'
      ? 404
      : data?.error_code === 'forbidden'
      ? 403
      : 400;
    return c.json({ success: false, error: { message: data?.message ?? '查收確認失敗' } }, status);
  }

  return c.json({
    success: true,
    data: {
      withdrawalId: c.req.param('id'),
      status: data.status,
      completedAt: data.completed_at ?? null,
    },
  });
});

// ============================================================
// GET /rewards/history
// 獎勵明細（reward_transactions_with_balance —— 見 migration 0718 0003）
//
// 修 #4：舊版回 { data: { transactions } }，RewardHistory.tsx 讀的是
// { data: { history, total, limit, offset } }——前端讀到的欄位永遠是
// undefined，畫面永遠空白。這裡改回前端本來就在等的形狀，並補上真正
// 的分頁（offset/total）與逐列餘額（balance_after）。
// ============================================================
app.get('/rewards/history', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);

  // 來源分類篩選下推到後端：view 衍生欄 source_category（見 migration 0725 0002）。
  // ?source=referral_signup,referral_renewal（CSV 多選）；未帶 = 全部。
  // 篩選必須在 DB 端（.in），count 才是「該分類集合的總數」，分頁與「已顯示 X / Y」
  // 才對得上——舊版在前端過濾已載入頁面，後頁永遠看不到、計數也對不上。
  const sourceParam = c.req.query('source');
  const sources = sourceParam ? sourceParam.split(',').map((s) => s.trim()).filter(Boolean) : [];

  let query = sb()
    .from('reward_transactions_with_balance')
    .select(
      'id, type, source_category, amount, description, created_at, generation, balance_after, referee_name, referee_referrer_name, source_claim_id',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (sources.length) query = query.in('source_category', sources);

  // facet 與明細同時取：篩選器要照「使用者實際有哪些分類」渲染，故 facet 永遠
  // 算未篩選的全集——若跟著 ?source= 收斂，選了一個分類就會把其他 chip 弄不見。
  const [{ data: rows, count }, { data: facetRows }] = await Promise.all([
    query.range(offset, offset + limit - 1),
    sb().rpc('reward_source_facets', { p_user_id: user.id }),
  ]);

  const history = (rows ?? []).map((r: any) => ({
    id: r.id,
    type: r.type,
    sourceCategory: r.source_category,
    amount: r.amount,
    description: r.description,
    issuedAt: r.created_at,
    requestedAt: r.type === 'withdrawal' ? r.created_at : undefined,
    generation: r.generation ?? undefined,
    balance: r.balance_after,
    // 姓名遮罩與推薦管理共用同一支 maskNameByGen（個資機敏單一真相）：被推薦人的
    // 世代深度＝該筆 generation（第 1 代直推全顯、2/3 代遮罩）；其上線深度＝generation − 1。
    refereeName: r.referee_name ? maskNameByGen(r.referee_name, r.generation ?? 1) : undefined,
    refereeReferrerName: r.referee_referrer_name
      ? maskNameByGen(r.referee_referrer_name, (r.generation ?? 1) - 1)
      : undefined,
    // 續約獎勵是「下線用免費續約券換的」還是「下線付錢續的」——分類不再分家，
    // 由這個旗標讓明細第二行仍能註記（見 api-contract 的 viaFreeRenewal）。
    viaFreeRenewal: r.source_claim_id ? true : undefined,
  }));

  const facets = (facetRows ?? []).map((f: any) => ({
    sourceCategory: f.source_category,
    count: Number(f.tx_count),
  }));

  return c.json(
    {
      success: true,
      data: { history, total: count ?? 0, limit, offset, sources: facets },
    } satisfies RewardHistoryResponse,
  );
});

// ============================================================
// 推薦網絡：共用機制（/referrals/network/* 三端點同一份真相）
//
// 節點狀態：suspended 優先（正交，擋可見性）；否則兩態 active/expired；
// active 且距 end_date ≤30 天 → expiring（對齊 subscriptionNotice 的續訂提醒窗）。
// ============================================================
const RENEWAL_DAYS = 30;
function deriveNodeStatus(acct: any, suspendedAt: string | null) {
  if (suspendedAt) return { status: 'suspended' as const, daysToExpiry: null };
  if (acct?.status !== 'active') return { status: 'expired' as const, daysToExpiry: null };
  const dl = acct?.end_date
    ? Math.ceil((new Date(acct.end_date).getTime() - Date.now()) / 86_400_000)
    : null;
  if (dl !== null && dl >= 0 && dl <= RENEWAL_DAYS) {
    return { status: 'expiring' as const, daysToExpiry: dl };
  }
  return { status: 'active' as const, daysToExpiry: dl };
}

// 姓名遮罩：一代（直推）全顯；二、三代部分遮罩。CJK 保留首末字、中間逐字○；
// 英數保留首末、中間固定 •••（不洩漏長度）。
// HAN_RANGE/HAS_HAN/HAN_LEAD 已搬到檔頭共用工具段（與 validateNameFormat 同段）。
// export 是為了讓 unit test 能直接斷言「通過 validateNameFormat 的中文姓名，
// 經 maskNameByGen(gen=2) 必為中文遮罩樣式」——兩者對「什麼算中文」的認定
// 若漂移，就會出現「通過驗證卻仍顯示英數樣式遮罩」，原地重現本次要解決的症狀。
export function maskNameByGen(raw: string | null | undefined, gen: number): string {
  const name = (raw ?? '').trim();
  if (gen <= 1 || name.length <= 1) return name;
  const chars = [...name];
  const hasHan = HAS_HAN.test(name);
  if (hasHan) {
    return chars.length === 2
      ? chars[0] + '○'
      : chars[0] + '○'.repeat(chars.length - 2) + chars[chars.length - 1];
  }
  return chars.length === 2 ? chars[0] + '•' : chars[0] + '•••' + chars[chars.length - 1];
}

// .in() 分批：PostgREST 的 .in() 走 URL query，上千個 UUID 會爆 URL 長度上限，
// 一律切塊撈再合併。查詢失敗擲出，
// 由各 handler 統一回 500——先前「錯誤靜默轉空樹」會讓使用者誤以為沒有下線。
const IN_CHUNK = 150;
async function selectInChunks(
  client: any,
  table: string,
  columns: string,
  col: string,
  ids: string[],
): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await client.from(table).select(columns).in(
      col,
      ids.slice(i, i + IN_CHUNK),
    );
    if (error) throw new Error(`${table} 查詢失敗: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

// 觀看者的 3 代子樹（edges + enrichment）一次載齊。
// edges 三條索引查詢極便宜；enrichment 目前一律全撈（attention 需要全體狀態、
// search 需要全體真名），日後若 profiling 顯示 children 端點太重再細分。
async function loadNetwork(client: any, viewerId: string) {
  const { data: gen1Raw, error: gen1Err } = await client
    .from('referral_edges')
    .select('referee_user_id, referred_at')
    .eq('referrer_user_id', viewerId);
  if (gen1Err) throw new Error(`referral_edges 查詢失敗: ${gen1Err.message}`);
  const gen1Edges = gen1Raw ?? [];
  const gen1Ids = gen1Edges.map((e: any) => e.referee_user_id);

  const gen2Edges = gen1Ids.length
    ? await selectInChunks(
      client,
      'referral_edges',
      'referee_user_id, referrer_user_id, referred_at',
      'referrer_user_id',
      gen1Ids,
    )
    : [];
  const gen2Ids = gen2Edges.map((e: any) => e.referee_user_id);

  const gen3Edges = gen2Ids.length
    ? await selectInChunks(
      client,
      'referral_edges',
      'referee_user_id, referrer_user_id, referred_at',
      'referrer_user_id',
      gen2Ids,
    )
    : [];
  const gen3Ids = gen3Edges.map((e: any) => e.referee_user_id);

  const allIds = [...new Set([...gen1Ids, ...gen2Ids, ...gen3Ids])];

  // referrer -> 直接下線（一代的上線是觀看者本人）；referee -> 上線（搜尋路徑用）
  const childrenOf: Record<string, { id: string; at: string }[]> = {};
  const parentOf = new Map<string, string>();
  const genOf = new Map<string, number>();
  const joinedAtOf = new Map<string, string>();
  const addEdge = (referrer: string, referee: string, at: string, gen: number) => {
    (childrenOf[referrer] ??= []).push({ id: referee, at });
    parentOf.set(referee, referrer);
    genOf.set(referee, gen);
    joinedAtOf.set(referee, at);
  };
  gen1Edges.forEach((e: any) => addEdge(viewerId, e.referee_user_id, e.referred_at, 1));
  gen2Edges.forEach((e: any) => addEdge(e.referrer_user_id, e.referee_user_id, e.referred_at, 2));
  gen3Edges.forEach((e: any) => addEdge(e.referrer_user_id, e.referee_user_id, e.referred_at, 3));

  const [profiles, listings, accounts] = allIds.length
    ? await Promise.all([
      selectInChunks(client, 'profiles', 'id, name, suspended_at', 'id', allIds),
      selectInChunks(client, 'listings', 'user_id, id', 'user_id', allIds),
      selectInChunks(client, 'user_account_status', 'user_id, status, end_date', 'user_id', allIds),
    ])
    : [[], [], []];
  const profMap: Record<string, any> = Object.fromEntries(profiles.map((p: any) => [p.id, p]));
  const listingMap: Record<string, any> = Object.fromEntries(
    listings.map((l: any) => [l.user_id, l]),
  );
  const acctMap: Record<string, any> = Object.fromEntries(accounts.map((a: any) => [a.user_id, a]));

  return {
    gen1Ids,
    gen2Ids,
    gen3Ids,
    allIds,
    childrenOf,
    parentOf,
    genOf,
    joinedAtOf,
    profMap,
    listingMap,
    acctMap,
    summary: {
      firstGenCount: gen1Ids.length,
      secondGenCount: gen2Ids.length,
      thirdGenCount: gen3Ids.length,
      totalReferrals: gen1Ids.length + gen2Ids.length + gen3Ids.length,
    },
  };
}
type Network = Awaited<ReturnType<typeof loadNetwork>>;

// 扁平節點（/referrals/network/* 的 payload；children 由前端懶載入組裝）
function buildFlatNode(net: Network, uid: string): NetworkNode {
  const gen = net.genOf.get(uid) ?? 0;
  const { status, daysToExpiry } = deriveNodeStatus(
    net.acctMap[uid],
    net.profMap[uid]?.suspended_at ?? null,
  );
  const kids = gen < 3 ? (net.childrenOf[uid] ?? []) : [];
  return {
    userId: uid,
    name: maskNameByGen(net.profMap[uid]?.name, gen),
    generation: gen,
    status,
    daysToExpiry,
    endDate: net.acctMap[uid]?.end_date ?? null,
    joinedAt: net.joinedAtOf.get(uid) ?? '',
    listingId: net.listingMap[uid]?.id ?? null,
    childCount: kids.length,
  };
}

// 排序：updated = 節點「自身」加入時間；name = 真名（伺服器才有）+ Intl.Collator
// zh-Hant。三個端點傳進來的一律是同層兄弟集合（overview = 一代、children =
// 某節點的直接下線），因此「每一代各自排自己的」是結構天生成立的；關鍵在鍵要
// 用自身 joinedAt——先前用「子樹最新加入」，下線一加入就把上線推到列表頂端。
// 混排規則（與需求方核定）：A→Z（筆畫少→多）英文組在前；Z→A 為其完全反轉
// （中文組自然在前）——降冪一律用「升冪後反轉」實作，兩方向永不漂移。
const NETWORK_SORT_MODES = ['updated_desc', 'updated_asc', 'name_asc', 'name_desc'] as const;
const zhCollator = new Intl.Collator('zh-Hant');
function parseSortMode(raw: string | undefined): NetworkSortMode {
  return (NETWORK_SORT_MODES as readonly string[]).includes(raw ?? '')
    ? (raw as NetworkSortMode)
    : DEFAULT_NETWORK_SORT;
}
function sortNodeIds(net: Network, ids: string[], mode: NetworkSortMode): string[] {
  const realName = (uid: string) => ((net.profMap[uid]?.name ?? '') as string).trim();
  const joinedMs = (uid: string) => Date.parse(net.joinedAtOf.get(uid) ?? '') || 0;
  // 自身加入時間升冪 → userId 字典序。一律升冪：升冪模式下每個比較鍵方向一致，
  // 降冪就是整體反轉，不會有單一個鍵偷偷反向（同名者的次序曾因此與主鍵相反）。
  // 缺值/壞值一律歸零（`?? '' || 0`），NaN 進比較器會讓排序整個失序。
  // 這同時就是 updated_asc 的比較器——「自身加入時間」正是它的主鍵。
  const tie = (a: string, b: string) => (joinedMs(a) - joinedMs(b)) || (a < b ? -1 : a > b ? 1 : 0);
  const nameAsc = (a: string, b: string) => {
    const ga = HAN_LEAD.test(realName(a)) ? 1 : 0;
    const gb = HAN_LEAD.test(realName(b)) ? 1 : 0;
    return (ga - gb) || zhCollator.compare(realName(a), realName(b)) || tie(a, b);
  };
  const sorted = [...ids].sort(mode.startsWith('name') ? nameAsc : tie);
  if (mode === 'updated_desc' || mode === 'name_desc') sorted.reverse();
  return sorted;
}

const ATTENTION_LIMIT = 6;
// 搜尋分頁：預設頁大小 50、上限 200（與 /rewards/history 同慣例）。
// total 永遠是全部命中數、不受這兩者影響——「符合條件的都要搜得到」是靠
// 分頁走得完，不是靠把單頁放大；先前在排序後才 slice(0, 50)，排序方向一改
// 就換一批人搜得到，而前端不顯示 total，截斷完全無感。
const SEARCH_PAGE_SIZE = 50;
const SEARCH_PAGE_MAX = 200;

async function myReferralCode(client: any, userId: string): Promise<string> {
  const { data } = await client.from('referral_codes')
    .select('code').eq('user_id', userId).eq('status', 'active').maybeSingle();
  return data?.code ?? '';
}

// ============================================================
// GET /referrals/network/overview?sort=
// 懶載入入口：推薦碼 + 三代摘要 + 一代節點（排序後）+ 需要關注清單。
// ============================================================
app.get('/referrals/network/overview', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  const sort = parseSortMode(c.req.query('sort'));

  try {
    const client = sb();
    const net = await loadNetwork(client, user.id);
    const code = await myReferralCode(client, user.id);

    const roots = sortNodeIds(net, net.gen1Ids, sort).map((uid) => buildFlatNode(net, uid));

    // 需要關注：expiring（依剩餘天數）→ expired（依最近到期）→ suspended。
    const rank: Record<string, number> = { expiring: 0, expired: 1, suspended: 2 };
    const attentionAll = net.allIds
      .map((uid) => buildFlatNode(net, uid))
      .filter((n) => n.status !== 'active')
      .sort((a, b) =>
        (rank[a.status] - rank[b.status]) ||
        ((a.daysToExpiry ?? Infinity) - (b.daysToExpiry ?? Infinity)) ||
        ((Date.parse(b.endDate ?? '') || 0) - (Date.parse(a.endDate ?? '') || 0)) ||
        (a.userId < b.userId ? -1 : 1)
      );

    return c.json(
      {
        success: true,
        data: {
          userReferralCode: code,
          sort,
          roots,
          attention: { total: attentionAll.length, items: attentionAll.slice(0, ATTENTION_LIMIT) },
          summary: net.summary,
        },
      } satisfies NetworkOverviewResponse,
    );
  } catch (err) {
    console.error('[referrals/network/overview] 失敗:', err);
    return c.json({ error: { message: '載入推薦網絡失敗' } }, 500);
  }
});

// ============================================================
// GET /referrals/network/children?parentId=&sort=
// 懶載入展開：parentId 的直接下線。授權：parentId 必在觀看者 3 代子樹內
// （或為觀看者本人）；gen3 節點的下線超出可見範圍 → 空陣列。
// ============================================================
app.get('/referrals/network/children', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  const parentId = (c.req.query('parentId') ?? '').trim();
  if (!parentId) return c.json({ error: { message: '缺少 parentId' } }, 400);
  const sort = parseSortMode(c.req.query('sort'));

  try {
    const net = await loadNetwork(sb(), user.id);

    const isSelf = parentId === user.id;
    const parentGen = isSelf ? 0 : net.genOf.get(parentId);
    if (parentGen === undefined) {
      return c.json({ error: { message: '無權查看此節點' } }, 403);
    }

    const childIds = parentGen >= 3 ? [] : (net.childrenOf[parentId] ?? []).map((k) => k.id);
    const nodes = sortNodeIds(net, childIds, sort).map((uid) => buildFlatNode(net, uid));

    return c.json(
      {
        success: true,
        data: { parentId, sort, nodes },
      } satisfies NetworkChildrenResponse,
    );
  } catch (err) {
    console.error('[referrals/network/children] 失敗:', err);
    return c.json({ error: { message: '載入下線失敗' } }, 500);
  }
});

// ============================================================
// GET /referrals/network/search?q=&sort=
// 伺服器以「真名」比對（伺服器才有未遮罩名），回傳遮罩後顯示名 +
// 祖先路徑（一代 → 命中者本身），前端據此自動展開。深代下線因此搜得到，
// 又不洩漏真名。
// ============================================================
app.get('/referrals/network/search', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ error: { message: '缺少搜尋字串' } }, 400);
  const sort = parseSortMode(c.req.query('sort'));

  try {
    const net = await loadNetwork(sb(), user.id);

    const qLower = q.toLowerCase();
    const hitIds = net.allIds.filter((uid) =>
      ((net.profMap[uid]?.name ?? '') as string).toLowerCase().includes(qLower)
    );

    const pathTo = (uid: string): string[] => {
      const path: string[] = [];
      let cur: string | undefined = uid;
      for (let hop = 0; cur && cur !== user.id && hop < 4; hop++) {
        path.push(cur);
        cur = net.parentOf.get(cur);
      }
      return path.reverse();
    };

    // 壞值一律回落而非報錯：搜尋是高頻互動，limit=abc 不該讓使用者看到 400。
    // Number('') / Number(undefined) 皆為 NaN → `|| 預設`；負 offset 由 max 夾到 0。
    const limit = Math.min(
      Math.max(Number(c.req.query('limit')) || SEARCH_PAGE_SIZE, 1),
      SEARCH_PAGE_MAX,
    );
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
    // 越界 offset 由 slice 自然回空陣列——是「空的一頁」，不是錯誤。
    const matches = sortNodeIds(net, hitIds, sort)
      .slice(offset, offset + limit)
      .map((uid) => ({ node: buildFlatNode(net, uid), ancestorPath: pathTo(uid) }));

    return c.json(
      {
        success: true,
        data: { query: q, sort, total: hitIds.length, limit, offset, matches },
      } satisfies NetworkSearchResponse,
    );
  } catch (err) {
    console.error('[referrals/network/search] 失敗:', err);
    return c.json({ error: { message: '搜尋失敗' } }, 500);
  }
});

// ============================================================
// GET /tasks
// TaskDashboard：任務列表（新版只有「推薦王」月任務）
// 推薦王的獎勵不是點數，是「免費續約 1 年」credit（見
// referral_king_rewards），需要使用者另外呼叫 /tasks/claim-reward/:id
// 領取才會真的延展會員到期日。
// ============================================================
app.get('/tasks', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const currentMonth = twCurrentMonth();

  const client = sb();
  const [{ data: progress }, { data: rewardsRows }, cfg] = await Promise.all([
    client.from('task_progress')
      .select('monthly_referrals, total_referrals, updated_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    client.from('referral_king_rewards')
      .select('id, month_key, status, granted_at, claimed_at')
      .eq('user_id', user.id)
      .order('month_key', { ascending: false }),
    getRewardConfig(client),
  ]);
  const KING_TARGET = cfg.referralKingThreshold; // 推薦王門檻取自 reward_config

  const monthly = (progress?.monthly_referrals as Record<string, any>) ?? {};
  const currentCount = Array.isArray(monthly[currentMonth]) ? monthly[currentMonth].length : 0;
  const completedMonths = Object.entries(monthly)
    .filter(([m, v]) => m !== currentMonth && (Array.isArray(v) ? v.length : 0) >= KING_TARGET)
    .length;

  const allRewards = rewardsRows ?? [];
  const unclaimed = allRewards.filter((r: any) => r.status === 'unclaimed');

  const tasks = [{
    id: 'task_monthly_king',
    type: 'monthly_king',
    title: '推薦王',
    description: `單月推薦${KING_TARGET}位以上用戶`,
    target: KING_TARGET,
    current: currentCount,
    completed: currentCount >= KING_TARGET,
    reward: { type: 'free_renewal_year', label: '免費續約 1 年' },
    progress: Math.min((currentCount / KING_TARGET) * 100, 100),
    hasUnclaimedReward: unclaimed.length > 0,
    unclaimedRewardCount: unclaimed.length,
    details: {
      currentMonth,
      historyCount: Object.keys(monthly).length,
      completedMonths,
      // 累計獲得的免費續約張數（含當月、含已領）。多輪之下這才是誠實的
      // 「完成次數」——completedMonths 只數達標月份、且排除當月，會低估。
      totalCredits: allRewards.length,
    },
  }];

  return c.json({
    success: true,
    data: {
      tasks,
      rawData: {
        monthlyKing: {
          currentMonth,
          currentCount,
          completedMonths,
          monthly_referrals: monthly,
        },
      },
    },
  });
});

// ============================================================
// GET /tasks/pending-rewards
// 待領取的推薦王「免費續約 1 年」credit 列表。沿用既有前端
// （useTaskData / PendingRewardsSection / ClaimRewardDialog）已經在
// 等的 PendingMissionReward 形狀，amount 固定 0（不是點數），用新增的
// rewardType 欄位讓前端知道這是續約而不是點數。
// ============================================================
app.get('/tasks/pending-rewards', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const { data: rows } = await sb()
    .from('referral_king_rewards')
    .select('id, month_key, granted_at')
    .eq('user_id', user.id)
    .eq('status', 'unclaimed')
    .order('month_key', { ascending: false });

  const data = (rows ?? []).map((r: any) => ({
    id: r.id,
    type: 'monthly_king',
    rewardType: 'free_renewal_year',
    amount: 0,
    achievedAt: r.granted_at,
    status: 'pending',
    description: `${r.month_key} 推薦王任務達成：可領取免費續約 1 年`,
    details: { monthKey: r.month_key },
  }));

  return c.json({ success: true, data });
});

// ============================================================
// GET /tasks/current-month-top
// TaskDashboard：查看本月推薦詳情（推薦王任務卡片按鈕）
//
// 修 #6：舊版回排行榜 { month, rankings }（順帶全表掃 task_progress、
// 洩漏所有用戶姓名/推薦數給任何登入者），但前端 useTaskData/
// MonthlyKingProgress 要的是「自己本月的推薦明細」
// { month, total, completedCount, currentProgress, referrals }——
// 拿到排行榜形狀後 referrals.length/.map 直接炸掉，按鈕形同失效。
// 這裡改成回傳呼叫者自己的月推薦明細（路徑不變，端點語意換掉）。
// ============================================================
app.get('/tasks/current-month-top', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 200);
  const currentMonth = twCurrentMonth();

  const client = sb();
  const [{ data: progress }, cfg] = await Promise.all([
    client.from('task_progress')
      .select('monthly_referrals')
      .eq('user_id', user.id)
      .maybeSingle(),
    getRewardConfig(client),
  ]);
  const KING_TARGET = cfg.referralKingThreshold; // 推薦王門檻取自 reward_config

  const monthly = (progress?.monthly_referrals as Record<string, any>) ?? {};
  // 保留 append 順序（每次成功付款推進一位）——UI 每滿第 8 位標
  // 「第N次完成」，順序錯了標記就跟著錯。
  const ids: string[] = Array.isArray(monthly[currentMonth]) ? monthly[currentMonth] : [];
  const total = ids.length;
  const completedCount = Math.floor(total / KING_TARGET);
  const currentProgress = total % KING_TARGET;
  const limitedIds = ids.slice(0, limit);

  let nameMap: Record<string, string> = {};
  let codeMap: Record<string, string> = {};
  let createdAtMap: Record<string, string> = {};

  if (limitedIds.length) {
    const [{ data: profs }, { data: codes }, { data: rewardRows }] = await Promise.all([
      client.from('profiles').select('id, name').in('id', limitedIds),
      client.from('referral_codes').select('user_id, code').in('user_id', limitedIds).eq(
        'status',
        'active',
      ),
      // 本月第 1 代推薦獎勵與 monthly_referrals 是同一次交易寫入
      // （apply_referral_side_effects），依 referee_user_id 一一對應。
      client.from('reward_transactions')
        .select('referee_user_id, created_at')
        .eq('user_id', user.id)
        .eq('generation', 1)
        .in('referee_user_id', limitedIds),
    ]);
    nameMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.name]));
    codeMap = Object.fromEntries((codes ?? []).map((r: any) => [r.user_id, r.code]));
    createdAtMap = Object.fromEntries(
      (rewardRows ?? []).map((r: any) => [r.referee_user_id, r.created_at]),
    );

    // fallback：極少數第 1 代獎勵寫入失敗（見 apply_referral_side_effects
    // 的 warning-only 隔離）時退回推薦邊建立時間。
    const missingIds = limitedIds.filter((id) => !createdAtMap[id]);
    if (missingIds.length) {
      const { data: edges } = await client.from('referral_edges')
        .select('referee_user_id, referred_at')
        .in('referee_user_id', missingIds);
      for (const e of edges ?? []) {
        createdAtMap[(e as any).referee_user_id] = (e as any).referred_at;
      }
    }
  }

  const referrals = limitedIds.map((id) => ({
    userId: id,
    userName: nameMap[id] ?? '',
    userReferralCode: codeMap[id] ?? null,
    createdAt: createdAtMap[id] ?? null,
  }));

  return c.json(
    {
      success: true,
      data: {
        month: currentMonth,
        total,
        completedCount,
        currentProgress,
        referrals,
        target: KING_TARGET,
      },
    } satisfies CurrentMonthReferralsResponse,
  );
});

// ============================================================
// POST /tasks/claim-reward/:id
// 領取推薦王「免費續約 1 年」credit。沿用前端既有的身分證驗證步驟
// （ClaimRewardDialog 第三步），驗證通過才呼叫
// claim_referral_king_reward 真的延展訂閱到期日。
// ============================================================
app.post('/tasks/claim-reward/:id', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const rewardId = c.req.param('id');
  const idNumber = (body?.idNumber || '').trim();

  const client = sb();
  if (!(await verifyNationalId(client, user.id, idNumber))) {
    return c.json({ success: false, error: '身分證字號驗證失敗' }, 400);
  }

  const { data, error } = await client.rpc('claim_referral_king_reward', {
    p_user_id: user.id,
    p_reward_id: rewardId,
  });

  if (error) {
    console.error('[claim-reward] rpc error:', error);
    return c.json({ success: false, error: '領取失敗，請稍後再試或聯繫客服' }, 500);
  }
  if (!data?.success) {
    // suspended（停權）/ subscription_invalid（會籍失效）：領取需帳號正常且會籍有效，
    // 與提領/刊登同一把尺，不可用 credit 免費復活或在停權期間動用。
    const status = data?.error_code === 'not_found'
      ? 404
      : ['forbidden', 'subscription_invalid', 'suspended'].includes(data?.error_code)
      ? 403
      : 400;
    return c.json({ success: false, error: data?.message ?? '領取失敗' }, status);
  }

  return c.json({
    success: true,
    data: {
      subscriptionId: data.subscriptionId,
      activeUntil: data.activeUntil,
    },
  });
});

// ============================================================
// POST /listings/upload-photo
// 上傳刊登照片至 Supabase Storage (bucket: listings)
// ============================================================
app.post('/listings/upload-photo', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: '解析上傳資料失敗' }, 400);
  }

  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: '未提供檔案' }, 400);

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  if (!ALLOWED.includes(file.type)) {
    return c.json({ error: '只支援 JPG、PNG、WEBP 格式' }, 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: '檔案不得超過 5MB' }, 400);
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const client = sb();
  const { data: upload, error: uploadErr } = await client.storage
    .from('make-5c6718b9-listings-photos')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (uploadErr) {
    console.error('[upload-photo] Storage error:', uploadErr);
    return c.json({ error: uploadErr.message || '上傳失敗' }, 500);
  }

  const { data: urlData } = client.storage.from('make-5c6718b9-listings-photos').getPublicUrl(
    upload.path,
  );

  return c.json({ success: true, photoUrl: urlData.publicUrl });
});

// ============================================================
// GET /referrals/debug/:userId  (admin only)
// ============================================================
app.get('/referrals/debug/:userId', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const client = sb();
  const targetId = c.req.param('userId');

  // Admin check
  const { data: prof } = await client.from('profiles').select('is_admin').eq('id', user.id)
    .single();
  if (!prof?.is_admin && user.id !== targetId) {
    return c.json({ error: '僅限管理員' }, 403);
  }

  const [
    { data: profile },
    { data: acct },
    { data: gen1 },
    { data: code },
    { data: effectiveStep },
  ] = await Promise.all([
    client.from('profiles').select('id, name, referred_by_code, registration_step').eq(
      'id',
      targetId,
    ).single(),
    client.from('user_account_status').select('status, end_date').eq('user_id', targetId).single(),
    client.from('referral_edges').select('referee_user_id, referred_at').eq(
      'referrer_user_id',
      targetId,
    ),
    client.from('referral_codes').select('code, status').eq('user_id', targetId).maybeSingle(),
    client.rpc('effective_registration_step', { p_user_id: targetId }),
  ]);

  return c.json({
    success: true,
    data: {
      profile: profile
        ? {
          name: profile.name,
          referralCode: code?.code ?? null,
          referredByCode: profile.referred_by_code,
          registrationStepStored: profile.registration_step, // 手動維護的歷史欄位，僅供除錯比對
          registrationStepEffective: effectiveStep ?? 1, // 實際生效值（由 payment_orders 即時算出）
        }
        : null,
      accountStatus: acct,
      directReferrals: gen1?.length ?? 0,
      referralCodeStatus: code?.status ?? null,
    },
  });
});

// ============================================================
// 健康檢查
//
// sha 回報「這個 runtime 實際跑的是哪個 commit」——部署後的煙霧測試
// 靠它分辨「函式活著」與「函式是這次要部署的那一版」。deploy workflow
// 在 functions deploy 之前用 supabase secrets set DEPLOY_SHA=<sha> 寫入；
// 沒設時回 unknown（本地開發與舊部署）。repo 是公開的，commit sha
// 不是機密。
// ============================================================
// payuniMode / payuniConfigured：把「這個環境的金流打哪裡、憑證齊不齊」
// 變成一個 curl 就能回答的問題。
//
// 起因（2026-07-26）：正式站的 PAYUNI_SANDBOX 是 true,所有付款都走了
// PayUni 測試站——帳面 20 筆完成訂單、NT$24,000,實際入帳 0 元。當時是
// 刻意的（尚未開放），但它**沒有任何訊號**:憑證與端點一致時 PayUni
// 不回浮水印、程式不報錯、儀表板只看得到 secrets 的 SHA256 digest。
// 那次是靠人工反推 digest 才發現的,不是可重複的流程。
//
// 兩個欄位都不是機密:mode 從使用者被導去哪個 PayUni 網域就看得出來,
// configured 只回報布林、不回傳任何憑證內容（同 sha 的取捨——repo 公開,
// 這些不是機密,而可觀測性的價值遠大於它）。
app.get('/health', async (c) => {
  const read = (key: string) => Deno.env.get(key);

  // A12：預設推薦碼（reward_config.default_referrer_code）只能人工 SQL
  // 設定、沒有 admin UI 掛即時驗證；fresh 未填碼的 A10 機制若因此靜默
  // 失效，只剩事後告警。部署 SOP 本來就會打 /health 比對 sha，順帶回報
  // 三態讓失效「可見」。任何錯誤都不得讓 /health 失敗——無法驗證時回
  // 'invalid'（寧可假警報引人檢查，不可沉默）。碼內容絕不回傳。
  let defaultReferrer: 'ok' | 'unset' | 'invalid' = 'invalid';
  try {
    const { data: cfgRow } = await sb()
      .from('reward_config')
      .select('default_referrer_code')
      .eq('id', true)
      .maybeSingle();
    const code = (cfgRow?.default_referrer_code ?? '').trim().toLowerCase();
    if (!code) {
      defaultReferrer = 'unset';
    } else {
      const { data: rows, error } = await sb().rpc('validate_referral_code', { p_code: code });
      defaultReferrer = !error && rows && rows.length > 0 ? 'ok' : 'invalid';
    }
  } catch (e) {
    console.error('[health] defaultReferrer 檢查失敗:', e);
  }

  return c.json({
    ok: true,
    ts: new Date().toISOString(),
    sha: read('DEPLOY_SHA') ?? 'unknown',
    payuniMode: resolvePayuniMode(read),
    payuniConfigured: isPayuniConfigured(read),
    // 與 payuniConfigured 同一個理由：這個設定沒有任何外顯訊號。缺 secret 時
    // 核身端點會回 500，但那要有人真的去掃一次碼才會發現；Secrets 頁只看得到
    // digest。回一個布林值（絕不回傳任何憑證內容）讓「設好了沒」一個 curl 就能回答，
    // 且 Secrets 是逐分支獨立、不從母專案繼承——每個環境都要各自確認。
    memberTokenConfigured: !!read('MEMBER_TOKEN_SECRET'),
    defaultReferrer,
  });
});

// import.meta.main 只有直接執行這個檔案時才是 true（Supabase Edge
// Runtime 的啟動方式）；被 *.test.ts 用 `import { ... } from './index.ts'`
// 引入時是 false，避免測試一 import 就意外啟動一個真的監聽 port 的伺服器。
if (import.meta.main) {
  Deno.serve(app.fetch);
}
