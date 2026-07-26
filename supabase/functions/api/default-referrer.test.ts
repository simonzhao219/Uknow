// ============================================================
// 預設推薦人（未填推薦碼時自動綁定）— resolve_default_referrer 與
// apply_referral_side_effects 的整合行為。
//
// 規劃書：docs/plans/default-referral-code/plan.md（驗收情境 A–M）
//
// ⚠️ 本測試會改動全域單列 reward_config 的 default_referrer_code，
// 務必在 finally 還原原值（比照 reward-config.test.ts 的紀律），
// 否則殘留的設定會讓其他「建立無推薦人使用者並付款」的測試檔
// （task-new-downline-only、referral-king-reward 等）意外觸發綁定。
//
// ⚠️ 測試一律自建推薦碼當預設值，不依賴任何環境既有的字面碼——
// 依賴不存在的碼會走 fallback 路徑，綠燈卻沒證明主路徑。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  getActiveReferralCode,
  payForUser,
} from './test-helpers.ts';

/** 讀 reward_config 的 default_referrer_code 原值（供 finally 還原）。 */
async function snapshotDefaultCode(client: ReturnType<typeof adminClient>) {
  const { data } = await client
    .from('reward_config')
    .select('default_referrer_code')
    .eq('id', true)
    .single();
  return data?.default_referrer_code ?? null;
}

async function setDefaultCode(
  client: ReturnType<typeof adminClient>,
  code: string | null,
) {
  const { error } = await client
    .from('reward_config')
    .update({ default_referrer_code: code })
    .eq('id', true);
  assertEquals(error, null, `設定 default_referrer_code 失敗: ${error?.message}`);
}

/** 取使用者最新一筆 subscription id（payForUser 之後呼叫）。 */
async function latestSubscriptionId(
  client: ReturnType<typeof adminClient>,
  userId: string,
): Promise<string> {
  const { data } = await client
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!data) throw new Error(`latestSubscriptionId: no subscription for ${userId}`);
  return data.id;
}

async function resolveDefaultReferrer(
  client: ReturnType<typeof adminClient>,
  userId: string,
  subscriptionId: string,
): Promise<string | null> {
  const { data, error } = await client.rpc('resolve_default_referrer', {
    p_user_id: userId,
    p_subscription_id: subscriptionId,
  });
  assertEquals(error, null, `resolve_default_referrer rpc 失敗: ${error?.message}`);
  return data ?? null;
}

Deno.test('resolve_default_referrer：設定為 null（停用）→ 不套用', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const user = await createTestUser(client, { name: '停用情境使用者' });
  try {
    await setDefaultCode(client, null);
    const { error } = await payForUser(client, user.id);
    assertEquals(error, null);
    const subId = await latestSubscriptionId(client, user.id);
    const resolved = await resolveDefaultReferrer(client, user.id, subId);
    assertEquals(resolved, null, '停用時應回 null');
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('resolve_default_referrer：續約付款（is_renewal=true）→ 不套用', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const referrer = await createTestUser(client, { name: '預設推薦人I' });
  const member = await createTestUser(client, { name: '既有會員I' });
  try {
    // 預設推薦人先付款取得 active 碼
    await payForUser(client, referrer.id);
    const code = await getActiveReferralCode(client, referrer.id);
    await setDefaultCode(client, code);

    // 既有會員：第一筆付款發生在「設定啟用之前」的語意由 is_renewal 承載
    // ——這裡直接付兩次，第二筆 is_renewal=true
    await payForUser(client, member.id);
    await payForUser(client, member.id);
    const secondSubId = await latestSubscriptionId(client, member.id);
    const resolved = await resolveDefaultReferrer(client, member.id, secondSubId);
    assertEquals(resolved, null, '續約（is_renewal=true）不得套用預設推薦人');
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [referrer.id, member.id]);
  }
});

Deno.test('resolve_default_referrer：碼不存在 → null 並寫 code_invalid 告警', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const user = await createTestUser(client, { name: '碼無效情境' });
  try {
    await setDefaultCode(client, 'zzz000000'); // 不存在的碼
    await payForUser(client, user.id);
    const subId = await latestSubscriptionId(client, user.id);
    const resolved = await resolveDefaultReferrer(client, user.id, subId);
    assertEquals(resolved, null, '碼不存在應回 null（fallback，不阻斷金流）');

    const { data: alerts } = await client
      .from('system_alerts')
      .select('message')
      .eq('source', 'resolve_default_referrer')
      .eq('message', 'default_referrer_code_invalid')
      .contains('context', { user_id: user.id });
    assertEquals(
      (alerts ?? []).length >= 1,
      true,
      '碼不存在必須留下 default_referrer_code_invalid 告警',
    );
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [user.id]);
  }
});

Deno.test('resolve_default_referrer：推薦人停權 → null 並寫 suspended 告警', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const referrer = await createTestUser(client, { name: '停權預設推薦人' });
  const user = await createTestUser(client, { name: '停權情境下線' });
  try {
    await payForUser(client, referrer.id);
    const code = await getActiveReferralCode(client, referrer.id);
    await setDefaultCode(client, code);
    // 停權預設推薦人（碼仍是 active——兩欄位無連動，正是 P0-1 的重點）
    await client.from('profiles').update({ suspended_at: new Date().toISOString() })
      .eq('id', referrer.id);

    await payForUser(client, user.id);
    const subId = await latestSubscriptionId(client, user.id);
    const resolved = await resolveDefaultReferrer(client, user.id, subId);
    assertEquals(resolved, null, '推薦人停權時不得套用（重用 validate_referral_code 的語意）');

    const { data: alerts } = await client
      .from('system_alerts')
      .select('message')
      .eq('source', 'resolve_default_referrer')
      .eq('message', 'default_referrer_suspended')
      .contains('context', { user_id: user.id });
    assertEquals(
      (alerts ?? []).length >= 1,
      true,
      '推薦人停權必須留下 default_referrer_suspended 告警（與碼無效分類不同）',
    );
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [referrer.id, user.id]);
  }
});

Deno.test('resolve_default_referrer：解析結果為本人 → 不套用（自我推薦護欄）', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const referrer = await createTestUser(client, { name: '自我推薦情境' });
  try {
    // 預設推薦人自己的首購：解析出的 user 就是他本人，必須跳過
    await payForUser(client, referrer.id);
    const code = await getActiveReferralCode(client, referrer.id);
    await setDefaultCode(client, code);
    const subId = await latestSubscriptionId(client, referrer.id);
    const resolved = await resolveDefaultReferrer(client, referrer.id, subId);
    assertEquals(resolved, null, '預設推薦人本人不得成為自己的上線');
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [referrer.id]);
  }
});

Deno.test('resolve_default_referrer：設定值大小寫混合 → 正規化後照樣解析', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const referrer = await createTestUser(client, { name: '正規化情境推薦人' });
  const user = await createTestUser(client, { name: '正規化情境下線' });
  try {
    await payForUser(client, referrer.id);
    const code = await getActiveReferralCode(client, referrer.id);
    // 營運人員手動 UPDATE 成混合大小寫 + 空白的情境
    await setDefaultCode(client, `  ${code.toUpperCase()}  `);

    await payForUser(client, user.id);
    const subId = await latestSubscriptionId(client, user.id);
    const resolved = await resolveDefaultReferrer(client, user.id, subId);
    assertEquals(resolved, referrer.id, '大小寫混合的設定值應 lower(trim) 後解析成功');
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [referrer.id, user.id]);
  }
});

// ============================================================
// 階段 2：接進 apply_referral_side_effects（情境 A/B/C/G/L）
// 走 payForUser（process_successful_payment → apply_referral_side_effects）
// 的完整付款路徑，驗證綁定、回寫、發獎、任務計數。
// ============================================================

Deno.test('apply：未填推薦碼首購 → 綁定預設推薦人、發 gen1、無 gen2/3、任務+1', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const referrer = await createTestUser(client, { name: '預設推薦人A' });
  const user = await createTestUser(client, { name: '自然流量首購A' });
  try {
    await payForUser(client, referrer.id);
    const code = await getActiveReferralCode(client, referrer.id);
    await setDefaultCode(client, code);

    const { error } = await payForUser(client, user.id);
    assertEquals(error, null, `首購付款失敗: ${error?.message}`);

    // 回寫三欄位（規劃 §2.6——回寫是發獎的必要條件，pay_referral_generations 重讀 profiles）
    const { data: prof } = await client
      .from('profiles')
      .select('referred_by_user_id, referred_by_code, referred_by_is_default')
      .eq('id', user.id)
      .single();
    assertEquals(prof?.referred_by_user_id, referrer.id, '應回寫 referred_by_user_id');
    assertEquals(prof?.referred_by_code, code, '應回寫 referred_by_code');
    assertEquals(prof?.referred_by_is_default, true, '應標記 referred_by_is_default');

    // gen1 發放；預設推薦人自己無上線 → 不得有 gen2/gen3（情境 L）
    const { data: rewards } = await client
      .from('reward_transactions')
      .select('user_id, generation')
      .eq('referee_user_id', user.id)
      .eq('type', 'referral_reward');
    assertEquals(rewards?.length, 1, `應只有 gen1 一筆，實際 ${rewards?.length}`);
    assertEquals(rewards?.[0].user_id, referrer.id, 'gen1 應歸預設推薦人');
    assertEquals(rewards?.[0].generation, 1);

    // 任務計數照常（情境 G——已拍板照常參與推薦王）
    const { data: progress } = await client
      .from('task_progress')
      .select('total_referrals')
      .eq('user_id', referrer.id)
      .single();
    assertEquals((progress?.total_referrals ?? 0) >= 1, true, '預設推薦人任務計數應累積');
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [referrer.id, user.id]);
  }
});

Deno.test('apply：有真推薦碼者付款 → 不受預設影響，is_default 為 false', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const defReferrer = await createTestUser(client, { name: '預設推薦人B' });
  const realReferrer = await createTestUser(client, { name: '真推薦人B' });
  try {
    await payForUser(client, defReferrer.id);
    await payForUser(client, realReferrer.id);
    const defCode = await getActiveReferralCode(client, defReferrer.id);
    const realCode = await getActiveReferralCode(client, realReferrer.id);
    await setDefaultCode(client, defCode);

    const user = await createTestUser(client, { name: '有真碼者B', referredByCode: realCode });
    try {
      await payForUser(client, user.id);
      const { data: prof } = await client
        .from('profiles')
        .select('referred_by_user_id, referred_by_is_default')
        .eq('id', user.id)
        .single();
      assertEquals(prof?.referred_by_user_id, realReferrer.id, '真推薦人不得被預設覆蓋');
      assertEquals(prof?.referred_by_is_default ?? false, false, '真推薦碼綁定不得標 is_default');

      const { data: rewards } = await client
        .from('reward_transactions')
        .select('user_id')
        .eq('referee_user_id', user.id)
        .eq('type', 'referral_reward')
        .eq('generation', 1);
      assertEquals(rewards?.[0]?.user_id, realReferrer.id, 'gen1 應歸真推薦人');
    } finally {
      await deleteTestUsers(client, [user.id]);
    }
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [defReferrer.id, realReferrer.id]);
  }
});

Deno.test('apply：已被預設綁定者續約 → 綁定不變，該筆續約仍發 gen1', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const referrer = await createTestUser(client, { name: '預設推薦人C' });
  const user = await createTestUser(client, { name: '續約情境C' });
  try {
    await payForUser(client, referrer.id);
    const code = await getActiveReferralCode(client, referrer.id);
    await setDefaultCode(client, code);

    await payForUser(client, user.id); // 首購 → 綁定
    await payForUser(client, user.id); // 續約 → 解析 no-op，但 §8.2 第 2 列照發

    const { data: rewards } = await client
      .from('reward_transactions')
      .select('subscription_id')
      .eq('referee_user_id', user.id)
      .eq('user_id', referrer.id)
      .eq('generation', 1);
    assertEquals(rewards?.length, 2, `首購+續約應各發一筆 gen1，實際 ${rewards?.length}`);

    const { data: prof } = await client
      .from('profiles')
      .select('referred_by_user_id, referred_by_is_default')
      .eq('id', user.id)
      .single();
    assertEquals(prof?.referred_by_user_id, referrer.id, '續約不得改變綁定');
    assertEquals(prof?.referred_by_is_default, true, '旗標維持 true');
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [referrer.id, user.id]);
  }
});

Deno.test('apply：解析失敗（碼無效）→ 付款照常成功，使用者維持無推薦人', async () => {
  const client = adminClient();
  const original = await snapshotDefaultCode(client);
  const user = await createTestUser(client, { name: '碼無效仍付款成功' });
  try {
    await setDefaultCode(client, 'zzz000001');
    const { data, error } = await payForUser(client, user.id);
    assertEquals(error, null, '設定錯誤絕不可阻斷金流');
    assertEquals(data?.success ?? true, true);

    const { data: prof } = await client
      .from('profiles')
      .select('referred_by_user_id, referred_by_is_default')
      .eq('id', user.id)
      .single();
    assertEquals(prof?.referred_by_user_id, null, 'fallback 應維持無推薦人');
    assertEquals(prof?.referred_by_is_default ?? false, false);
  } finally {
    await setDefaultCode(client, original);
    await deleteTestUsers(client, [user.id]);
  }
});
