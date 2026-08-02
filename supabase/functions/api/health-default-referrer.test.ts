// ============================================================
// A12（renewal-backfill 階段 7）：/health 回報 defaultReferrer 三態
//   'ok'      預設推薦碼存在且可通過 validate_referral_code
//   'unset'   reward_config.default_referrer_code 為 null / 空字串
//   'invalid' 碼不存在、已失效或碼主被停權
// 理由：default_referrer_code 只能人工 SQL 設定、沒有 admin UI 掛即時
// 驗證；部署 SOP 本來就會打 /health 比對 sha，順帶看得到 A10 機制是否
// 靜默失效。任何情況下 /health 都必須回 200（index.ts /health 原則）。
//
// ⚠️ 本測試會改動全域單列 reward_config 的 default_referrer_code，
// 務必在 finally 還原原值。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();

const { app } = await import('./index.ts');

async function snapshotDefaultCode(client: ReturnType<typeof adminClient>) {
  const { data } = await client
    .from('reward_config')
    .select('default_referrer_code')
    .eq('id', true)
    .single();
  return data?.default_referrer_code ?? null;
}

async function setDefaultCode(client: ReturnType<typeof adminClient>, code: string | null) {
  const { error } = await client
    .from('reward_config')
    .update({ default_referrer_code: code })
    .eq('id', true);
  assertEquals(error, null, `設定 default_referrer_code 失敗: ${error?.message}`);
}

async function getHealth() {
  const res = await app.request('/api/health');
  const body = await res.json();
  return { status: res.status, body };
}

Deno.test('/health：預設碼有效 → defaultReferrer=ok', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const owner = await createTestUser(client, { name: 'Health Default Owner' });

  try {
    assertEquals((await payForUser(client, owner.id)).error, null);
    await setDefaultCode(client, await getActiveReferralCode(client, owner.id));

    const { status, body } = await getHealth();
    assertEquals(status, 200);
    assertEquals(body.defaultReferrer, 'ok');
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [owner.id]);
  }
});

Deno.test('/health：預設碼未設定（null 或空字串）→ defaultReferrer=unset', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);

  try {
    await setDefaultCode(client, null);
    const nullRes = await getHealth();
    assertEquals(nullRes.status, 200);
    assertEquals(nullRes.body.defaultReferrer, 'unset');

    await setDefaultCode(client, '   ');
    const blankRes = await getHealth();
    assertEquals(blankRes.status, 200);
    assertEquals(blankRes.body.defaultReferrer, 'unset');
  } finally {
    await setDefaultCode(client, original);
  }
});

Deno.test('/health：預設碼不存在或碼主停權 → defaultReferrer=invalid', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const owner = await createTestUser(client, { name: 'Health Suspended Owner' });

  try {
    await setDefaultCode(client, 'no-such-code-health');
    const missing = await getHealth();
    assertEquals(missing.status, 200);
    assertEquals(missing.body.defaultReferrer, 'invalid');

    assertEquals((await payForUser(client, owner.id)).error, null);
    const code = await getActiveReferralCode(client, owner.id);
    const { error: susErr } = await client
      .from('profiles')
      .update({ suspended_at: new Date().toISOString() })
      .eq('id', owner.id);
    assertEquals(susErr, null);
    await setDefaultCode(client, code);

    const suspended = await getHealth();
    assertEquals(suspended.status, 200);
    assertEquals(suspended.body.defaultReferrer, 'invalid');

    // 既有欄位不因新增而消失（/health 是部署 SOP 的 sha 比對點）。
    assertEquals(typeof suspended.body.sha, 'string');
    assertEquals(suspended.body.ok, true);
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [owner.id]);
  }
});
