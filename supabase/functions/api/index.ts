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
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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
// PayUni 設定
// ============================================================
function payuniConfig() {
  const key  = Deno.env.get('PAYUNI_HASH_KEY')!;
  const iv   = Deno.env.get('PAYUNI_HASH_IV')!;
  const merID = Deno.env.get('PAYUNI_MER_ID')!;
  if (!key || !iv || !merID) throw new Error('PayUni 環境變數未設定');
  return {
    merID,
    hashKey: key,
    hashIV:  iv,
    // 使用定期扣款 API，PeriodTimes=1 表示一次性付清，不自動續扣
    apiUrl: 'https://api.payuni.com.tw/api/period/Page',
  };
}

function generateTradeNo(userId: string): string {
  const now = new Date(Date.now() + 8 * 3600_000);  // UTC+8
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
             `${pad(now.getUTCHours())}${Math.floor(now.getUTCMinutes() / 10)}`;
  const uid14 = userId.replace(/-/g, '').substring(0, 14).padEnd(14, '0');
  return `${ts}${uid14}`;  // 25 chars
}

// ============================================================
// GET /profile
// 供 App.tsx 在啟動時載入用戶狀態（兼容過渡期）
// 回傳形狀盡量與舊 /auth/profile 相容
// ============================================================
app.get('/profile', async (c) => {
  const user = await requireAuth(c);
  if (!user) return c.json({ error: '未授權' }, 401);

  const client = sb();

  const [{ data: profile }, { data: acct }, { data: code }] = await Promise.all([
    client.from('profiles').select('*').eq('id', user.id).single(),
    client.from('user_account_status').select('status, end_date, grace_period_end').eq('user_id', user.id).single(),
    client.from('referral_codes').select('code').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
  ]);

  if (!profile) return c.json({ error: '用戶不存在' }, 404);

  return c.json({
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
    email:           user.email,
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

  // 查 profile 取得姓名 / 電話
  const { data: profile } = await client
    .from('profiles')
    .select('name, phone')
    .eq('id', user.id)
    .single();
  if (!profile) return c.json({ success: false, error: '用戶資料不存在' }, 404);

  const config  = payuniConfig();
  const tradeNo = generateTradeNo(user.id);

  const projectId   = Deno.env.get('SUPABASE_URL')!.match(/https:\/\/(.+)\.supabase\.co/)![1];
  const frontendUrl = Deno.env.get('FRONTEND_URL')!.replace(/\/$/, '');

  const encryptData = {
    MerID:       config.merID,
    MerTradeNo:  tradeNo,
    PeriodAmt:   1200,
    ProdDesc:    'Uknow 年費會員',
    PayerName:   profile.name || '',
    PayerPhone:  profile.phone || '',
    PayerEmail:  user.email || '',
    PeriodType:  'year',
    PeriodDate:  new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '/'),
    PeriodTimes: 1,         // ← 1 = 一次性，不自動續扣
    FType:       'build',
    NotifyURL:   `https://${projectId}.supabase.co/functions/v1/api/webhooks/payuni/notify`,
    ReturnURL:   `${frontendUrl}/payment/result?tradeNo=${tradeNo}`,
  };

  const encryptInfo = encryptPayUni(encryptData, config.hashKey, config.hashIV);
  const hashInfo    = generatePayUniHash(encryptInfo, config.hashKey, config.hashIV);

  // 寫入 payment_orders（用 tradeNo 作為 transaction_id 方便後續查詢）
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
      Version:     '1.0',
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
