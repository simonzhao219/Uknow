// ============================================================
// GET /referrals/validate/:code —— 註冊第 2 步（CompleteProfile）與付款頁
// （PaymentCheckout）驗證推薦碼。
//
// 推薦碼是流水號，這支又回推薦人真名（規格書 §4.2 要求顯示、不遮罩——打錯碼
// 的唯一防呆）。匿名可呼叫時，任何人都能逐號枚舉已付費會員的真名。所有合法
// 呼叫者本來就帶 session，所以收斂成：需登入＋以使用者為鍵的雙窗限流＋回應
// 不帶推薦人 id。免費 Email OTP 帳號仍可慢速枚舉——枚舉面是從匿名降到需登入
// ＋限流，不是關閉。
//
// 同功能的匿名別名 POST /listings/verify-referral-code 一併移除：兩支各算各的
// 額度等於輪流打就有兩倍，留著一支不需登入的更是整個加固的破口。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

function validateReq(token: string | null, code: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return app.request(`/api/referrals/validate/${encodeURIComponent(code)}`, { headers });
}

/** 註冊中的使用者（尚未付款）——真實的呼叫者就是這種人。 */
async function createCaller(client: ReturnType<typeof adminClient>, name = '註冊中會員') {
  const user = await createTestUser(client, { name });
  const token = await getUserAccessToken(client, user.email);
  return { ...user, token };
}

async function cleanup(client: ReturnType<typeof adminClient>, ids: string[]) {
  for (const id of ids) {
    await client.from('rate_limits').delete()
      .in('key', [`referral-validate:${id}`, `referral-validate-day:${id}`]);
  }
  await deleteTestUsers(client, ids);
}

Deno.test('referrals/validate：匿名請求 → 401', async () => {
  const res = await validateReq(null, '1000001');
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test('referrals/validate：空白推薦碼 → valid=false 並提示不能為空', async () => {
  const client = adminClient();
  const caller = await createCaller(client);
  try {
    const res = await validateReq(caller.token, ' ');
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.valid, false);
    assertEquals(body.error?.message, '推薦碼不能為空');
  } finally {
    await cleanup(client, [caller.id]);
  }
});

Deno.test('referrals/validate：不存在的推薦碼 → valid=false', async () => {
  const client = adminClient();
  const caller = await createCaller(client);
  try {
    const res = await validateReq(caller.token, 'definitely-not-a-real-code');
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.valid, false);
  } finally {
    await cleanup(client, [caller.id]);
  }
});

Deno.test('referrals/validate：有效推薦碼 → 只回推薦人姓名與刊登名，不帶任何 id', async () => {
  const client = adminClient();
  const referrer = await createTestUser(client, { name: '推薦人' });
  const caller = await createCaller(client);
  try {
    await payForUser(client, referrer.id); // 產生 active 訂閱 + referral code
    const code = await getActiveReferralCode(client, referrer.id);

    const res = await validateReq(caller.token, code);
    assertEquals(res.status, 200);
    const text = await res.text();
    // 整份回應逐字比對：多帶任何欄位（userId、頂層 referrerUserId、舊欄位
    // referrerName）都會紅。推薦人的內部 id 對驗證碼毫無用處，只是外洩面。
    assertEquals(JSON.parse(text), {
      valid: true,
      referrer: { userName: '推薦人', listingName: null },
    });
    assert(!text.includes(referrer.id), '回應不得出現推薦人的 user id');
  } finally {
    await cleanup(client, [caller.id]);
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('referrals/validate：同一使用者 5 分鐘內第 11 次 → 429，其他使用者不受影響', async () => {
  const client = adminClient();
  const caller = await createCaller(client, '連續查碼者');
  const other = await createCaller(client, '一般註冊者');
  try {
    // 真的打 10 次（不是預先灌計數）：證明每一次請求都有被計入。
    for (let i = 1; i <= 10; i++) {
      const res = await validateReq(caller.token, `nope-${i}`);
      assertEquals(res.status, 200, `第 ${i} 次應放行，實際 ${res.status}`);
      await res.body?.cancel();
    }

    const blocked = await validateReq(caller.token, 'nope-11');
    assertEquals(blocked.status, 429);
    const body = await blocked.json();
    assertEquals(body.valid, false);
    assertEquals(body.error?.code, 'rate_limited');

    // 限流鍵是使用者，不是 IP：同一台機器上的另一個帳號照常可查。
    const otherRes = await validateReq(other.token, 'nope-other');
    assertEquals(otherRes.status, 200);
    await otherRes.body?.cancel();
  } finally {
    await cleanup(client, [caller.id, other.id]);
  }
});

Deno.test('referrals/validate：當日已查 50 次 → 第 51 次 429（短窗仍有額度）', async () => {
  const client = adminClient();
  const caller = await createCaller(client, '慢速枚舉者');
  try {
    // 灌滿每日窗口、短窗不動——釘住「每日上限」是獨立的第二道窗，
    // 也釘住鍵的形狀 `referral-validate-day:<使用者 id>`。
    for (let i = 0; i < 50; i++) {
      await client.rpc('bump_rate_limit', {
        p_key: `referral-validate-day:${caller.id}`,
        p_max: 50,
        p_window_seconds: 86400,
      });
    }

    const res = await validateReq(caller.token, 'nope');
    assertEquals(res.status, 429);
    const body = await res.json();
    assertEquals(body.error?.code, 'rate_limited');
  } finally {
    await cleanup(client, [caller.id]);
  }
});

Deno.test('verify-referral-code：匿名別名已移除 → 404', async () => {
  const res = await app.request('/api/listings/verify-referral-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '1000001' }),
  });
  assertEquals(res.status, 404);
  await res.body?.cancel();
});
