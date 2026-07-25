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
//   * attention：非 active 入列、依緊急度、有上限
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
  NetworkChildrenResponseSchema,
  NetworkOverviewResponseSchema,
  NetworkSearchResponseSchema,
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

Deno.test('未帶 token 一律 401', async () => {
  for (
    const path of [
      '/referrals/network/overview',
      `/referrals/network/children?parentId=${viewer.id}`,
      '/referrals/network/search?q=x',
    ]
  ) {
    const { status } = await getJson(path);
    assertEquals(status, 401, `${path} 未授權應回 401`);
  }
});

Deno.test('overview：契約形狀 + 摘要計數', async () => {
  const { status, body } = await getJson('/referrals/network/overview', token);
  assertEquals(status, 200);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview');

  assertEquals(parsed.data.summary.firstGenCount, 3);
  assertEquals(parsed.data.summary.secondGenCount, 5, '陳小華 + 趙雲 + 林美 ×3');
  assertEquals(parsed.data.summary.thirdGenCount, 2, '𠮷 + 王志豪');

  // 一代全顯 + childCount 反映實際下線數
  const wang = parsed.data.roots.find((r) => r.userId === g1a.id)!;
  assertEquals(wang.name, '王大明');
  assertEquals(wang.generation, 1);
  assertEquals(wang.childCount, 2, '陳小華 + 趙雲');
});

Deno.test('overview：updated_asc——一代依「自身」加入時間排，子樹新血不推升上層', async () => {
  const { body } = await getJson('/referrals/network/overview?sort=updated_asc', token);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview asc');
  assertEquals(parsed.data.sort, 'updated_asc');

  // 王大明自身最早 → 最前，即使其三代（王志豪）是全網最新血之一。
  // 舊的「子樹最新加入」鍵會給 [Zoe, 王大明, Alice]——這條斷言就是兩者的分水嶺。
  assertEquals(parsed.data.roots.map((r) => r.userId), [g1a.id, g1b.id, g1c.id]);

  // 子樹鍵仍然存在且語意不變，但已「不再影響排序」——王大明的 subtreeLatest
  // 晚於自身加入，卻依舊排在最前，正是排序鍵已換成自身 joinedAt 的證明。
  const wang = parsed.data.roots[0];
  assertEquals(wang.userId, g1a.id);
  assert(
    Date.parse(wang.subtreeLatestJoinedAt) > Date.parse(wang.joinedAt),
    '王大明的 subtreeLatestJoinedAt 應仍晚於其自身 joinedAt（欄位語意未變）',
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
  assertEquals(parsed.data.sort, 'updated_desc');
});

Deno.test('overview：attention——停權的深代下線入列且遮罩', async () => {
  const { body } = await getJson('/referrals/network/overview', token);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview attention');
  assertEquals(parsed.data.attention.total, 1, '種子中僅陳小華非 active');
  const item = parsed.data.attention.items[0];
  assertEquals(item.userId, g2a.id);
  assertEquals(item.status, 'suspended');
  assertEquals(item.name, '陳○華', '二代姓名應遮罩');
  assert(parsed.data.attention.items.length <= 6, 'attention 有上限');
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

Deno.test('cleanup（最後執行：清掉共用種子）', async () => {
  await deleteTestUsers(client, seeded);
});
