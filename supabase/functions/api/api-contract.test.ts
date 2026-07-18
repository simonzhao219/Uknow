// ============================================================
// API 契約測試：用 _shared/api-contract.ts 的 runtime validator 驗證
// 真實回應形狀。編譯期的 `satisfies` 攔不住「欄位名稱打錯 / DB 欄位
// 改名後悄悄變 undefined」這類漂移，這裡才攔得住——後端形狀一漂移
// 直接紅 CI（歷史教訓：/rewards/history 回 transactions 但前端讀
// history，獎勵明細永遠空白，沒有任何測試發現）。
// ============================================================
import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  getActiveReferralCode,
  getUserAccessToken,
  payForUser,
} from './test-helpers.ts';
import {
  assertShape,
  ProfileResponseSchema,
  SubscriptionStatusResponseSchema,
  RewardsSummaryResponseSchema,
  WithdrawalsResponseSchema,
  RewardHistoryResponseSchema,
  ReferralTreeResponseSchema,
  TasksResponseSchema,
  PendingRewardsResponseSchema,
  CurrentMonthReferralsResponseSchema,
} from '../_shared/api-contract.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { app } = await import('./index.ts');

async function getJson(path: string, token?: string) {
  const res = await app.request(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// 共用種子：推薦人 + 2 位已付款下線。一次建好，多個測試共用。
const client = adminClient();
const referrer = await createTestUser(client, { name: 'Contract Referrer' });
const refereeIds: string[] = [];
{
  const { error } = await payForUser(client, referrer.id);
  if (error) throw new Error(`seed payForUser failed: ${error.message}`);
  const code = await getActiveReferralCode(client, referrer.id);
  for (let i = 0; i < 2; i++) {
    const referee = await createTestUser(client, { name: `Contract Referee ${i}`, referredByCode: code });
    refereeIds.push(referee.id);
    const { error: payErr } = await payForUser(client, referee.id);
    if (payErr) throw new Error(`seed referee pay failed: ${payErr.message}`);
  }
}
const token = await getUserAccessToken(client, referrer.email);

function cleanup() {
  return deleteTestUsers(client, [referrer.id, ...refereeIds]);
}

Deno.test('未帶 token 的讀端點一律 401', async () => {
  for (const path of ['/rewards/history', '/tasks/current-month-top', '/tasks', '/rewards']) {
    const { status } = await getJson(path);
    assertEquals(status, 401, `${path} 未授權應回 401`);
  }
});

Deno.test('GET /rewards/history：契約形狀 + 分頁 + 餘額對帳', async () => {
  const { status, body } = await getJson('/rewards/history?limit=1&offset=0', token);
  assertEquals(status, 200);
  const parsed = assertShape(RewardHistoryResponseSchema, body, 'GET /rewards/history');
  assertEquals(parsed.data.limit, 1);
  assertEquals(parsed.data.offset, 0);
  assert(parsed.data.total >= 2, `推薦人應至少有 2 筆 gen1 獎勵，實際 total=${parsed.data.total}`);
  assertEquals(parsed.data.history.length, 1);

  // 分頁不重疊 + offset 回聲
  const page2 = await getJson('/rewards/history?limit=1&offset=1', token);
  const parsed2 = assertShape(RewardHistoryResponseSchema, page2.body, 'GET /rewards/history p2');
  assertEquals(parsed2.data.offset, 1);
  assert(parsed2.data.history[0].id !== parsed.data.history[0].id, '不同 offset 不應回同一筆');

  // 最新一筆的 balance = reward_balances.available（帳本口徑一致）
  const { data: bal } = await client
    .from('reward_balances').select('available').eq('user_id', referrer.id).single();
  assertEquals(parsed.data.history[0].balance, bal!.available);
});

Deno.test('GET /rewards/history?type=：type 篩選在後端下推（count 為該分類總數）', async () => {
  // referral：只回推薦獎勵；種子有 2 筆 gen1，total 應 >= 2 且每筆都是 referral_*
  const ref = await getJson('/rewards/history?type=referral&limit=50&offset=0', token);
  assertEquals(ref.status, 200);
  const refParsed = assertShape(RewardHistoryResponseSchema, ref.body, 'GET /rewards/history?type=referral');
  assert(refParsed.data.total >= 2, `type=referral 應至少 2 筆，實際 ${refParsed.data.total}`);
  assert(
    refParsed.data.history.every((r) => r.type.startsWith('referral_')),
    'type=referral 只應回 referral_* 類型',
  );

  // withdrawal：此推薦人無提領 → total=0、history 空（證明 count 隨 filter 變）
  const wd = await getJson('/rewards/history?type=withdrawal&limit=50&offset=0', token);
  const wdParsed = assertShape(RewardHistoryResponseSchema, wd.body, 'GET /rewards/history?type=withdrawal');
  assertEquals(wdParsed.data.total, 0, 'type=withdrawal 對無提領者 total 應為 0');
  assertEquals(wdParsed.data.history.length, 0);

  // all（未帶 type）：涵蓋全部，total 不應小於單一分類
  const all = await getJson('/rewards/history?limit=50&offset=0', token);
  const allParsed = assertShape(RewardHistoryResponseSchema, all.body, 'GET /rewards/history all');
  assert(allParsed.data.total >= refParsed.data.total, 'all 的 total 不應小於 referral 分類');
});

Deno.test('GET /tasks/current-month-top：個人本月推薦明細（不是排行榜）', async () => {
  const { status, body } = await getJson('/tasks/current-month-top?limit=100', token);
  assertEquals(status, 200);
  const parsed = assertShape(CurrentMonthReferralsResponseSchema, body, 'GET /tasks/current-month-top');
  assertEquals(parsed.data.total, 2);
  assertEquals(parsed.data.currentProgress, 2);
  assertEquals(parsed.data.completedCount, 0);
  assertEquals(parsed.data.referrals.length, 2);
  assertEquals(parsed.data.target, 8, 'target 應帶推薦王門檻（reward_config 預設 8）');
  assert(parsed.data.referrals[0].userName.length > 0, '應帶被推薦人姓名');
  assert(parsed.data.referrals.every((r) => r.createdAt !== null), '應帶推薦成立時間');
});

Deno.test('GET /tasks：恰一個 monthly_king 任務', async () => {
  const { status, body } = await getJson('/tasks', token);
  assertEquals(status, 200);
  const parsed = assertShape(TasksResponseSchema, body, 'GET /tasks');
  assertEquals(parsed.data.tasks.length, 1);
  assertEquals(parsed.data.tasks[0].type, 'monthly_king');
  assertEquals(parsed.data.tasks[0].current, 2);
  assertEquals(parsed.data.tasks[0].target, 8, 'target 應帶推薦王門檻（reward_config 預設 8）');
});

Deno.test('GET /tasks/pending-rewards：契約形狀', async () => {
  // 直接塞一筆 unclaimed credit（8 人門檻的完整路徑由
  // referral-king-reward.test.ts 覆蓋，這裡只驗形狀）。
  const { error } = await client.from('referral_king_rewards').insert({
    user_id: referrer.id, month_key: '2099-01', status: 'unclaimed',
    granted_at: new Date().toISOString(),
  });
  assertEquals(error, null);

  const { status, body } = await getJson('/tasks/pending-rewards', token);
  assertEquals(status, 200);
  const parsed = assertShape(PendingRewardsResponseSchema, body, 'GET /tasks/pending-rewards');
  assert(parsed.data.length >= 1);
  assertEquals(parsed.data[0].rewardType, 'free_renewal_year');

  await client.from('referral_king_rewards').delete()
    .eq('user_id', referrer.id).eq('month_key', '2099-01');
});

Deno.test('GET /tasks/monthly-summary 已刪除（404）', async () => {
  const { status } = await getJson('/tasks/monthly-summary', token);
  assertEquals(status, 404);
});

Deno.test('其餘讀端點契約形狀（rewards / withdrawals / subscriptions / my-tree / profile）', async () => {
  const rewards = await getJson('/rewards', token);
  assertShape(RewardsSummaryResponseSchema, rewards.body, 'GET /rewards');

  const withdrawals = await getJson('/rewards/withdrawals', token);
  assertShape(WithdrawalsResponseSchema, withdrawals.body, 'GET /rewards/withdrawals');

  const subStatus = await getJson('/subscriptions/status', token);
  const subParsed = assertShape(SubscriptionStatusResponseSchema, subStatus.body, 'GET /subscriptions/status');
  assertEquals(subParsed.data.status, 'active');
  assert(subParsed.data.currentPeriodEnd !== null, '應回訂閱週期迄日');

  const tree = await getJson('/referrals/my-tree', token);
  const treeParsed = assertShape(ReferralTreeResponseSchema, tree.body, 'GET /referrals/my-tree');
  assertEquals(treeParsed.data.summary.firstGenCount, 2);

  const profile = await getJson('/profile', token);
  const profileParsed = assertShape(ProfileResponseSchema, profile.body, 'GET /profile');
  assertEquals(profileParsed.accountStatus, 'active');
  assertEquals(profileParsed.registrationStep, 3);
});

Deno.test('cleanup（最後執行：清掉共用種子）', async () => {
  await cleanup();
});
