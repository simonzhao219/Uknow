// ============================================================
// 推薦網絡懶載入端點（Tier B）契約測試：/referrals/network/*
//
// 種子（依序建立，referred_at 嚴格遞增 t1 < t2 < …）：
//   V（觀看者）
//   ├─ 王大明 (t1)          一代
//   │   ├─ 陳小華 (t4)      二代，被停權（attention 素材）
//   │   │   ├─ 𠮷     (t6)  三代
//   │   │   └─ 王志豪 (t7)  三代
//   │   └─ 趙雲   (t5)      二代，無下線
//   ├─ Alice  (t2)          一代
//   │   ├─ 林美 (t8)        二代 ┐
//   │   ├─ 林美 (t9)        二代 ├ 三人同名 → 專測 tie-break
//   │   └─ 林美 (t9，與前者 referred_at 完全相同) 二代 ┘
//   └─ Zoe    (t3)          一代
//   另有無關係的 Stranger（children 授權 403 用）。
//
// 種子形狀是刻意的——每個「多子節點」分支都用來證偽一種排序錯誤：
//   * 一代：新鍵（自身 joinedAt）給 [王大明, Alice, Zoe]；
//     舊鍵（子樹最新）會給 [Zoe, 王大明, Alice]——完全不同
//   * 王大明的二代：新鍵 [陳小華, 趙雲]；舊鍵 [趙雲, 陳小華]——完全不同
//     （陳小華自身較早，但其子樹有三代新血，舊鍵會把它推到後面）
//   * 陳小華的三代：層內兩節點，證明第三代也各自排序
//   * Alice 的三個同名二代：真名相同 → 走 tie；其中兩人 referred_at 完全
//     相同 → 再退到 userId 字典序，證明排序是全序、不依賴 sort 穩定性
//
// 三代刻意取名「𠮷」（單一 CJK Ext-B astral 字元）：Han 偵測 regex 若被
// NFC 正規化改掉範圍（U+F900→U+8C48，位元組級事故、diff 不可見），surrogate
// 會落進字元類別、遮罩走進 '○'.repeat(-1)——這個種子讓所有 overview 測試
// 在那種回歸下直接 500，是位元組級的回歸陷阱。
//
// 驗證重點：
//   * updated 排序：每一代各自依「自身 joinedAt」排序，子樹新血不影響上層
//   * tie-break：同名 → 時間升冪 → userId 字典序（全序）
//   * name 混排：英文組在前（A→Z），降冪 = 升冪完全反轉（核定規則）
//   * 遮罩：一代全顯、深代遮罩；search 用「真名」比對得到被遮字元
//   * children 授權：陌生節點 403、gen3 空、self = 一代
//   * attention：只收「一代且即將到期」（業主 2026-10-04 定案），依剩餘天數升冪；
//     overview 取前 6、/referrals/network/attention 分頁走完全部，total 永遠是全部命中數。
//     主種子 V 底下只有停權的二代（陳小華）——在新口徑下不入列，正好是「空」案例；
//     入列／排除的組合用下方獨立的 viewer2 種子。
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
  DEFAULT_NETWORK_SORT,
  NetworkAttentionResponseSchema,
  NetworkChildrenResponseSchema,
  NetworkOverviewResponseSchema,
  NetworkSearchResponseSchema,
} from '../_shared/api-contract.ts';
import { twDayOf, twDayPlusDays, twEndOfDayInstant } from './tw-dates.ts';

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

// -- 共用種子（依序付款，referred_at 嚴格遞增）--
const client = adminClient();
const seeded: string[] = [];
async function seedPaidUser(name: string, referredByCode?: string) {
  const u = await createTestUser(client, { name, ...(referredByCode ? { referredByCode } : {}) });
  seeded.push(u.id);
  const { error } = await payForUser(client, u.id);
  if (error) throw new Error(`seed pay failed for ${name}: ${error.message}`);
  return u;
}

const viewer = await seedPaidUser('Network Viewer');
const vCode = await getActiveReferralCode(client, viewer.id);

// 一代：三人皆先建立，使其「自身 joinedAt」順序與各自子樹的新血時間脫鉤
const g1a = await seedPaidUser('王大明', vCode); // t1 一代，自身最早
const g1b = await seedPaidUser('Alice', vCode); // t2 一代
const g1c = await seedPaidUser('Zoe', vCode); // t3 一代，自身最晚

const g1aCode = await getActiveReferralCode(client, g1a.id);
const g2a = await seedPaidUser('陳小華', g1aCode); // t4 二代（將被停權），其下有三代
const g2b = await seedPaidUser('趙雲', g1aCode); // t5 二代，無下線

const g2aCode = await getActiveReferralCode(client, g2a.id);
const g3a = await seedPaidUser('𠮷', g2aCode); // t6 三代（astral 字元回歸陷阱）
const g3b = await seedPaidUser('王志豪', g2aCode); // t7 三代

// Alice 底下三個同名二代：專測 tie-break（真名相同 → 時間 → userId）
const g1bCode = await getActiveReferralCode(client, g1b.id);
const g2c = await seedPaidUser('林美', g1bCode); // t8
const g2d = await seedPaidUser('林美', g1bCode); // t9
const g2e = await seedPaidUser('林美', g1bCode); // t10 → 下面改成與 t9 完全相同

// 讓 g2e 與 g2d 的 referred_at 完全相同 → 時間比較歸零，逼排序退到 userId 字典序。
// 沒有這一步，「排序是全序」只是推論；有了它，sort 穩定性不再能掩蓋不確定的比較器。
{
  const { data: peer, error: readErr } = await client.from('referral_edges')
    .select('referred_at').eq('referee_user_id', g2d.id).single();
  if (readErr) throw new Error(`read peer referred_at failed: ${readErr.message}`);
  const { error } = await client.from('referral_edges')
    .update({ referred_at: peer!.referred_at }).eq('referee_user_id', g2e.id);
  if (error) throw new Error(`equal referred_at seed failed: ${error.message}`);
}
// 同名同時者之間的期望次序 = userId 字典序升冪（降冪模式為其反轉）
const twinsAsc = [g2d.id, g2e.id].sort();

// 停權陳小華：attention 素材 + 停權狀態遮罩/標示驗證
{
  const { error } = await client.from('profiles')
    .update({ suspended_at: new Date().toISOString() }).eq('id', g2a.id);
  if (error) throw new Error(`suspend seed failed: ${error.message}`);
}

// 無關係使用者（children 授權 403 用；不需付款）
const stranger = await createTestUser(client, { name: 'Stranger Sam' });
seeded.push(stranger.id);

const token = await getUserAccessToken(client, viewer.email);

// -- attention 種子：viewer2（與主種子 V 完全分離，不影響排序案例）--
// 先全部付款建好推薦邊，再改 subscriptions.end_date 擺出各狀態。
// 剩餘天數由 ceil((end - now) / 1 天) 推導，所以 end 設在「N 天減半天」，
// 測試執行期間的幾秒漂移不會讓 ceil 跨格。
const DAY_MS = 86_400_000;
async function setEndInDays(userId: string, days: number) {
  const end = new Date(Date.now() + days * DAY_MS).toISOString();
  const { error } = await client.from('subscriptions')
    .update({ end_date: end, grace_period_end: end }).eq('user_id', userId);
  if (error) throw new Error(`setEndInDays failed: ${error.message}`);
}

const viewer2 = await seedPaidUser('Attention Viewer');
const v2Code = await getActiveReferralCode(client, viewer2.id);
const e3a = await seedPaidUser('剩三天甲', v2Code);
const e3b = await seedPaidUser('剩三天乙', v2Code);
const e5 = await seedPaidUser('剩五天', v2Code);
const e8 = await seedPaidUser('剩八天', v2Code);
const e13 = await seedPaidUser('剩十三天', v2Code);
const e21 = await seedPaidUser('剩廿一天', v2Code);
const e29 = await seedPaidUser('剩廿九天', v2Code);
// 正式資料形狀：end_date 一律是台灣日終（subscriptionLastDay）。同一天加入的
// 一代 end_date 逐位元相同，排序只能靠 userId 決勝——小數天數的種子測不到。
const tieA = await seedPaidUser('同日到期甲', v2Code);
const tieB = await seedPaidUser('同日到期乙', v2Code);
const b29 = await seedPaidUser('日終廿九天', v2Code); // 今日+29 日終 → 剩 30 天 → 入列
const b30 = await seedPaidUser('日終三十天', v2Code); // 今日+30 日終 → 剩 31 天 → 窗外
const a31 = await seedPaidUser('剩三十一天', v2Code); // 一代 active（30 天窗外）
const x1 = await seedPaidUser('已到期', v2Code); // 一代 expired
const s1 = await seedPaidUser('停權將到期', v2Code); // 一代 suspended（end 在窗內，停權優先）
const e5Code = await getActiveReferralCode(client, e5.id);
const g2exp = await seedPaidUser('二代將到期', e5Code); // 二代 expiring（非一代不入列）

await setEndInDays(e3a.id, 2.2); // ceil → 3
await setEndInDays(e3b.id, 2.8); // ceil → 3，與 e3a 同天數 → endDate 升冪決勝
await setEndInDays(e5.id, 4.5);
await setEndInDays(e8.id, 7.5);
await setEndInDays(e13.id, 12.5);
await setEndInDays(e21.id, 20.5);
await setEndInDays(e29.id, 28.5); // ceil → 29
await setEndInDays(a31.id, 30.5); // ceil → 31：窗外 → active
async function setEndTwDayEnd(userId: string, plusDays: number) {
  const end = twEndOfDayInstant(twDayPlusDays(twDayOf(), plusDays)).toISOString();
  const { error } = await client.from('subscriptions')
    .update({ end_date: end, grace_period_end: end }).eq('user_id', userId);
  if (error) throw new Error(`setEndTwDayEnd failed: ${error.message}`);
}
await setEndTwDayEnd(tieA.id, 10); // 剩 11 天，兩人 end_date 完全相同
await setEndTwDayEnd(tieB.id, 10);
await setEndTwDayEnd(b29.id, 29); // 30 天窗的最後一格（到期日 D 的 D−29 日 00:00 起）
await setEndTwDayEnd(b30.id, 30);
await setEndInDays(x1.id, -1);
await setEndInDays(s1.id, 4.5);
await setEndInDays(g2exp.id, 4.5);
{
  const { error } = await client.from('profiles')
    .update({ suspended_at: new Date().toISOString() }).eq('id', s1.id);
  if (error) throw new Error(`suspend seed failed: ${error.message}`);
}
// 依剩餘天數升冪 → 同天數 endDate 升冪 → userId
const tiePair = [tieA.id, tieB.id].sort();
const attentionOrder = [
  e3a.id,
  e3b.id,
  e5.id,
  e8.id,
  ...tiePair,
  e13.id,
  e21.id,
  e29.id,
  b29.id,
];
const token2 = await getUserAccessToken(client, viewer2.email);

Deno.test('未帶 token 一律 401', async () => {
  for (
    const path of [
      '/referrals/network/overview',
      `/referrals/network/children?parentId=${viewer.id}`,
      '/referrals/network/search?q=x',
      '/referrals/network/attention',
    ]
  ) {
    const { status } = await getJson(path);
    assertEquals(status, 401, `${path} 未授權應回 401`);
  }
});

Deno.test('overview：契約形狀 + 摘要計數 + 預設排序為「最早加入」', async () => {
  const { status, body } = await getJson('/referrals/network/overview', token);
  assertEquals(status, 200);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview');

  // 不帶 sort → 預設 updated_asc（舊到新）。這是使用者可見的預設值，
  // 與下方「非法值回落」共用同一個 DEFAULT_NETWORK_SORT。
  assertEquals(parsed.data.sort, 'updated_asc');
  assertEquals(parsed.data.roots.map((r) => r.userId), [g1a.id, g1b.id, g1c.id]);

  assertEquals(parsed.data.summary.firstGenCount, 3);
  assertEquals(parsed.data.summary.secondGenCount, 5, '陳小華 + 趙雲 + 林美 ×3');
  assertEquals(parsed.data.summary.thirdGenCount, 2, '𠮷 + 王志豪');

  // 一代全顯 + childCount 反映實際下線數
  const wang = parsed.data.roots.find((r) => r.userId === g1a.id)!;
  assertEquals(wang.name, '王大明');
  assertEquals(wang.generation, 1);
  assertEquals(wang.childCount, 2, '陳小華 + 趙雲');

  // 死欄位必須真的離開 payload。注意：契約的 obj() 只檢查已宣告的 key、
  // 放行多餘欄位，所以「把 schema 的欄位刪掉」不會讓 assertShape 變紅——
  // 只有這條執行期斷言抓得到「schema 刪了、後端還在吐」。
  assert(
    !('subtreeLatestJoinedAt' in wang),
    'subtreeLatestJoinedAt 在排序鍵換成自身 joinedAt 後已無用途，不得再出現在 payload',
  );
});

Deno.test('overview：updated_asc——一代依「自身」加入時間排，子樹新血不推升上層', async () => {
  const { body } = await getJson('/referrals/network/overview?sort=updated_asc', token);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview asc');
  assertEquals(parsed.data.sort, 'updated_asc');

  // 王大明自身最早 → 最前，即使其三代（王志豪）是全網最新血之一。
  // 舊的「子樹最新加入」鍵會給 [Zoe, 王大明, Alice]——這條斷言就是兩者的分水嶺。
  assertEquals(parsed.data.roots.map((r) => r.userId), [g1a.id, g1b.id, g1c.id]);

  // 王大明排最前，而其子樹裡確實有比自己晚很多的新血（王志豪 t7）——
  // 「子樹有新血卻不影響上層位置」正是排序鍵已換成自身 joinedAt 的證明。
  const wang = parsed.data.roots[0];
  assertEquals(wang.userId, g1a.id);
  const kids = await getJson(
    `/referrals/network/children?parentId=${g2a.id}&sort=updated_desc`,
    token,
  );
  const kidsParsed = assertShape(NetworkChildrenResponseSchema, kids.body, 'children g2a desc');
  assert(
    Date.parse(kidsParsed.data.nodes[0].joinedAt) > Date.parse(wang.joinedAt),
    '王大明子樹中最新的三代確實晚於王大明自身，卻沒有把他推離第一位',
  );
});

Deno.test('overview：updated_desc 為 updated_asc 的完全反轉', async () => {
  const { body } = await getJson('/referrals/network/overview?sort=updated_desc', token);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview desc');
  assertEquals(parsed.data.sort, 'updated_desc');
  assertEquals(parsed.data.roots.map((r) => r.userId), [g1c.id, g1b.id, g1a.id]);
});

Deno.test('overview：name 排序——A→Z 英文組在前；Z→A = 完全反轉（核定混排規則）', async () => {
  const asc = await getJson('/referrals/network/overview?sort=name_asc', token);
  const ascParsed = assertShape(NetworkOverviewResponseSchema, asc.body, 'GET overview name_asc');
  // 英文組（Alice < Zoe）在前，中文組（王大明）在後
  assertEquals(ascParsed.data.roots.map((r) => r.userId), [g1b.id, g1c.id, g1a.id]);

  const desc = await getJson('/referrals/network/overview?sort=name_desc', token);
  const descParsed = assertShape(
    NetworkOverviewResponseSchema,
    desc.body,
    'GET overview name_desc',
  );
  assertEquals(
    descParsed.data.roots.map((r) => r.userId),
    [...ascParsed.data.roots.map((r) => r.userId)].reverse(),
    'name_desc 必須是 name_asc 的完全反轉（中文組自然在前）',
  );
});

Deno.test('overview：無效 sort 回落預設並回聲', async () => {
  const { body } = await getJson('/referrals/network/overview?sort=bogus', token);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview bogus sort');
  assertEquals(parsed.data.sort, DEFAULT_NETWORK_SORT);
  assertEquals(DEFAULT_NETWORK_SORT, 'updated_asc', '預設＝最早加入（需求方裁決）');
});

Deno.test('children / search：預設同樣回落 DEFAULT_NETWORK_SORT', async () => {
  const kids = await getJson(`/referrals/network/children?parentId=${g1a.id}`, token);
  const kidsParsed = assertShape(NetworkChildrenResponseSchema, kids.body, 'children default sort');
  assertEquals(kidsParsed.data.sort, DEFAULT_NETWORK_SORT);

  const found = await getJson('/referrals/network/search?q=ali', token);
  const foundParsed = assertShape(NetworkSearchResponseSchema, found.body, 'search default sort');
  assertEquals(foundParsed.data.sort, DEFAULT_NETWORK_SORT);
});

Deno.test('overview：attention 只收一代即將到期——停權的二代不入列，無人時為空', async () => {
  const { body } = await getJson('/referrals/network/overview', token);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview attention empty');
  assertEquals(parsed.data.attention, { total: 0, items: [] }, '陳小華是二代且停權，新口徑不入列');
});

Deno.test('overview：attention 依剩餘天數升冪取前 6，total 為精確人數', async () => {
  const { body } = await getJson('/referrals/network/overview', token2);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview attention v2');
  assertEquals(parsed.data.attention.total, 10, '一代即將到期共 10 位（含 30 天邊界）');
  assertEquals(
    parsed.data.attention.items.map((n) => n.userId),
    attentionOrder.slice(0, 6),
    '同天數以 endDate 升冪決勝；items 上限 6',
  );
  for (const n of parsed.data.attention.items) {
    assertEquals(n.generation, 1);
    assertEquals(n.status, 'expiring');
  }
  assertEquals(parsed.data.attention.items[0].daysToExpiry, 3);
});

Deno.test('attention：無一代即將到期時回空清單，total 為 0', async () => {
  const { status, body } = await getJson('/referrals/network/attention', token);
  assertEquals(status, 200);
  const parsed = assertShape(NetworkAttentionResponseSchema, body, 'GET attention empty');
  assertEquals(parsed.data.total, 0);
  assertEquals(parsed.data.items, []);
});

Deno.test('attention：預設頁大小一頁取完，非一代、active、expired、停權不入列', async () => {
  const { body } = await getJson('/referrals/network/attention', token2);
  const parsed = assertShape(NetworkAttentionResponseSchema, body, 'GET attention single page');
  assertEquals(parsed.data.limit, 50);
  assertEquals(parsed.data.offset, 0);
  assertEquals(parsed.data.total, 10);
  assertEquals(parsed.data.items.map((n) => n.userId), attentionOrder);
  const ids = new Set(parsed.data.items.map((n) => n.userId));
  for (
    const [who, id] of [
      ['a31', a31.id],
      ['b30', b30.id],
      ['x1', x1.id],
      ['s1', s1.id],
      ['g2exp', g2exp.id],
    ]
  ) {
    assert(!ids.has(id), `${who} 不得入列`);
  }
});

Deno.test('attention：跨頁走完等於完整順序，total 不受分頁影響', async () => {
  const collected: string[] = [];
  for (let offset = 0; offset < 12; offset += 3) {
    const { body } = await getJson(`/referrals/network/attention?limit=3&offset=${offset}`, token2);
    const page = assertShape(NetworkAttentionResponseSchema, body, `attention offset=${offset}`);
    assertEquals(page.data.total, 10, '每一頁的 total 都是全部命中數');
    assertEquals(page.data.limit, 3);
    assertEquals(page.data.offset, offset);
    collected.push(...page.data.items.map((n) => n.userId));
  }
  assertEquals(collected, attentionOrder, '四頁（3+3+3+1）串起來＝完整清單，不重不漏');
});

Deno.test('attention：日終資料的同分以 userId 決勝，limit=1 逐頁不重不漏', async () => {
  const collected: string[] = [];
  for (let offset = 0; offset < 10; offset++) {
    const { body } = await getJson(`/referrals/network/attention?limit=1&offset=${offset}`, token2);
    const page = assertShape(NetworkAttentionResponseSchema, body, `attention limit=1 #${offset}`);
    assertEquals(page.data.items.length, 1);
    collected.push(page.data.items[0].userId);
  }
  assertEquals(collected, attentionOrder);
  const tieAt = collected.indexOf(tiePair[0]);
  assertEquals(collected[tieAt + 1], tiePair[1], 'end_date 完全相同的兩位依 userId 升冪相鄰');
});

Deno.test('attention：台灣日終邊界——今日+29 日終入列（剩 30 天），+30 日終不入', async () => {
  const { body } = await getJson('/referrals/network/attention', token2);
  const parsed = assertShape(NetworkAttentionResponseSchema, body, 'attention tw day-end edge');
  const last = parsed.data.items.at(-1)!;
  assertEquals(last.userId, b29.id);
  assertEquals(last.daysToExpiry, 30);
  assertEquals(parsed.data.items.some((n) => n.userId === b30.id), false);
});

Deno.test('attention：越界 offset 回空頁；limit 夾在 1..200；壞值回落預設', async () => {
  const beyond = await getJson('/referrals/network/attention?offset=99', token2);
  const b = assertShape(NetworkAttentionResponseSchema, beyond.body, 'attention beyond');
  assertEquals(b.data.items, []);
  assertEquals(b.data.total, 10);

  const huge = await getJson('/referrals/network/attention?limit=9999', token2);
  assertEquals(assertShape(NetworkAttentionResponseSchema, huge.body, 'huge').data.limit, 200);

  const junk = await getJson('/referrals/network/attention?limit=abc&offset=-5', token2);
  const j = assertShape(NetworkAttentionResponseSchema, junk.body, 'attention junk paging');
  assertEquals(j.data.limit, 50);
  assertEquals(j.data.offset, 0);
});

Deno.test('children：二代層內依自身加入時間排（子樹新血不影響同層次序）', async () => {
  const { body } = await getJson(
    `/referrals/network/children?parentId=${g1a.id}&sort=updated_asc`,
    token,
  );
  const parsed = assertShape(NetworkChildrenResponseSchema, body, 'GET children g1a asc');
  assertEquals(parsed.data.parentId, g1a.id);

  // 陳小華(t4) 早於 趙雲(t5) → 陳小華在前。舊的子樹鍵會給 [趙雲, 陳小華]
  // （趙雲無下線、子樹時間停在自身；陳小華被其三代推到最後）。
  assertEquals(parsed.data.nodes.map((n) => n.userId), [g2a.id, g2b.id]);

  const chen = parsed.data.nodes[0];
  assertEquals(chen.generation, 2);
  assertEquals(chen.name, '陳○華');
  assertEquals(chen.childCount, 2, '𠮷 + 王志豪 在其下');

  const descBody = await getJson(
    `/referrals/network/children?parentId=${g1a.id}&sort=updated_desc`,
    token,
  );
  const descParsed = assertShape(NetworkChildrenResponseSchema, descBody.body, 'children g1a desc');
  assertEquals(descParsed.data.nodes.map((n) => n.userId), [g2b.id, g2a.id], '降冪 = 升冪反轉');
});

Deno.test('children：三代層內亦各自排序；astral 字元遮罩不炸', async () => {
  const { body } = await getJson(
    `/referrals/network/children?parentId=${g2a.id}&sort=updated_asc`,
    token,
  );
  const parsed = assertShape(NetworkChildrenResponseSchema, body, 'GET children g2a asc');
  assertEquals(parsed.data.nodes.map((n) => n.userId), [g3a.id, g3b.id], '𠮷(t6) 早於 王志豪(t7)');
  assertEquals(parsed.data.nodes[0].generation, 3);
  // astral 字元遮罩：𠮷 非 Han 類別（Ext-B 在範圍外）→ 英數分支、不洩長度、不 500
  assertEquals(parsed.data.nodes[0].name, '𠮷•••𠮷', '單一 astral 字元走英數遮罩分支');
});

Deno.test('children：同名者的 tie-break——時間升冪，時間相同再退 userId 字典序', async () => {
  const asc = await getJson(
    `/referrals/network/children?parentId=${g1b.id}&sort=name_asc`,
    token,
  );
  const ascParsed = assertShape(NetworkChildrenResponseSchema, asc.body, 'children g1b name_asc');
  assertEquals(ascParsed.data.nodes.length, 3);
  assertEquals(
    ascParsed.data.nodes.map((n) => n.userId),
    [g2c.id, ...twinsAsc],
    '三人同名 → 依加入時間升冪；t9 的兩人時間完全相同 → 退 userId 字典序',
  );

  const desc = await getJson(
    `/referrals/network/children?parentId=${g1b.id}&sort=name_desc`,
    token,
  );
  const descParsed = assertShape(
    NetworkChildrenResponseSchema,
    desc.body,
    'children g1b name_desc',
  );
  assertEquals(
    descParsed.data.nodes.map((n) => n.userId),
    [g2c.id, ...twinsAsc].reverse(),
    'name_desc 必須是 name_asc 的完全反轉（含 tie 一併反轉）',
  );
});

Deno.test('children：self = 一代；gen3 超出可見範圍回空；陌生節點 403；缺 parentId 400', async () => {
  const self = await getJson(
    `/referrals/network/children?parentId=${viewer.id}&sort=updated_asc`,
    token,
  );
  const selfParsed = assertShape(NetworkChildrenResponseSchema, self.body, 'GET children self');
  assertEquals(selfParsed.data.nodes.map((n) => n.userId), [g1a.id, g1b.id, g1c.id]);

  const leaf = await getJson(`/referrals/network/children?parentId=${g3a.id}`, token);
  const leafParsed = assertShape(NetworkChildrenResponseSchema, leaf.body, 'GET children g3');
  assertEquals(leafParsed.data.nodes, []);

  const forbidden = await getJson(`/referrals/network/children?parentId=${stranger.id}`, token);
  assertEquals(forbidden.status, 403, '子樹外節點應 403');

  const missing = await getJson('/referrals/network/children', token);
  assertEquals(missing.status, 400);
});

Deno.test('search：真名比對命中被遮字元，回遮罩名 + 祖先路徑', async () => {
  // 「小」是陳小華被遮罩的中間字——命中即證明比對用真名、顯示用遮罩
  const { body } = await getJson('/referrals/network/search?q=%E5%B0%8F', token);
  const parsed = assertShape(NetworkSearchResponseSchema, body, 'GET search 小');
  assertEquals(parsed.data.total, 1);
  const m = parsed.data.matches[0];
  assertEquals(m.node.userId, g2a.id);
  assertEquals(m.node.name, '陳○華');
  assertEquals(m.ancestorPath, [g1a.id, g2a.id], '路徑：一代 → 命中者本身');
});

Deno.test('search：英文大小寫不敏感；空字串 400', async () => {
  const { body } = await getJson('/referrals/network/search?q=ali', token);
  const parsed = assertShape(NetworkSearchResponseSchema, body, 'GET search ali');
  assertEquals(parsed.data.total, 1);
  assertEquals(parsed.data.matches[0].node.userId, g1b.id);
  assertEquals(parsed.data.matches[0].ancestorPath, [g1b.id]);

  const empty = await getJson('/referrals/network/search?q=', token);
  assertEquals(empty.status, 400);
});

// 「符合條件的都必須搜得到」——需求方訂下的原則。先前 search 在排序後才
// slice(0, 50)，排序方向一改就換一批人搜得到，且 UI 只 render matches、
// 不顯示 total，截斷完全無感。分頁機制與 /rewards/history 同一套。
//
// 註：規劃書寫的是「命中 >50 要能全部取回」，但為此種 50+ 個付費使用者會讓
// 這支測試慢到不可接受。改用 limit=2 掃過三個同名「林美」——分頁的正確性
// （不重不漏、total 不受 limit 影響、越界不炸）是同一組不變式，與門檻無關。
Deno.test('search：分頁不遺漏——limit/offset 走完可取回全部命中', async () => {
  const all = await getJson('/referrals/network/search?q=%E6%9E%97', token); // 林
  const allParsed = assertShape(NetworkSearchResponseSchema, all.body, 'search 林 all');
  assertEquals(allParsed.data.total, 3, '三個同名「林美」');
  assertEquals(allParsed.data.matches.length, 3, '未指定 limit 時預設頁足以容納三筆');
  const everyone = allParsed.data.matches.map((m) => m.node.userId);

  const page1 = await getJson('/referrals/network/search?q=%E6%9E%97&limit=2', token);
  const p1 = assertShape(NetworkSearchResponseSchema, page1.body, 'search 林 page1');
  assertEquals(p1.data.total, 3, 'total 是「全部命中數」，不受 limit 影響');
  assertEquals(p1.data.limit, 2);
  assertEquals(p1.data.offset, 0);
  assertEquals(p1.data.matches.length, 2);

  const page2 = await getJson('/referrals/network/search?q=%E6%9E%97&limit=2&offset=2', token);
  const p2 = assertShape(NetworkSearchResponseSchema, page2.body, 'search 林 page2');
  assertEquals(p2.data.total, 3);
  assertEquals(p2.data.offset, 2);
  assertEquals(p2.data.matches.length, 1);

  // 兩頁併起來 = 全部命中，不重不漏（順序與單頁一致）
  assertEquals(
    [...p1.data.matches, ...p2.data.matches].map((m) => m.node.userId),
    everyone,
    '分頁走完必須等於一次取回的完整命中集',
  );
});

Deno.test('search：越界 offset 回空但 total 不變；limit 夾在 1..200；壞值回落預設', async () => {
  const beyond = await getJson('/referrals/network/search?q=%E6%9E%97&offset=99', token);
  const b = assertShape(NetworkSearchResponseSchema, beyond.body, 'search 林 beyond');
  assertEquals(b.data.matches, [], '越界只是空頁，不是錯誤');
  assertEquals(b.data.total, 3, '越界不影響 total——UI 才能照樣顯示「共 N 筆」');

  const huge = await getJson('/referrals/network/search?q=%E6%9E%97&limit=9999', token);
  const h = assertShape(NetworkSearchResponseSchema, huge.body, 'search 林 huge limit');
  assertEquals(h.data.limit, 200, 'limit 上限 200（與 /rewards/history 同慣例）');

  const junk = await getJson('/referrals/network/search?q=%E6%9E%97&limit=abc&offset=-5', token);
  const j = assertShape(NetworkSearchResponseSchema, junk.body, 'search 林 junk paging');
  assertEquals(j.data.limit, 50, '壞值回落預設頁大小');
  assertEquals(j.data.offset, 0, '負 offset 夾到 0');
});

Deno.test('cleanup（最後執行：清掉共用種子）', async () => {
  await deleteTestUsers(client, seeded);
});
