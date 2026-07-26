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
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA5OTUxNzg3NH0.NOO6XuN2hBOf4kSPXeCbtKxc55pJgRqmOJtLFMKmGH0KAYcOYo1el2sqZTVTi4kXPtgAghlLvX4nkUdQ3_cJFw';

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// anon key 刻意**沒有**像 SERVICE_ROLE_KEY 那樣的寫死 fallback：它由
// `supabase start` 當場產生，寫死一個只會過期騙人。CI 已從
// `supabase status -o env` 匯出（ci.yml 的「匯出本地 Supabase 連線資訊」）。
//
// 缺少時**明確失敗**而不是靜默跳過：需要它的那條測試在驗「使用者 token
// 直寫 PostgREST 被拒」，靜默跳過會讓這道防線在無人察覺的情況下失去驗證。
function anonKey(): string {
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!key) {
    throw new Error(
      'SUPABASE_ANON_KEY 未設定，無法測「使用者 token 直寫 PostgREST」。本機請先執行：' +
        `export SUPABASE_ANON_KEY=$(supabase status -o env | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')`,
    );
  }
  return key;
}

// 以**使用者 token** 直接打 PostgREST（不經 Edge Function），用來驗證
// column-level GRANT 是否真的擋住自助寫入。
//
// 為什麼需要新 helper：既有測試拿到的 access token 一律只餵給
// `app.request()`（Hono in-process 呼叫），完全不經過 PostgREST 閘道——
// 那條路徑的欄位權限行為因此從未被任何測試碰到，而它正是姓名格式驗證
// 最大的繞過面（見 20260726000002 migration 檔頭）。
// **刻意不帶 `Prefer: return=representation`**:那會讓 PostgREST 在 UPDATE 之後
// 補一次 SELECT，而 `authenticated` 沒有 `profiles` 的 table-level SELECT 權限
// （migrations 裡從來沒有 `grant select ... on profiles`——前端讀 profile 一律
// 走 Edge Function 的 service_role），於是**任何**欄位的 PATCH 都會回 403
// `42501 permission denied for table profiles`。
//
// 那個 403 來自 SELECT 而非 UPDATE，會讓這支 helper 完全失去辨別力:
// 「撤銷 name 的 UPDATE 後直寫被拒」這條斷言即使在 REVOKE 根本沒生效的情況下
// 也會通過。成功時 PostgREST 回 204 No Content，`res.ok` 仍為 true。
export async function patchProfileAsUser(
  accessToken: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey(),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
}

// 讓 index.ts 內部的 sb()（讀環境變數）指向同一個本地實例——
// 直接測 index.ts 匯出的函數/路由（app.request()）時需要。
export function ensureEdgeFunctionEnv(): void {
  Deno.env.set('SUPABASE_URL', SUPABASE_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
}

let counter = 0;

// 建立測試使用者：`referred_by_code` 仍走 user_metadata，讓
// handle_new_user() trigger 用跟真實註冊完全一樣的路徑解析
// referred_by_user_id；**姓名改用 service_role 直寫**。
//
// 為什麼姓名不能再走 metadata：20260726000002 起 handle_new_user() 不再讀
// `raw_user_meta_data ->> 'name'`（那條路徑對外可達、繞過所有格式驗證），
// 一律寫入空字串。繼續靠 metadata 帶姓名的話，所有依賴姓名的測試會靜默
// 拿到空字串。
//
// 為什麼是 service_role 直寫而不是改呼叫 `POST /auth/register`：後者要求
// name/phone/birthDate 皆非空，補上 phone/birth_date 會讓
// effective_registration_step 從 0 變 1，直接打壞
// registration-step-contract.test.ts 一系列斷言（它們依賴「剛建立、資料
// 未填的使用者 registrationStep 為 0」）。直寫是唯一保住那個不變式的做法，
// 同層 registration-step-contract.test.ts 的 fillBasicProfile 已是既有前例。
// **刻意只碰 name，不碰 phone/birth_date。**
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
      ...(opts.referredByCode ? { referred_by_code: opts.referredByCode } : {}),
    },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? 'no user returned'}`);
  }
  if (opts.name) {
    const { error: nameError } = await client
      .from('profiles')
      .update({ name: opts.name })
      .eq('id', data.user.id);
    if (nameError) {
      throw new Error(`createTestUser set name failed: ${nameError.message}`);
    }
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

export async function getActiveReferralCode(
  client: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await client
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  if (!data) throw new Error(`getActiveReferralCode: no active code for ${userId}`);
  return data.code;
}
