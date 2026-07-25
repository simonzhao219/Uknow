// ============================================================
// API 契約測試：用 _shared/api-contract.ts 的 runtime validator 驗證
// 真實回應形狀。編譯期的 `satisfies` 攔不住「欄位名稱打錯 / DB 欄位
// 改名後悄悄變 undefined」這類漂移，這裡才攔得住——後端形狀一漂移
// 直接紅 CI（歷史教訓：/rewards/history 回 transactions 但前端讀
// history，獎勵明細永遠空白，沒有任何測試發現）。
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
import {
  assertShape,
  CurrentMonthReferralsResponseSchema,
  PendingRewardsResponseSchema,
  ProfileResponseSchema,
  RewardHistoryResponseSchema,
  RewardsSummaryResponseSchema,
  SubscriptionStatusResponseSchema,
  TasksResponseSchema,
  WithdrawalsResponseSchema,
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
    const referee = await createTestUser(client, {
      name: `Contract Referee ${i}`,
      referredByCode: code,
    });
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
  // 種子的 2 位下線各是「第一次替推薦人帶來獎勵」→ referral_signup（非續約）
  assertEquals(parsed.data.history[0].sourceCategory, 'referral_signup');

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

Deno.test('GET /rewards/history?source=：來源分類篩選在後端下推（count 為該分類集合總數）', async () => {
  // referral_signup：種子的 2 筆 gen1 都是各自被推薦人的第一筆（配對視角的「新人」）
  const rp = await getJson('/rewards/history?source=referral_signup&limit=50&offset=0', token);
  assertEquals(rp.status, 200);
  const rpParsed = assertShape(RewardHistoryResponseSchema, rp.body, 'GET ?source=referral_signup');
  assert(
    rpParsed.data.total >= 2,
    `source=referral_signup 應至少 2 筆，實際 ${rpParsed.data.total}`,
  );
  assert(
    rpParsed.data.history.every((r) => r.sourceCategory === 'referral_signup'),
    'source=referral_signup 只應回 referral_signup',
  );

  // referral_renewal：種子的下線都只付過一次 → total=0（證明拉新與續約分得開）
  const rt = await getJson('/rewards/history?source=referral_renewal&limit=50&offset=0', token);
  const rtParsed = assertShape(
    RewardHistoryResponseSchema,
    rt.body,
    'GET ?source=referral_renewal',
  );
  assertEquals(rtParsed.data.total, 0, 'source=referral_renewal 對無續約下線者 total 應為 0');

  // withdrawal：此推薦人無提領 → total=0（證明 count 隨 filter 變）
  const wd = await getJson('/rewards/history?source=withdrawal&limit=50&offset=0', token);
  const wdParsed = assertShape(RewardHistoryResponseSchema, wd.body, 'GET ?source=withdrawal');
  assertEquals(wdParsed.data.total, 0, 'source=withdrawal 對無提領者 total 應為 0');
  assertEquals(wdParsed.data.history.length, 0);

  // 多選 CSV：referral_signup + withdrawal → 等於兩分類相加（此處 withdrawal=0）
  const multi = await getJson(
    '/rewards/history?source=referral_signup,withdrawal&limit=50&offset=0',
    token,
  );
  const multiParsed = assertShape(RewardHistoryResponseSchema, multi.body, 'GET ?source=multi');
  assertEquals(
    multiParsed.data.total,
    rpParsed.data.total + wdParsed.data.total,
    '多選 total 應等於各分類相加',
  );

  // all（未帶 source）：涵蓋全部，total 不應小於單一分類
  const all = await getJson('/rewards/history?limit=50&offset=0', token);
  const allParsed = assertShape(RewardHistoryResponseSchema, all.body, 'GET /rewards/history all');
  assert(allParsed.data.total >= rpParsed.data.total, 'all 的 total 不應小於單一分類');

  // facet：篩選器的選項來源。恆為未篩選全集（不隨 ?source= 收斂），且各分類
  // 筆數加總 = 全部總數——「四個篩選加起來 ≠ 全部」正是它要防的 bug。
  assertEquals(
    multiParsed.data.sources.length,
    allParsed.data.sources.length,
    'facet 不應隨 ?source= 收斂（否則選了一類就切不回其他類）',
  );
  assertEquals(
    allParsed.data.sources.reduce((sum, f) => sum + f.count, 0),
    allParsed.data.total,
    'facet 各分類筆數加總應等於全部總數',
  );
  const signupFacet = allParsed.data.sources.find((f) => f.sourceCategory === 'referral_signup');
  assertEquals(signupFacet?.count, rpParsed.data.total, 'facet 筆數應等於該分類篩選後的 total');
  assert(
    !allParsed.data.sources.some((f) => f.count === 0),
    'facet 不應含筆數 0 的分類（篩不到東西的 chip 是雜訊）',
  );
});

Deno.test('下線再次付款：同一配對的後續獎勵歸 referral_renewal（拉新／續約軸）', async () => {
  // 分類軸不是冪等鍵而是「拉新 vs 留存」：同一位被推薦人第二次付款帶來的獎勵
  // 是續約，不是新人。此測試把該軸釘在真實付款路徑上（見 migration 0725 0002）。
  const { error } = await payForUser(client, refereeIds[0]);
  assertEquals(error, null, '種子下線二次付款應成功');

  const all = await getJson('/rewards/history?limit=50&offset=0', token);
  const allParsed = assertShape(RewardHistoryResponseSchema, all.body, 'GET all after renewal');

  const renewals = allParsed.data.history.filter((r) => r.sourceCategory === 'referral_renewal');
  assertEquals(renewals.length, 1, '第二次付款應恰產生 1 筆續約獎勵');
  assertEquals(
    renewals[0].viaFreeRenewal,
    undefined,
    '付款續約不帶 viaFreeRenewal（該旗標專指免費續約券）',
  );
  assertEquals(
    allParsed.data.history.filter((r) => r.sourceCategory === 'referral_signup').length,
    2,
    '既有的 2 筆首次獎勵不應被重新分類',
  );

  // facet 跟著長出新分類，加總仍守恆
  const facetTotal = allParsed.data.sources.reduce((sum, f) => sum + f.count, 0);
  assertEquals(facetTotal, allParsed.data.total, '新分類出現後 facet 加總仍應等於全部');
  assertEquals(
    allParsed.data.sources.find((f) => f.sourceCategory === 'referral_renewal')?.count,
    1,
  );
});

Deno.test('GET /tasks/current-month-top：個人本月推薦明細（不是排行榜）', async () => {
  const { status, body } = await getJson('/tasks/current-month-top?limit=100', token);
  assertEquals(status, 200);
  const parsed = assertShape(
    CurrentMonthReferralsResponseSchema,
    body,
    'GET /tasks/current-month-top',
  );
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
    user_id: referrer.id,
    month_key: '2099-01',
    status: 'unclaimed',
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

Deno.test('GET /referrals/my-tree 已退役（404）——Tier C：前端已切換 /referrals/network/*', async () => {
  const { status } = await getJson('/referrals/my-tree', token);
  assertEquals(status, 404);
});

Deno.test('其餘讀端點契約形狀（rewards / withdrawals / subscriptions / profile）', async () => {
  const rewards = await getJson('/rewards', token);
  assertShape(RewardsSummaryResponseSchema, rewards.body, 'GET /rewards');

  const withdrawals = await getJson('/rewards/withdrawals', token);
  assertShape(WithdrawalsResponseSchema, withdrawals.body, 'GET /rewards/withdrawals');

  const subStatus = await getJson('/subscriptions/status', token);
  const subParsed = assertShape(
    SubscriptionStatusResponseSchema,
    subStatus.body,
    'GET /subscriptions/status',
  );
  assertEquals(subParsed.data.status, 'active');
  assert(subParsed.data.currentPeriodEnd !== null, '應回訂閱週期迄日');
  // 兩態模型（移除寬限期）後 gracePeriodEnd 為死欄位——回應不應再帶它。
  // obj() 非嚴格（忽略多餘鍵），故在此顯式斷言鍵不存在。
  assert(
    !('gracePeriodEnd' in (subStatus.body as { data: Record<string, unknown> }).data),
    '/subscriptions/status 不應再回傳 gracePeriodEnd',
  );

  const profile = await getJson('/profile', token);
  const profileParsed = assertShape(ProfileResponseSchema, profile.body, 'GET /profile');
  assertEquals(profileParsed.accountStatus, 'active');
  assertEquals(profileParsed.registrationStep, 3);
});

Deno.test('cleanup（最後執行：清掉共用種子）', async () => {
  await cleanup();
});
