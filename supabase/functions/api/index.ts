// ============================================================
// Uknow API Edge Function
// 取代舊 make-server-5c6718b9，使用新的正規化 schema
// ============================================================
import { Hono } from 'npm:hono@4';
import { cors } from 'npm:hono/cors';
import { etag } from 'npm:hono/etag';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encryptPayUni, decryptPayUni, generatePayUniHash } from './crypto.ts';
import {
  twDayOf,
  twMonthKey,
  twCompactTimestamp,
  twDayPlusDays,
  subscriptionLastDay,
  twEndOfDayInstant,
} from './tw-dates.ts';
import type {
  RewardHistoryResponse,
  CurrentMonthReferralsResponse,
} from '../_shared/api-contract.ts';

// Supabase 將函數名稱（/api）保留在傳給函數的路徑中，
// 因此所有路由需掛在 /api basePath 下，否則一律 404。
// export 供測試以 app.request() 直接打路由（import.meta.main 已防止測試時啟動 server）。
export const app = new Hono().basePath('/api');

// ============================================================
// CORS
// ============================================================
app.use('*', cors({
  origin: (origin) => {
    // 去掉結尾斜線再比對：瀏覽器 Origin 不帶斜線，但 FRONTEND_URL 可能被填成帶斜線
    const allowed = (Deno.env.get('FRONTEND_URL') || '').replace(/\/$/, '');
    const o       = origin.replace(/\/$/, '');
    return o === allowed || o.startsWith('http://localhost') ? origin : '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // If-None-Match：搭配讀端點的 ETag 條件請求（見下方 etag middleware）
  allowHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
  exposeHeaders: ['ETag'],
  // preflight 快取 2 小時：每個帶 Authorization 的請求本來都要多付一次
  // OPTIONS round-trip，這是整條 API 路徑上最大的單項頻寬/延遲節省。
  maxAge: 7200,
  credentials: true,
}));

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
  '/referrals/my-tree',
  '/tasks',
  '/tasks/*',
  '/announcements/active',
] as const;
for (const p of READ_PATHS) {
  app.use(p, etag());
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
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ============================================================
// 獎勵可變常數單一真相：讀 reward_config（見 migration 0719 0002）。
// 推薦王門檻 8 以前散在 SQL 函數、這裡、前端三處；現在 SQL 函數與這裡都
// 讀同一張表，前端再由 task payload 拿到 target，不再各自硬編。讀不到就
// fallback 回現值，永不因設定缺失而算錯進度。
// ============================================================
async function getRewardConfig(client: any): Promise<{ referralRewardAmount: number; referralKingThreshold: number }> {
  const { data } = await client
    .from('reward_config')
    .select('referral_reward_amount, referral_king_monthly_threshold')
    .eq('id', true)
    .maybeSingle();
  return {
    referralRewardAmount:  data?.referral_reward_amount ?? 100,
    referralKingThreshold: data?.referral_king_monthly_threshold ?? 8,
  };
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
// 工具：組建 profile 回應（供多個路由共用）
// ============================================================
export async function buildProfileResponse(client: any, userId: string, email?: string, alreadyHealed = false) {
  const [{ data: profile }, { data: acct }, { data: code }, { data: pendingOrders }, { data: step }] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).single(),
    client.from('user_account_status').select('status, end_date, grace_period_end').eq('user_id', userId).single(),
    client.from('referral_codes').select('code').eq('user_id', userId).eq('status', 'active').maybeSingle(),
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
    id:              profile.id,
    name:            profile.name,
    phone:           profile.phone,
    birthDate:       profile.birth_date,
    nationalId:      profile.national_id,
    bankCode:        profile.bank_code,
    bankAccount:     profile.bank_account,
    isAdmin:         profile.is_admin,
    registrationStep,
    // 待開通時優先指向「已付款成功」的那筆訂單，讓前端守衛導去的
    // 結果頁顯示正確的訂單；否則維持最新一筆 pending 的舊語意。
    lastTradeNo:     registrationStep === 2
      ? (paidOrder?.transaction_id ?? pendingOrders?.[0]?.transaction_id ?? null)
      : null,
    paidAwaitingActivation,
    referralCode:    code?.code ?? null,
    referredByCode:  profile.referred_by_code,
    referralProgramJoined: profile.referral_program_joined,
    referralSignatureUrl:  profile.referral_signature_url,
    accountStatus:   acct?.status ?? 'expired',
    subscriptionEndDate: acct?.end_date ?? null,
    suspended:       !!profile.suspended_at,
    email,
  };
}

// ============================================================
// PayUni 設定 — 整合式支付頁（UPP / UNiPaypage），一次性付款
// 文件：https://docs.payuni.com.tw/web/#/7/34
// ============================================================
function payuniConfig() {
  const sandbox = Deno.env.get('PAYUNI_SANDBOX') === 'true';

  // sandbox（測試站）與正式站是兩套獨立帳號，MerID / HashKey / HashIV 都不同，不能混用。
  // 測試模式優先讀 PAYUNI_TEST_*，若未設定則退回一般變數。
  const merID = sandbox
    ? (Deno.env.get('PAYUNI_TEST_MER_ID')   || Deno.env.get('PAYUNI_MER_ID')!)
    : Deno.env.get('PAYUNI_MER_ID')!;
  const key = sandbox
    ? (Deno.env.get('PAYUNI_TEST_HASH_KEY') || Deno.env.get('PAYUNI_HASH_KEY')!)
    : Deno.env.get('PAYUNI_HASH_KEY')!;
  const iv = sandbox
    ? (Deno.env.get('PAYUNI_TEST_HASH_IV')  || Deno.env.get('PAYUNI_HASH_IV')!)
    : Deno.env.get('PAYUNI_HASH_IV')!;

  if (!key || !iv || !merID) throw new Error('PayUni 環境變數未設定');
  return {
    merID,
    hashKey: key,
    hashIV:  iv,
    version: '1.0',
    apiUrl: sandbox
      ? 'https://sandbox-api.payuni.com.tw/api/upp'
      : 'https://api.payuni.com.tw/api/upp',
    // server-to-server 交易查詢（reconcile 對帳用）
    queryUrl: sandbox
      ? 'https://sandbox-api.payuni.com.tw/api/trade/query'
      : 'https://api.payuni.com.tw/api/trade/query',
  };
}

// MerTradeNo：限英數字。用 台灣日期時間(14) + 4 碼亂數 = 18 碼
function generateTradeNo(): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${twCompactTimestamp()}${rand}`;  // 18 chars
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
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ exists: false }); }

  const email = body?.email?.trim()?.toLowerCase();
  if (!email) return c.json({ exists: false });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=50&search=${encodeURIComponent(email)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );

  if (!res.ok) return c.json({ exists: false });
  const data = await res.json();
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
  try { body = await c.req.json(); } catch { return c.json({ error: '請求格式錯誤' }, 400); }

  const { name, nationalId, phone, birthDate, referralCode } = body;

  if (!name || !phone || !birthDate) {
    return c.json({ error: '請填寫姓名、手機、生日' }, 400);
  }

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
    birth_date:        birthDate,
    national_id:       nationalId || null,
    registration_step: 1,
    referred_by_code:  cleanCode,
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
  try { body = await c.req.json(); } catch { return c.json({ error: '請求格式錯誤' }, 400); }

  const client = sb();
  const allowedFields: Record<string, string> = {
    name:              'name',
    phone:             'phone',
    birthDate:         'birth_date',
    nationalId:        'national_id',
    bankCode:          'bank_code',
    bankAccount:       'bank_account',
  };

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
// CompleteProfile「我晚點再填」：刪除尚未完成的帳號
// ============================================================
app.delete('/auth/cancel-signup', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const { error } = await sb().auth.admin.deleteUser(user.id);
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
        referralCode:  data.referralCode,
        activeUntil:   data.subscriptionEndDate,
        accountStatus: data.accountStatus,
      }
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
      userId:      row.referrer_user_id,
      userName:    row.referrer_name,
      listingName: row.listing_name ?? null,
    },
    // 舊欄位名稱（向下相容）
    referrerName:   row.referrer_name,
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
  try { body = await c.req.json(); } catch { return c.json({ success: false, error: { message: '請求格式錯誤' } }, 400); }

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
  try { body = await c.req.json(); } catch { return c.json({ valid: false }); }
  const code = (body?.referralCode || body?.code || '').toLowerCase().trim();
  if (!code) return c.json({ valid: false, error: { message: '推薦碼不能為空' } });

  const { data, error } = await sb().rpc('validate_referral_code', { p_code: code });
  if (error || !data || data.length === 0) {
    return c.json({ valid: false, error: { message: '推薦碼不存在或已失效' } });
  }
  const row = data[0];
  return c.json({
    valid:       true,
    referrerName: row.referrer_name,
    referrer: {
      userId:      row.referrer_user_id,
      userName:    row.referrer_name,
      listingName: row.listing_name ?? null,
    },
  });
});

// ============================================================
// GET /admin/features
// 功能開關（目前全部開啟，後續可改成資料庫設定）
// ============================================================
app.get('/admin/features', (c) => {
  return c.json({
    features: {
      serviceProviderManagement: true,
      referralManagement:        true,
      taskCenter:                true,
      rewardSystem:              true,
    }
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
  const limit  = Math.min(parseInt(c.req.query('limit') || '200'), 500);
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);

  const client = sb();
  let query = client.from('withdrawals')
    .select('*', { count: 'exact' })
    .order('requested_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data: rows, count } = await query;

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

  const withdrawals = (rows ?? []).map((w: any) => {
    const p = profMap[w.user_id];
    return {
      id:             w.id,
      userId:         w.user_id,
      userName:       p?.name ?? '',
      userPhone:      p?.phone ?? null,
      idNumber:       p?.national_id ?? null,
      amount:         w.amount,
      fee:            w.fee,
      status:         w.status,
      bankCode:       w.bank_code,
      bankAccount:    w.bank_account,
      note:           w.note,
      requestedAt:    w.requested_at,
      processedAt:    w.processed_at,
      completedAt:    w.completed_at,
      idCardFrontUrl: p?.id_card_front_path ? (urlMap[p.id_card_front_path] ?? null) : null,
      idCardBackUrl:  p?.id_card_back_path ? (urlMap[p.id_card_back_path] ?? null) : null,
    };
  });

  return c.json({ success: true, data: { withdrawals, total: count ?? 0, limit, offset } });
});

// POST /admin/withdrawals/:id/status
// 狀態轉換：pending → awaiting_collection（已匯款）/ rejected（退件退點）
app.post('/admin/withdrawals/:id/status', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try { body = await c.req.json(); } catch { /* 空 body */ }

  const { data, error } = await sb().rpc('admin_update_withdrawal_status', {
    p_admin_id:      user.id,
    p_withdrawal_id: c.req.param('id'),
    p_status:        body?.status ?? '',
    p_note:          body?.note ?? null,
  });

  if (error) {
    console.error('[admin-withdrawal-status] rpc error:', error);
    return c.json({ success: false, error: { message: '狀態更新失敗' } }, 500);
  }
  if (!data?.success) {
    const status = data?.error_code === 'not_found' ? 404
      : data?.error_code === 'forbidden' ? 403 : 400;
    return c.json({ success: false, error: { message: data?.message ?? '狀態更新失敗' } }, status);
  }

  return c.json({
    success: true,
    data: { withdrawalId: c.req.param('id'), status: data.status, processedAt: data.processed_at ?? null },
  });
});

// GET /admin/members?search=&limit=&offset=
app.get('/admin/members', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  const { data, error } = await sb().rpc('admin_list_members', {
    p_search: c.req.query('search') ?? null,
    p_limit:  Math.min(parseInt(c.req.query('limit') || '50'), 200),
    p_offset: Math.max(parseInt(c.req.query('offset') || '0'), 0),
  });

  if (error) {
    console.error('[admin-members] rpc error:', error);
    return c.json({ success: false, error: { message: '無法取得會員列表' } }, 500);
  }

  const members = (data?.members ?? []).map((m: any) => ({
    id:            m.id,
    name:          m.name,
    email:         m.email,
    phone:         m.phone,
    isAdmin:       m.is_admin,
    suspended:     !!m.suspended_at,
    suspendedAt:   m.suspended_at,
    accountStatus: m.account_status,
    listingCount:  m.listing_count,
    createdAt:     m.created_at,
  }));

  return c.json({ success: true, data: { members, total: data?.total ?? 0 } });
});

// POST /admin/members/:id/suspend  body: { suspend: boolean }
app.post('/admin/members/:id/suspend', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  if (!(await isAdminUser(user.id))) return c.json({ error: '僅限管理員' }, 403);

  let body: any = {};
  try { body = await c.req.json(); } catch { /* 空 body */ }
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
    id:       a.id,
    title:    a.title,
    message:  a.message,
    type:     a.type,
    startsAt: a.starts_at,
    endsAt:   a.ends_at,
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
    id:        a.id,
    title:     a.title,
    message:   a.message,
    type:      a.type,
    startsAt:  a.starts_at,
    endsAt:    a.ends_at,
    isActive:  a.is_active,
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
  try { body = await c.req.json(); } catch { /* 空 body */ }

  const title   = (body?.title ?? '').trim();
  const message = (body?.message ?? '').trim();
  const type    = ['info', 'warning', 'error'].includes(body?.type) ? body.type : 'info';
  if (!title || !message) {
    return c.json({ success: false, error: { message: '請填寫完整的公告標題與內容' } }, 400);
  }

  const { data: row, error } = await sb().from('announcements').insert({
    title,
    message,
    type,
    starts_at:  body?.startsAt ?? new Date().toISOString(),
    ends_at:    body?.endsAt ?? null,
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
    success:          true,
    isAdmin:          !!me?.is_admin,
    hasExistingAdmin,
    canBecomeAdmin:   !hasExistingAdmin,
    userId:           user.id,
    userName:         me?.name ?? '',
    userEmail:        user.email ?? '',
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

  // 防重複：只擋「目前仍在效期內」的會員。寬限期（grace）與已失效
  // （expired）都可以付款——這正是續訂（到期後接續）或重新訂閱的
  // 唯一入口（訂閱三態模型：付款即訂閱／續訂／重新訂，見 0718 系列）。
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
  try { body = await c.req.json(); } catch { /* 沒有 body = 首次付款 */ }
  const renewalMode: 'extend' | 'fresh' | null =
    body?.renewalMode === 'extend' || body?.renewalMode === 'fresh' ? body.renewalMode : null;

  if (renewalMode === 'extend') {
    // extend 只有「曾是會員」且「接續後效期仍在未來」才有意義——過期
    // 超過一年的人選 extend 會付了錢效期仍在過去，直接拒絕（前端也不
    // 顯示該選項），process_successful_payment 才能對 renewal_mode
    // 字面執行而不需要補救邏輯。
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
    // 日領域計算，與 process_successful_payment 的 extend 分支
    // （tw_day(前期迄) + 1 天起算）完全同語意——這裡通過的請求，
    // 付款完成後端點算出來的效期保證仍在未來。
    const anchorDay      = twDayPlusDays(twDayOf(lastSub.end_date), 1);
    const extendedEndDay = subscriptionLastDay(anchorDay);
    if (twEndOfDayInstant(extendedEndDay).getTime() <= Date.now()) {
      return c.json({ success: false, error: '會籍已過期超過一年，無法接續原效期，請選擇新約' }, 400);
    }
  }

  // 新約可換推薦人：驗證新推薦碼並更新推薦來源。付款成功時
  // apply_referral_side_effects 會把推薦邊 rewire 到新推薦人（0008），
  // 之後的推薦獎勵歸新推薦人；舊推薦人的歷史獎勵不受影響。
  const referredByCode: string =
    typeof body?.referredByCode === 'string' ? body.referredByCode.toLowerCase().trim() : '';
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
    const { error: refErr } = await client
      .from('profiles')
      .update({ referred_by_code: referredByCode, referred_by_user_id: referrerUserId })
      .eq('id', user.id);
    if (refErr) {
      console.error('[prepare] 更新推薦人失敗:', refErr);
      return c.json({ success: false, error: '更新推薦人失敗' }, 500);
    }
  }

  const config  = payuniConfig();
  const tradeNo = generateTradeNo();

  // 雲端環境從 *.supabase.co 網址取 project id；本地 supabase start
  // （http://127.0.0.1:54321）比對不到時直接用該網址當 functions base，
  // 讓本地開發/測試不會在這裡炸掉。
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '');
  const projectId     = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1];
  const functionsBase = projectId
    ? `https://${projectId}.supabase.co/functions/v1`
    : `${supabaseUrl}/functions/v1`;
  const frontendUrl = Deno.env.get('FRONTEND_URL')!.replace(/\/$/, '');

  // 付款期限：3 天後（YYYY-MM-DD，台灣時區）
  const expire = twDayPlusDays(twDayOf(), 3);

  // UPP（整合式支付頁）加密內容
  const encryptData: Record<string, string | number> = {
    MerID:      config.merID,
    MerTradeNo: tradeNo,
    TradeAmt:   1200,
    Timestamp:  Math.floor(Date.now() / 1000),
    ProdDesc:   'Uknow 年費會員',
    UsrMail:    user.email || '',
    ExpireDate: expire,
    NotifyURL:  `${functionsBase}/api/webhooks/payuni/notify`,
    // ReturnURL 指向後端（不是前端頁面）——PayUni 導回時會用 POST 帶
    // EncryptInfo/HashInfo（跟 NotifyURL 收到的是同一份交易結果），
    // 後端解密後直接知道當下結果，302 導向前端並帶上 status，
    // 前端不需要再輪詢猜測付款是否成功。
    ReturnURL:  `${functionsBase}/api/payuni/return`,
    // 啟用的付款方式（值為 1 代表開啟，PayUni 整合式支付頁會顯示對應按鈕）
    Credit:     1,   // 信用卡
    ApplePay:   1,   // Apple Pay
    GooglePay:  1,   // Google Pay
    SamsungPay: 1,   // Samsung Pay
    Lang:       'zh-tw',
  };

  const encryptInfo = await encryptPayUni(encryptData, config.hashKey, config.hashIV);
  const hashInfo    = await generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);

  // 寫入 payment_orders（renewal_mode 記錄使用者選的續費模式，
  // process_successful_payment 依它決定效期錨點——效期在付款當下才
  // 決定，不信任前端傳日期）
  const { error: insertErr } = await client.from('payment_orders').insert({
    user_id:        user.id,
    amount:         1200,
    status:         'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
    renewal_mode:   renewalMode,
  });
  if (insertErr) {
    console.error('[prepare] insert payment_orders 失敗:', insertErr);
    return c.json({ success: false, error: '建立訂單失敗' }, 500);
  }

  return c.json({
    success: true,
    data: {
      MerID:       config.merID,
      Version:     config.version,
      EncryptInfo: encryptInfo,
      HashInfo:    hashInfo,
      apiUrl:      config.apiUrl,
      tradeNo,
    }
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
  const fetchOrder = () => sb()
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

  // orderStatus 只用來決定前端是否要繼續 polling；成功/失敗的實際原因與
  // 明細一律以 payuni（PayUni 原始回傳資料）為準，不再自創詞彙轉換。
  return c.json({
    success: true,
    data: {
      orderStatus: order.status,
      completedAt: order.completed_at,
      payuni:      order.payuni_response ?? null,
      // 已付款但尚未收斂成訂閱（例如金額不符待人工）——前端顯示
      // 「開通處理中」而不是把使用者當成沒付錢。
      paidAwaitingActivation: order.status === 'pending' && order.payuni_response?.Status === 'SUCCESS',
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
async function logSystemAlert(source: string, context: Record<string, unknown>, message = 'edge function alert') {
  try {
    await sb().from('system_alerts').insert({ source, severity: 'warning', message, context });
  } catch (e) {
    console.error('[logSystemAlert] failed to persist alert', e);
  }
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
  data: Record<string, string>
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
    p_user_id:         order.user_id,
    p_trade_no:        MerTradeNo,
    p_transaction_id:  TradeNo || MerTradeNo,
    p_payuni_response: data,
  });

  if (error) {
    await persistRawResponseBestEffort(MerTradeNo, data);
    await logSystemAlert('resolveOrderFromPayUni', { merTradeNo: MerTradeNo, error: error.message });
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
  opts: { thresholdMinutes: number; limit: number },
): Promise<{ checked: number; resolved: number; stillPending: number; queryErrors: number }> {
  const cutoff = new Date(Date.now() - opts.thresholdMinutes * 60_000).toISOString();

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

  const summary = { checked: stuck?.length ?? 0, resolved: 0, stillPending: 0, queryErrors: 0 };

  for (const order of stuck ?? []) {
    try {
      const result = await queryFn(order.transaction_id!);
      if (result.stillProcessing) {
        summary.stillPending++;
        continue;
      }
      const outcome = await resolveFn(result.data);
      if (outcome.ok) {
        summary.resolved++;
      } else {
        await logSystemAlert('reconcile-pending-payments', { tradeNo: order.transaction_id, message: outcome.message });
      }
    } catch (e) {
      summary.queryErrors++;
      await logSystemAlert('reconcile-pending-payments', { tradeNo: order.transaction_id, error: String(e) });
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
      MerID:      config.merID,
      Timestamp:  Math.floor(Date.now() / 1000),
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
      MerID:       config.merID,
      Version:     config.version,
      EncryptInfo: encryptInfo,
      HashInfo:    hashInfo,
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
  if (!secret || c.req.header('x-internal-secret') !== secret) {
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
  config: ReturnType<typeof payuniConfig>
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
      new URLSearchParams(await decryptPayUni(EncryptInfo, config.hashKey, config.hashIV))
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
  try { config = payuniConfig(); }
  catch { return c.json({ Status: 'FAILED', Message: 'config error' }); }

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
  try { config = payuniConfig(); }
  catch { return fallbackRedirect(); }

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

  const [{ data: acct }, { data: sub }] = await Promise.all([
    sb().from('user_account_status')
      .select('status, end_date, grace_period_end')
      .eq('user_id', user.id)
      .single(),
    // 最新一筆訂閱的起訖——SubscriptionStatusCard 顯示「訂閱週期」用。
    // 過去只回 activeUntil，前端卡片的 currentPeriodStart/End 永遠拿不到
    // 值，會員在儀表板上根本看不到自己的到期日（領獎延長會籍後也就
    // 「看不到」有延長）。
    sb().from('subscriptions')
      .select('start_date, end_date')
      .eq('user_id', user.id)
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return c.json({
    success: true,
    data: {
      hasSubscription: acct?.status === 'active' || acct?.status === 'grace',
      status:          acct?.status ?? 'expired',
      activeUntil:     acct?.end_date ?? null,
      gracePeriodEnd:  acct?.grace_period_end ?? null,
      currentPeriodStart: sub?.start_date ?? null,
      currentPeriodEnd:   sub?.end_date ?? null,
    }
  });
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
      availableRewards:  Math.max(0, data.available),
      pendingRewards:    data.pending,
      withdrawnRewards:  data.withdrawn,
      totalEarned:       data.total_earned,
      hasWithdrawnToday: data.has_withdrawn_today,
    }
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
      currentTotal:     data.total_earned,
      currentPending:   data.pending,
      currentWithdrawn: data.withdrawn,
    }
  });
});

// ============================================================
// GET /rewards/withdrawals
// RewardDashboard：提領記錄
// ============================================================
app.get('/rewards/withdrawals', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const { data: rows } = await sb()
    .from('withdrawals')
    .select('*')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false });

  const withdrawals = (rows ?? []).map((w: any) => ({
    id:           w.id,
    userId:       w.user_id,
    amount:       w.amount,
    fee:          w.fee,
    status:       w.status,
    requestedAt:  w.requested_at,
    processedAt:  w.processed_at,
    completedAt:  w.completed_at,
  }));

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
  try { body = await c.req.json(); } catch { /* 空 body */ }

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
    .select('id_card_front_path, id_card_back_path')
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
      backUrl:  await sign(profile?.id_card_back_path ?? null),
    }
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
  const back  = formData.get('idCardBack') as File | null;
  if (!front && !back) {
    return c.json({ error: { message: '未提供檔案' } }, 400);
  }

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  for (const f of [front, back]) {
    if (!f) continue;
    if (!ALLOWED.includes(f.type)) return c.json({ error: { message: '只支援 JPG、PNG、WEBP 格式' } }, 400);
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
    const patch: Record<string, string> = {};
    let frontPath: string | null = null;
    let backPath: string | null = null;
    if (front) { frontPath = await upload(front, 'front'); patch.id_card_front_path = frontPath; }
    if (back)  { backPath  = await upload(back, 'back');   patch.id_card_back_path  = backPath; }
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
  try { body = await c.req.json(); } catch { /* 空 body */ }

  const amount      = Number(body?.amount);
  const idNumber    = (body?.idNumber ?? '').trim();
  const bankCode    = (body?.bankCode ?? '').trim();
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
    p_user_id:      user.id,
    p_amount:       amount,
    p_bank_code:    bankCode,
    p_bank_account: bankAccount,
  });

  if (error) {
    console.error('[withdraw] rpc error:', error);
    return c.json({ success: false, error: { message: '提領申請失敗，請稍後再試' } }, 500);
  }
  if (!data?.success) {
    const status = data?.error_code === 'subscription_invalid' || data?.error_code === 'not_joined' ? 403 : 400;
    return c.json({ success: false, error: { message: data?.message ?? '提領申請失敗' } }, status);
  }

  return c.json({
    success: true,
    data: {
      withdrawalId: data.withdrawal_id,
      status:       data.status,
      amount:       data.amount,
      fee:          data.fee,
      requestedAt:  data.requested_at,
    }
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
  try { body = await c.req.json(); } catch { /* 空 body */ }

  const client = sb();
  if (!(await verifyNationalId(client, user.id, body?.idNumber ?? ''))) {
    return c.json({ success: false, error: { message: '身分證字號驗證失敗' } }, 400);
  }

  const { data, error } = await client.rpc('confirm_withdrawal_collection', {
    p_user_id:       user.id,
    p_withdrawal_id: c.req.param('id'),
  });

  if (error) {
    console.error('[confirm-collection] rpc error:', error);
    return c.json({ success: false, error: { message: '查收確認失敗，請稍後再試' } }, 500);
  }
  if (!data?.success) {
    const status = data?.error_code === 'not_found' ? 404
      : data?.error_code === 'forbidden' ? 403 : 400;
    return c.json({ success: false, error: { message: data?.message ?? '查收確認失敗' } }, status);
  }

  return c.json({
    success: true,
    data: {
      withdrawalId: c.req.param('id'),
      status:       data.status,
      completedAt:  data.completed_at ?? null,
    }
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

  const limit  = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);

  // type 篩選下推到後端：前端的分類（referral / withdrawal）對應到 reward_transactions.type。
  // 'referral' 用 like 'referral_%' 對齊前端原本的 startsWith('referral_') 語意；未帶或 'all'
  // 不加條件。篩選必須在 DB 端做，count 才會是「該分類的總數」，分頁與「已顯示 X / Y」才對得上
  // ——舊版在前端過濾已載入的頁面，後頁的紀錄永遠看不到、計數也對不上。
  const typeFilter = c.req.query('type');

  let query = sb()
    .from('reward_transactions_with_balance')
    .select('id, type, amount, description, created_at, generation, balance_after, referee_name, referee_referrer_name', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (typeFilter === 'referral') query = query.like('type', 'referral_%');
  else if (typeFilter === 'withdrawal') query = query.eq('type', 'withdrawal');

  const { data: rows, count } = await query.range(offset, offset + limit - 1);

  const history = (rows ?? []).map((r: any) => ({
    id:                  r.id,
    type:                r.type,
    amount:              r.amount,
    description:         r.description,
    issuedAt:            r.created_at,
    requestedAt:         r.type === 'withdrawal' ? r.created_at : undefined,
    generation:          r.generation ?? undefined,
    balance:             r.balance_after,
    refereeName:         r.referee_name ?? undefined,
    refereeReferrerName: r.referee_referrer_name ?? undefined,
  }));

  return c.json({
    success: true,
    data: { history, total: count ?? 0, limit, offset },
  } satisfies RewardHistoryResponse);
});

// ============================================================
// GET /referrals/my-tree
// ReferralManagement：推薦樹（3代）
// ============================================================
app.get('/referrals/my-tree', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const client = sb();

  // -- Gen 1 --
  const { data: gen1Edges } = await client
    .from('referral_edges')
    .select('referee_user_id, referred_at')
    .eq('referrer_user_id', user.id);

  const gen1Ids = (gen1Edges ?? []).map((e: any) => e.referee_user_id);

  // -- Gen 2 --
  const gen2EdgesRes = gen1Ids.length
    ? await client.from('referral_edges')
        .select('referee_user_id, referrer_user_id, referred_at')
        .in('referrer_user_id', gen1Ids)
    : { data: [] };
  const gen2Edges = gen2EdgesRes.data ?? [];
  const gen2Ids   = gen2Edges.map((e: any) => e.referee_user_id);

  // -- Gen 3 --
  const gen3EdgesRes = gen2Ids.length
    ? await client.from('referral_edges')
        .select('referee_user_id, referrer_user_id, referred_at')
        .in('referrer_user_id', gen2Ids)
    : { data: [] };
  const gen3Edges = gen3EdgesRes.data ?? [];
  const gen3Ids   = gen3Edges.map((e: any) => e.referee_user_id);

  const allIds = [...new Set([...gen1Ids, ...gen2Ids, ...gen3Ids])];

  // -- Batch fetch enrichment data + my referral code --
  const emptyResult = async () => {
    const { data: mc } = await client.from('referral_codes')
      .select('code').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    return c.json({
      success: true,
      data: {
        userReferralCode: mc?.code ?? '',
        referralTree: { firstGeneration: [], secondGeneration: [], thirdGeneration: [] },
        summary: { totalReferrals: 0, firstGenCount: 0, secondGenCount: 0, thirdGenCount: 0 },
      }
    });
  };

  if (!allIds.length) return emptyResult();

  const [
    { data: profiles },
    { data: codes },
    { data: listings },
    { data: accounts },
    { data: myCodeRow },
  ] = await Promise.all([
    client.from('profiles').select('id, name').in('id', allIds),
    client.from('referral_codes').select('user_id, code').in('user_id', allIds).eq('status', 'active'),
    client.from('listings').select('user_id, id, name, category, city').in('user_id', allIds),
    client.from('user_account_status').select('user_id, status, end_date').in('user_id', allIds),
    client.from('referral_codes').select('code').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
  ]);

  const profMap:    Record<string, any> = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
  const codeMap:    Record<string, string> = Object.fromEntries((codes ?? []).map((r: any) => [r.user_id, r.code]));
  const listingMap: Record<string, any> = Object.fromEntries((listings ?? []).map((l: any) => [l.user_id, l]));
  const acctMap:    Record<string, any> = Object.fromEntries((accounts ?? []).map((a: any) => [a.user_id, a]));

  const buildMember = (uid: string, createdAt: string, referrerUid?: string) => {
    const acct = acctMap[uid];
    const ref  = referrerUid ? {
      userId:          referrerUid,
      userName:        profMap[referrerUid]?.name ?? '',
      userReferralCode: codeMap[referrerUid] ?? null,
      listingId:       listingMap[referrerUid]?.id ?? null,
      listingName:     listingMap[referrerUid]?.name ?? null,
    } : null;
    return {
      userId:           uid,
      userName:         profMap[uid]?.name ?? '',
      userReferralCode: codeMap[uid] ?? null,
      listingId:        listingMap[uid]?.id ?? null,
      listingName:      listingMap[uid]?.name ?? null,
      serviceType:      listingMap[uid]?.category ?? null,
      city:             listingMap[uid]?.city ?? null,
      activeUntil:      acct?.end_date ?? null,
      isActive:         acct?.status === 'active' || acct?.status === 'grace',
      referrer:         ref,
      createdAt,
    };
  };

  const firstGeneration  = (gen1Edges ?? []).map((e: any) => buildMember(e.referee_user_id, e.referred_at));
  const secondGeneration = gen2Edges.map((e: any) => buildMember(e.referee_user_id, e.referred_at, e.referrer_user_id));
  const thirdGeneration  = gen3Edges.map((e: any) => buildMember(e.referee_user_id, e.referred_at, e.referrer_user_id));

  return c.json({
    success: true,
    data: {
      userReferralCode: myCodeRow?.code ?? '',
      referralTree: { firstGeneration, secondGeneration, thirdGeneration },
      summary: {
        firstGenCount:  firstGeneration.length,
        secondGenCount: secondGeneration.length,
        thirdGenCount:  thirdGeneration.length,
        totalReferrals: firstGeneration.length + secondGeneration.length + thirdGeneration.length,
      },
    }
  });
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
  const KING_TARGET = cfg.referralKingThreshold;  // 推薦王門檻取自 reward_config

  const monthly        = (progress?.monthly_referrals as Record<string, any>) ?? {};
  const currentCount   = Array.isArray(monthly[currentMonth]) ? monthly[currentMonth].length : 0;
  const completedMonths = Object.entries(monthly)
    .filter(([m, v]) => m !== currentMonth && (Array.isArray(v) ? v.length : 0) >= KING_TARGET).length;

  const allRewards = rewardsRows ?? [];
  const unclaimed   = allRewards.filter((r: any) => r.status === 'unclaimed');
  const thisMonthCredit = allRewards.find((r: any) => r.month_key === currentMonth) ?? null;

  const tasks = [{
    id:          'task_monthly_king',
    type:        'monthly_king',
    title:       '推薦王',
    description: `單月推薦${KING_TARGET}位以上用戶`,
    target:      KING_TARGET,
    current:     currentCount,
    completed:   currentCount >= KING_TARGET,
    reward:      { type: 'free_renewal_year', label: '免費續約 1 年' },
    progress:    Math.min((currentCount / KING_TARGET) * 100, 100),
    hasUnclaimedReward:   unclaimed.length > 0,
    unclaimedRewardCount: unclaimed.length,
    details: {
      currentMonth,
      historyCount:     Object.keys(monthly).length,
      completedMonths,
      currentMonthCredit: thisMonthCredit && {
        id:        thisMonthCredit.id,
        status:    thisMonthCredit.status,
        grantedAt: thisMonthCredit.granted_at,
        claimedAt: thisMonthCredit.claimed_at,
      },
    }
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
        }
      }
    }
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
    id:          r.id,
    type:        'monthly_king',
    rewardType:  'free_renewal_year',
    amount:      0,
    achievedAt:  r.granted_at,
    status:      'pending',
    description: `${r.month_key} 推薦王任務達成：可領取免費續約 1 年`,
    details:     { monthKey: r.month_key },
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

  const limit        = Math.min(parseInt(c.req.query('limit') || '100'), 200);
  const currentMonth = twCurrentMonth();

  const client = sb();
  const [{ data: progress }, cfg] = await Promise.all([
    client.from('task_progress')
      .select('monthly_referrals')
      .eq('user_id', user.id)
      .maybeSingle(),
    getRewardConfig(client),
  ]);
  const KING_TARGET = cfg.referralKingThreshold;  // 推薦王門檻取自 reward_config

  const monthly = (progress?.monthly_referrals as Record<string, any>) ?? {};
  // 保留 append 順序（每次成功付款推進一位）——UI 每滿第 8 位標
  // 「第N次完成」，順序錯了標記就跟著錯。
  const ids: string[] = Array.isArray(monthly[currentMonth]) ? monthly[currentMonth] : [];
  const total           = ids.length;
  const completedCount  = Math.floor(total / KING_TARGET);
  const currentProgress = total % KING_TARGET;
  const limitedIds       = ids.slice(0, limit);

  let nameMap: Record<string, string> = {};
  let codeMap: Record<string, string> = {};
  let createdAtMap: Record<string, string> = {};

  if (limitedIds.length) {
    const [{ data: profs }, { data: codes }, { data: rewardRows }] = await Promise.all([
      client.from('profiles').select('id, name').in('id', limitedIds),
      client.from('referral_codes').select('user_id, code').in('user_id', limitedIds).eq('status', 'active'),
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
    createdAtMap = Object.fromEntries((rewardRows ?? []).map((r: any) => [r.referee_user_id, r.created_at]));

    // fallback：極少數第 1 代獎勵寫入失敗（見 apply_referral_side_effects
    // 的 warning-only 隔離）時退回推薦邊建立時間。
    const missingIds = limitedIds.filter((id) => !createdAtMap[id]);
    if (missingIds.length) {
      const { data: edges } = await client.from('referral_edges')
        .select('referee_user_id, referred_at')
        .in('referee_user_id', missingIds);
      for (const e of edges ?? []) createdAtMap[(e as any).referee_user_id] = (e as any).referred_at;
    }
  }

  const referrals = limitedIds.map((id) => ({
    userId:           id,
    userName:         nameMap[id] ?? '',
    userReferralCode: codeMap[id] ?? null,
    createdAt:        createdAtMap[id] ?? null,
  }));

  return c.json({
    success: true,
    data: { month: currentMonth, total, completedCount, currentProgress, referrals, target: KING_TARGET },
  } satisfies CurrentMonthReferralsResponse);
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
  try { body = await c.req.json(); } catch { body = {}; }

  const rewardId  = c.req.param('id');
  const idNumber  = (body?.idNumber || '').trim();

  const client = sb();
  if (!(await verifyNationalId(client, user.id, idNumber))) {
    return c.json({ success: false, error: '身分證字號驗證失敗' }, 400);
  }

  const { data, error } = await client.rpc('claim_referral_king_reward', {
    p_user_id:   user.id,
    p_reward_id: rewardId,
  });

  if (error) {
    console.error('[claim-reward] rpc error:', error);
    return c.json({ success: false, error: '領取失敗，請稍後再試或聯繫客服' }, 500);
  }
  if (!data?.success) {
    const status = data?.error_code === 'not_found' ? 404
      : data?.error_code === 'forbidden' ? 403 : 400;
    return c.json({ success: false, error: data?.message ?? '領取失敗' }, status);
  }

  return c.json({
    success: true,
    data: {
      subscriptionId: data.subscriptionId,
      activeUntil:    data.activeUntil,
      gracePeriodEnd: data.gracePeriodEnd,
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

  const ext  = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const client = sb();
  const { data: upload, error: uploadErr } = await client.storage
    .from('make-5c6718b9-listings-photos')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (uploadErr) {
    console.error('[upload-photo] Storage error:', uploadErr);
    return c.json({ error: uploadErr.message || '上傳失敗' }, 500);
  }

  const { data: urlData } = client.storage.from('make-5c6718b9-listings-photos').getPublicUrl(upload.path);

  return c.json({ success: true, photoUrl: urlData.publicUrl });
});

// ============================================================
// GET /referrals/debug/:userId  (admin only)
// ============================================================
app.get('/referrals/debug/:userId', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const client   = sb();
  const targetId = c.req.param('userId');

  // Admin check
  const { data: prof } = await client.from('profiles').select('is_admin').eq('id', user.id).single();
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
    client.from('profiles').select('id, name, referred_by_code, registration_step').eq('id', targetId).single(),
    client.from('user_account_status').select('status, end_date').eq('user_id', targetId).single(),
    client.from('referral_edges').select('referee_user_id, referred_at').eq('referrer_user_id', targetId),
    client.from('referral_codes').select('code, status').eq('user_id', targetId).maybeSingle(),
    client.rpc('effective_registration_step', { p_user_id: targetId }),
  ]);

  return c.json({
    success: true,
    data: {
      profile: profile ? {
        name:                     profile.name,
        referralCode:             code?.code ?? null,
        referredByCode:           profile.referred_by_code,
        registrationStepStored:   profile.registration_step,   // 手動維護的歷史欄位，僅供除錯比對
        registrationStepEffective: effectiveStep ?? 1,          // 實際生效值（由 payment_orders 即時算出）
      } : null,
      accountStatus:     acct,
      directReferrals:   gen1?.length ?? 0,
      referralCodeStatus: code?.status ?? null,
    }
  });
});

// ============================================================
// 健康檢查
// ============================================================
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// import.meta.main 只有直接執行這個檔案時才是 true（Supabase Edge
// Runtime 的啟動方式）；被 *.test.ts 用 `import { ... } from './index.ts'`
// 引入時是 false，避免測試一 import 就意外啟動一個真的監聽 port 的伺服器。
if (import.meta.main) {
  Deno.serve(app.fetch);
}
