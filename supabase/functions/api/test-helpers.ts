// ============================================================
// 測試專用 helper：連到本地 `supabase start` 實例的 service-role client
// 與測試使用者建立/清除工具。只給 *.test.ts 使用，不會被 index.ts import。
// ============================================================
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// `supabase start` 固定用 CLI 內建的 demo JWT secret（這個 repo 的
// supabase/config.toml 沒有覆寫），所以本地端的 service-role key 是
// 公開、固定不變的值（`supabase status -o env` 印出來的 SERVICE_ROLE_KEY），
// 不是真正的密鑰。CI 若改用其他方式啟動本地 Supabase，可用環境變數覆寫。
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  ?? 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA5OTUxNzg3NH0.NOO6XuN2hBOf4kSPXeCbtKxc55pJgRqmOJtLFMKmGH0KAYcOYo1el2sqZTVTi4kXPtgAghlLvX4nkUdQ3_cJFw';

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 讓 index.ts 內部的 sb()（讀環境變數）指向同一個本地實例——
// 直接測 index.ts 匯出的函數/路由（app.request()）時需要。
export function ensureEdgeFunctionEnv(): void {
  Deno.env.set('SUPABASE_URL', SUPABASE_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
}

let counter = 0;

// 建立測試使用者：透過 auth.admin.createUser + user_metadata.referred_by_code，
// 讓 handle_new_user() trigger（20260620000009）用跟真實註冊完全一樣的路徑
// 解析 referred_by_user_id，不用手動戳 profiles。
export async function createTestUser(
  client: SupabaseClient,
  opts: { name: string; referredByCode?: string } = { name: 'Test User' },
): Promise<{ id: string; email: string }> {
  const email = `test-${Date.now()}-${counter++}@example.invalid`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      name: opts.name,
      ...(opts.referredByCode ? { referred_by_code: opts.referredByCode } : {}),
    },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? 'no user returned'}`);
  }
  return { id: data.user.id, email };
}

export async function deleteTestUsers(client: SupabaseClient, userIds: string[]): Promise<void> {
  for (const id of userIds) {
    await client.auth.admin.deleteUser(id).catch(() => {});
  }
}

// 讓一個使用者「完成一次付款」的最短路徑：自己塞一筆 pending 訂單，
// 直接呼叫 process_successful_payment RPC（跳過 HTTP/webhook 層，
// 因為我們要測的是 DB 邏輯本身）。回傳 RPC 結果 + 這次用的 trade_no。
export async function payForUser(
  client: SupabaseClient,
  userId: string,
  opts: { tradeNo?: string; payuniResponse?: Record<string, unknown> } = {},
): Promise<{ tradeNo: string; data: any; error: any }> {
  const tradeNo = opts.tradeNo ?? `TEST-${userId}-${counter++}`;
  const { error: insertErr } = await client.from('payment_orders').insert({
    user_id: userId,
    amount: 1200,
    status: 'pending',
    payment_method: 'payuni',
    transaction_id: tradeNo,
  });
  if (insertErr) throw new Error(`payForUser insert failed: ${insertErr.message}`);

  const { data, error } = await client.rpc('process_successful_payment', {
    p_user_id: userId,
    p_trade_no: tradeNo,
    p_transaction_id: tradeNo,
    p_payuni_response: opts.payuniResponse ?? { Status: 'SUCCESS' },
  });

  return { tradeNo, data, error };
}

// 取得某測試使用者的真實 access token（給需要 requireAuth 的 HTTP 路由
// 測試用）：admin.generateLink 產生 magiclink 的 hashed_token，再用
// verifyOtp 換一個真的 session——不需要知道本地實例的 anon key。
export async function getUserAccessToken(client: SupabaseClient, email: string): Promise<string> {
  const { data: linkData, error: linkError } = await client.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(`getUserAccessToken generateLink failed: ${linkError?.message ?? 'no token'}`);
  }
  // verifyOtp 會把換到的 user session 存在 client 上，之後同一個 client 的
  // PostgREST 請求都會帶這個使用者的 Authorization、受 RLS 限制——所以
  // 一定要用丟棄式 client 來換 token，不能污染呼叫端的 admin client。
  const throwaway = adminClient();
  const { data: otpData, error: otpError } = await throwaway.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email',
  });
  if (otpError || !otpData?.session?.access_token) {
    throw new Error(`getUserAccessToken verifyOtp failed: ${otpError?.message ?? 'no session'}`);
  }
  return otpData.session.access_token;
}

export async function getActiveReferralCode(client: SupabaseClient, userId: string): Promise<string> {
  const { data } = await client
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  if (!data) throw new Error(`getActiveReferralCode: no active code for ${userId}`);
  return data.code;
}
