// ============================================================
// Uknow API Edge Function
// 取代舊 make-server-5c6718b9，使用新的正規化 schema
// ============================================================
import { Hono } from 'npm:hono@4';
import { cors } from 'npm:hono/cors';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encryptPayUni, decryptPayUni, generatePayUniHash } from './crypto.ts';

const app = new Hono();

// ============================================================
// CORS
// ============================================================
app.use('*', cors({
  origin: (origin) => {
    const allowed = Deno.env.get('FRONTEND_URL') || '';
    return origin === allowed || origin.startsWith('http://localhost') ? origin : '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

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
// 工具：從 Authorization header 取得已驗證 user
// ============================================================
async function requireAuth(c: any): Promise<{ id: string; email?: string } | null> {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await sb().auth.getUser(token);
  return error || !user ? null : user;
}

// ============================================================
// 工具：組建 profile 回應（供多個路由共用）
// ============================================================
async function buildProfileResponse(client: any, userId: string, email?: string) {
  const [{ data: profile }, { data: acct }, { data: code }] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).single(),
    client.from('user_account_status').select('status, end_date, grace_period_end').eq('user_id', userId).single(),
    client.from('referral_codes').select('code').eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ]);

  if (!profile) return null;

  return {
    id:              profile.id,
    name:            profile.name,
    phone:           profile.phone,
    birthDate:       profile.birth_date,
    nationalId:      profile.national_id,
    bankCode:        profile.bank_code,
    bankAccount:     profile.bank_account,
    isAdmin:         profile.is_admin,
    registrationStep: profile.registration_step,
    referralCode:    code?.code ?? null,
    referredByCode:  profile.referred_by_code,
    referralProgramJoined: profile.referral_program_joined,
    referralSignatureUrl:  profile.referral_signature_url,
    accountStatus:   acct?.status ?? 'expired',
    subscriptionEndDate: acct?.end_date ?? null,
    email,
  };
}

// ============================================================
// PayUni 設定 — 整合式支付頁（UPP / UNiPaypage），一次性付款
// 文件：https://docs.payuni.com.tw/web/#/7/34
// ============================================================
function payuniConfig() {
  const key   = Deno.env.get('PAYUNI_HASH_KEY')!;
  const iv    = Deno.env.get('PAYUNI_HASH_IV')!;
  const merID = Deno.env.get('PAYUNI_MER_ID')!;
  if (!key || !iv || !merID) throw new Error('PayUni 環境變數未設定');
  const sandbox = Deno.env.get('PAYUNI_SANDBOX') === 'true';
  return {
    merID,
    hashKey: key,
    hashIV:  iv,
    version: '1.0',
    apiUrl: sandbox
      ? 'https://sandbox-api.payuni.com.tw/api/upp'
      : 'https://api.payuni.com.tw/api/upp',
  };
}

// MerTradeNo：限英數字。用 台灣日期時間(14) + 4 碼亂數 = 18 碼
function generateTradeNo(): string {
  const now = new Date(Date.now() + 8 * 3600_000);  // UTC+8
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  const dt = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
             `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${dt}${rand}`;  // 18 chars
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
// PaymentCheckout 用於更新 registrationStep（步驟 2 = 付款中）
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
    registrationStep:  'registration_step',
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
// POST /auth/reset-to-payment
// PaymentResult 回到付款頁（重設 registration_step = 1）
// ============================================================
app.post('/auth/reset-to-payment', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  await sb().from('profiles')
    .update({ registration_step: 1 })
    .eq('id', user.id);

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
// POST /payuni/prepare
// 建立付款訂單，回傳加密表單資料供前端送出給 PayUni
// ============================================================
app.post('/payuni/prepare', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ success: false, error: '未授權' }, 401);

  const client = sb();

  // 防重複：已有有效訂閱就拒絕
  const { data: acct } = await client
    .from('user_account_status')
    .select('status')
    .eq('user_id', user.id)
    .single();
  if (acct?.status === 'active' || acct?.status === 'grace') {
    return c.json({ success: false, error: '已有有效訂閱，請到期後再續約' }, 400);
  }

  const config  = payuniConfig();
  const tradeNo = generateTradeNo();

  const projectId   = Deno.env.get('SUPABASE_URL')!.match(/https:\/\/(.+)\.supabase\.co/)![1];
  const frontendUrl = Deno.env.get('FRONTEND_URL')!.replace(/\/$/, '');

  // 付款期限：3 天後（YYYY-MM-DD，台灣時區）
  const expire = new Date(Date.now() + 8 * 3600_000 + 3 * 86400_000)
    .toISOString().slice(0, 10);

  // UPP（整合式支付頁）加密內容
  const encryptData: Record<string, string | number> = {
    MerID:      config.merID,
    MerTradeNo: tradeNo,
    TradeAmt:   1200,
    Timestamp:  Math.floor(Date.now() / 1000),
    ProdDesc:   'Uknow 年費會員',
    UsrMail:    user.email || '',
    ExpireDate: expire,
    NotifyURL:  `https://${projectId}.supabase.co/functions/v1/api/webhooks/payuni/notify`,
    ReturnURL:  `${frontendUrl}/payment/result?tradeNo=${tradeNo}`,
    Credit:     1,   // 信用卡
    ATM:        1,   // 銀行轉帳（虛擬帳號）
    CVS:        1,   // 超商代碼
    Lang:       'zh-tw',
  };

  const encryptInfo = encryptPayUni(encryptData, config.hashKey, config.hashIV);
  const hashInfo    = generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);

  // 寫入 payment_orders
  const { error: insertErr } = await client.from('payment_orders').insert({
    user_id:        user.id,
    amount:         1200,
    status:         'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
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
  const { data: order, error } = await sb()
    .from('payment_orders')
    .select('status, transaction_id, completed_at')
    .eq('transaction_id', tradeNo)
    .eq('user_id', user.id)
    .single();

  if (error || !order) return c.json({ success: false, error: '訂單不存在' }, 404);

  return c.json({ success: true, data: order });
});

// ============================================================
// POST /webhooks/payuni/notify
// PayUni 付款成功回調（form-data，不需 JWT）
// ============================================================
app.post('/webhooks/payuni/notify', async (c) => {
  let config: ReturnType<typeof payuniConfig>;
  try { config = payuniConfig(); }
  catch { return c.json({ Status: 'FAILED', Message: 'config error' }); }

  // 解析 form-data
  let body: Record<string, string>;
  try {
    const raw = await c.req.parseBody();
    body = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
  } catch {
    return c.json({ Status: 'FAILED', Message: 'parse error' });
  }

  const { EncryptInfo, HashInfo } = body;
  if (!EncryptInfo || !HashInfo) {
    console.error('[notify] 缺少 EncryptInfo / HashInfo');
    return c.json({ Status: 'FAILED', Message: 'missing params' });
  }

  // 驗簽
  if (generatePayUniHash(EncryptInfo, config.hashKey, config.hashIV) !== HashInfo) {
    console.error('[notify] Hash 驗證失敗');
    return c.json({ Status: 'FAILED', Message: 'hash mismatch' });
  }

  // 解密
  let data: Record<string, string>;
  try {
    data = Object.fromEntries(new URLSearchParams(decryptPayUni(EncryptInfo, config.hashKey, config.hashIV)));
  } catch (e) {
    console.error('[notify] 解密失敗:', e);
    return c.json({ Status: 'FAILED', Message: 'decrypt error' });
  }

  const { Status, MerTradeNo, TradeNo } = data;
  console.log('[notify] MerTradeNo:', MerTradeNo, 'Status:', Status);

  // 付款失敗：記錄但回覆 SUCCESS（避免 PayUni 無限重試）
  if (Status !== 'SUCCESS') {
    await sb().from('payment_orders')
      .update({ status: 'failed' })
      .eq('transaction_id', MerTradeNo);
    console.log('[notify] 付款失敗，已標記訂單');
    return c.json({ Status: 'SUCCESS' });
  }

  // 找訂單 + 冪等性
  const { data: order } = await sb()
    .from('payment_orders')
    .select('id, user_id, status')
    .eq('transaction_id', MerTradeNo)
    .single();

  if (!order) {
    console.error('[notify] 找不到訂單:', MerTradeNo);
    return c.json({ Status: 'FAILED', Message: 'order not found' });
  }
  if (order.status === 'completed') {
    console.log('[notify] 重複通知，略過:', MerTradeNo);
    return c.json({ Status: 'SUCCESS' });
  }

  // 金額驗證
  if (data.TradeAmt && Number(data.TradeAmt) !== 1200) {
    console.error('[notify] 金額不符:', data.TradeAmt);
    return c.json({ Status: 'FAILED', Message: 'amount mismatch' });
  }

  // 呼叫原子性付款處理函數
  const { data: result, error } = await sb().rpc('process_successful_payment', {
    p_user_id:        order.user_id,
    p_trade_no:       MerTradeNo,
    p_transaction_id: TradeNo || MerTradeNo,
  });

  if (error) {
    console.error('[notify] process_successful_payment 失敗:', error);
    return c.json({ Status: 'FAILED', Message: error.message });
  }

  console.log('[notify] ✅ 付款完成:', MerTradeNo, result);
  return c.json({ Status: 'SUCCESS' });
});

// ============================================================
// 健康檢查
// ============================================================
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

Deno.serve(app.fetch);
