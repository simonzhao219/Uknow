// ============================================================
// Uknow API Edge Function
// 取代舊 make-server-5c6718b9，使用新的正規化 schema
// ============================================================
import { Hono } from 'npm:hono@4';
import { cors } from 'npm:hono/cors';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encryptPayUni, decryptPayUni, generatePayUniHash } from './crypto.ts';

// Supabase 將函數名稱（/api）保留在傳給函數的路徑中，
// 因此所有路由需掛在 /api basePath 下，否則一律 404。
const app = new Hono().basePath('/api');

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

  const encryptInfo = await encryptPayUni(encryptData, config.hashKey, config.hashIV);
  const hashInfo    = await generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);

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
  if (await generatePayUniHash(EncryptInfo, config.hashKey, config.hashIV) !== HashInfo) {
    console.error('[notify] Hash 驗證失敗');
    return c.json({ Status: 'FAILED', Message: 'hash mismatch' });
  }

  // 解密
  let data: Record<string, string>;
  try {
    data = Object.fromEntries(new URLSearchParams(await decryptPayUni(EncryptInfo, config.hashKey, config.hashIV)));
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
// 工具：台灣時間 (UTC+8) 目前月份字串 "YYYY-MM"
// ============================================================
function twCurrentMonth(): string {
  const now = new Date(Date.now() + 8 * 3600_000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ============================================================
// GET /subscriptions/status
// RewardDashboard：查訂閱狀態
// ============================================================
app.get('/subscriptions/status', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const { data: acct } = await sb()
    .from('user_account_status')
    .select('status, end_date, grace_period_end')
    .eq('user_id', user.id)
    .single();

  return c.json({
    success: true,
    data: {
      hasSubscription: acct?.status === 'active' || acct?.status === 'grace',
      status:          acct?.status ?? 'expired',
      activeUntil:     acct?.end_date ?? null,
      gracePeriodEnd:  acct?.grace_period_end ?? null,
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

  const client = sb();
  const todayStart = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00+08:00';

  const [{ data: balance }, { data: pending }, { data: todayW }] = await Promise.all([
    client.from('reward_balances').select('*').eq('user_id', user.id).maybeSingle(),
    client.from('withdrawals').select('amount').eq('user_id', user.id).eq('status', 'pending'),
    client.from('withdrawals').select('id').eq('user_id', user.id).gte('requested_at', todayStart).limit(1),
  ]);

  const pendingAmount = pending?.reduce((s: number, w: any) => s + w.amount, 0) ?? 0;
  const available     = (balance?.available ?? 0) - pendingAmount;

  return c.json({
    success: true,
    data: {
      availableRewards: Math.max(0, available),
      pendingRewards:   pendingAmount,
      withdrawnRewards: balance?.withdrawn ?? 0,
      totalEarned:      balance?.total_earned ?? 0,
      lastUpdated:      new Date().toISOString(),
      hasWithdrawnToday: (todayW?.length ?? 0) > 0,
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
    fee:          0,
    status:       w.status,
    requestedAt:  w.requested_at,
    processedAt:  w.processed_at,
    completedAt:  w.status === 'completed' ? w.processed_at : null,
  }));

  return c.json({ success: true, data: { withdrawals } });
});

// ============================================================
// GET /rewards/history
// 獎勵明細（reward_transactions）
// ============================================================
app.get('/rewards/history', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const limit  = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const { data: rows } = await sb()
    .from('reward_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return c.json({ success: true, data: { transactions: rows ?? [] } });
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
// ============================================================
app.get('/tasks', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const currentMonth = twCurrentMonth();
  const KING_TARGET  = 10;
  const KING_REWARD  = 1000;

  const { data: progress } = await sb()
    .from('task_progress')
    .select('monthly_referrals, total_referrals, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const monthly        = (progress?.monthly_referrals as Record<string, any>) ?? {};
  const currentCount   = Array.isArray(monthly[currentMonth]) ? monthly[currentMonth].length : 0;
  const completedMonths = Object.entries(monthly)
    .filter(([m, v]) => m !== currentMonth && (Array.isArray(v) ? v.length : 0) >= KING_TARGET).length;

  const tasks = [{
    id:          'task_monthly_king',
    type:        'monthly_king',
    title:       '推薦王',
    description: '單月推薦10位以上用戶',
    target:      KING_TARGET,
    current:     currentCount,
    completed:   currentCount >= KING_TARGET,
    reward:      KING_REWARD,
    progress:    Math.min((currentCount / KING_TARGET) * 100, 100),
    details: {
      currentMonth,
      historyCount:     Object.keys(monthly).length,
      completedMonths,
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
// 新版：獎勵在付款時立即發放，無需手動領取；回傳空陣列
// ============================================================
app.get('/tasks/pending-rewards', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  return c.json({ success: true, data: [] });
});

// ============================================================
// GET /tasks/monthly-summary
// TaskDashboard：本月推薦摘要（本月被推薦者列表）
// ============================================================
app.get('/tasks/monthly-summary', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const currentMonth = twCurrentMonth();
  const monthStart   = new Date(`${currentMonth}-01T00:00:00+08:00`).toISOString();
  const nextMonth    = new Date(Date.now() + 8 * 3600_000);
  nextMonth.setUTCDate(1);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthEnd = new Date(nextMonth.getTime() - 1).toISOString();

  const client = sb();
  const { data: edges } = await client
    .from('referral_edges')
    .select('referee_user_id, referred_at')
    .eq('referrer_user_id', user.id)
    .gte('referred_at', monthStart)
    .lte('referred_at', monthEnd);

  const refIds = (edges ?? []).map((e: any) => e.referee_user_id);
  let nameMap: Record<string, string> = {};
  if (refIds.length) {
    const { data: profs } = await client.from('profiles').select('id, name').in('id', refIds);
    nameMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.name]));
  }

  const referrals = (edges ?? []).map((e: any) => ({
    userId:    e.referee_user_id,
    userName:  nameMap[e.referee_user_id] ?? '',
    createdAt: e.referred_at,
  }));

  return c.json({
    success: true,
    data: { month: currentMonth, referralCount: referrals.length, referrals },
  });
});

// ============================================================
// GET /tasks/current-month-top
// TaskDashboard：本月推薦排行榜
// ============================================================
app.get('/tasks/current-month-top', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const limit        = Math.min(parseInt(c.req.query('limit') || '10'), 200);
  const currentMonth = twCurrentMonth();

  const client = sb();
  const { data: allProgress } = await client
    .from('task_progress')
    .select('user_id, monthly_referrals');

  const ranked = (allProgress ?? [])
    .map((p: any) => {
      const monthVal = ((p.monthly_referrals as Record<string, any>) ?? {})[currentMonth];
      return { userId: p.user_id, count: Array.isArray(monthVal) ? monthVal.length : 0 };
    })
    .filter((r: any) => r.count > 0)
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, limit);

  const userIds = ranked.map((r: any) => r.userId);
  let nameMap: Record<string, string> = {};
  if (userIds.length) {
    const { data: profs } = await client.from('profiles').select('id, name').in('id', userIds);
    nameMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.name]));
  }

  const rankings = ranked.map((r: any, i: number) => ({
    rank:          i + 1,
    userId:        r.userId,
    userName:      nameMap[r.userId] ?? '',
    referralCount: r.count,
  }));

  return c.json({ success: true, data: { month: currentMonth, rankings } });
});

// ============================================================
// POST /tasks/claim-reward/:id
// 新版：獎勵自動發放，不支援手動領取
// ============================================================
app.post('/tasks/claim-reward/:id', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);
  return c.json({
    success: false,
    error:   '新版系統獎勵已於達成條件時自動發放，無需手動領取',
  }, 400);
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
  ] = await Promise.all([
    client.from('profiles').select('id, name, referred_by_code, registration_step').eq('id', targetId).single(),
    client.from('user_account_status').select('status, end_date').eq('user_id', targetId).single(),
    client.from('referral_edges').select('referee_user_id, referred_at').eq('referrer_user_id', targetId),
    client.from('referral_codes').select('code, status').eq('user_id', targetId).maybeSingle(),
  ]);

  return c.json({
    success: true,
    data: {
      profile: profile ? {
        name:             profile.name,
        referralCode:     code?.code ?? null,
        referredByCode:   profile.referred_by_code,
        registrationStep: profile.registration_step,
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

Deno.serve(app.fetch);
