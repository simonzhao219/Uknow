// ============================================================
// 推薦網絡懶載入端點（Tier B）契約測試：/referrals/network/*
//
// 種子：V（觀看者）→ 王大明/Alice/Zoe（一代）；王大明 → 陳小華（二代）
// → 𠮷（三代）；另有無關係的 Stranger。陳小華被停權（attention 素材）。
// 依序建立，referred_at 嚴格遞增：王大明 < Alice < 陳小華 < 𠮷 < Zoe。
//
// 三代刻意取名「𠮷」（單一 CJK Ext-B astral 字元）：Han 偵測 regex 若被
// NFC 正規化改掉範圍（U+F900→U+8C48，位元組級事故、diff 不可見），surrogate
// 會落進字元類別、遮罩走進 '○'.repeat(-1)——這個種子讓所有 overview 測試
// 在那種回歸下直接 500，是位元組級的回歸陷阱。
//
// 驗證重點：
//   * updated 排序：子樹新血（𠮷）讓王大明壓過自身較晚加入的 Alice
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
  NetworkOverviewResponseSchema,
  NetworkChildrenResponseSchema,
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
const g1a = await seedPaidUser('王大明', vCode);       // 一代，最早
const g1b = await seedPaidUser('Alice', vCode);        // 一代
const g1aCode = await getActiveReferralCode(client, g1a.id);
const g2 = await seedPaidUser('陳小華', g1aCode);      // 二代（將被停權）
const g2Code = await getActiveReferralCode(client, g2.id);
const g3 = await seedPaidUser('𠮷', g2Code);           // 三代（王大明分支的新血；astral 字元回歸陷阱）
const g1c = await seedPaidUser('Zoe', vCode);          // 一代，最晚加入

// 停權陳小華：attention 素材 + 停權狀態遮罩/標示驗證
{
  const { error } = await client.from('profiles')
    .update({ suspended_at: new Date().toISOString() }).eq('id', g2.id);
  if (error) throw new Error(`suspend seed failed: ${error.message}`);
}

// 無關係使用者（children 授權 403 用；不需付款）
const stranger = await createTestUser(client, { name: 'Stranger Sam' });
seeded.push(stranger.id);

const token = await getUserAccessToken(client, viewer.email);

Deno.test('未帶 token 一律 401', async () => {
  for (const path of [
    '/referrals/network/overview',
    `/referrals/network/children?parentId=${viewer.id}`,
    '/referrals/network/search?q=x',
  ]) {
    const { status } = await getJson(path);
    assertEquals(status, 401, `${path} 未授權應回 401`);
  }
});

Deno.test('overview：契約形狀 + 預設 updated_desc（子樹新血勝過自身較晚加入）', async () => {
  const { status, body } = await getJson('/referrals/network/overview', token);
  assertEquals(status, 200);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview');

  assertEquals(parsed.data.sort, 'updated_desc');
  assertEquals(parsed.data.summary.firstGenCount, 3);
  assertEquals(parsed.data.summary.secondGenCount, 1);
  assertEquals(parsed.data.summary.thirdGenCount, 1);

  // updated_desc：Zoe（自身最晚）> 王大明（𠮷 是其子樹新血）> Alice
  assertEquals(parsed.data.roots.map((r) => r.userId), [g1c.id, g1a.id, g1b.id]);

  // 一代全顯 + 子樹鍵語意：王大明的 subtreeLatest 晚於其自身加入
  const wang = parsed.data.roots.find((r) => r.userId === g1a.id)!;
  assertEquals(wang.name, '王大明');
  assertEquals(wang.generation, 1);
  assertEquals(wang.childCount, 1);
  assert(
    Date.parse(wang.subtreeLatestJoinedAt) > Date.parse(wang.joinedAt),
    '𠮷（三代新血）應把王大明的 subtreeLatestJoinedAt 推到晚於其自身 joinedAt',
  );
});

Deno.test('overview：updated_asc 為 updated_desc 的完全反轉', async () => {
  const { body } = await getJson('/referrals/network/overview?sort=updated_asc', token);
  const parsed = assertShape(NetworkOverviewResponseSchema, body, 'GET overview asc');
  assertEquals(parsed.data.sort, 'updated_asc');
  assertEquals(parsed.data.roots.map((r) => r.userId), [g1b.id, g1a.id, g1c.id]);
});

Deno.test('overview：name 排序——A→Z 英文組在前；Z→A = 完全反轉（核定混排規則）', async () => {
  const asc = await getJson('/referrals/network/overview?sort=name_asc', token);
  const ascParsed = assertShape(NetworkOverviewResponseSchema, asc.body, 'GET overview name_asc');
  // 英文組（Alice < Zoe）在前，中文組（王大明）在後
  assertEquals(ascParsed.data.roots.map((r) => r.userId), [g1b.id, g1c.id, g1a.id]);

  const desc = await getJson('/referrals/network/overview?sort=name_desc', token);
  const descParsed = assertShape(NetworkOverviewResponseSchema, desc.body, 'GET overview name_desc');
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
  assertEquals(item.userId, g2.id);
  assertEquals(item.status, 'suspended');
  assertEquals(item.name, '陳○華', '二代姓名應遮罩');
  assert(parsed.data.attention.items.length <= 6, 'attention 有上限');
});

Deno.test('children：self = 一代；深入展開遮罩與 childCount 正確', async () => {
  const self = await getJson(`/referrals/network/children?parentId=${viewer.id}`, token);
  const selfParsed = assertShape(NetworkChildrenResponseSchema, self.body, 'GET children self');
  assertEquals(selfParsed.data.nodes.map((n) => n.userId), [g1c.id, g1a.id, g1b.id]);

  const deep = await getJson(`/referrals/network/children?parentId=${g1a.id}`, token);
  const deepParsed = assertShape(NetworkChildrenResponseSchema, deep.body, 'GET children g1a');
  assertEquals(deepParsed.data.parentId, g1a.id);
  assertEquals(deepParsed.data.nodes.length, 1);
  const chen = deepParsed.data.nodes[0];
  assertEquals(chen.userId, g2.id);
  assertEquals(chen.generation, 2);
  assertEquals(chen.name, '陳○華');
  assertEquals(chen.childCount, 1, '𠮷 在其下');

  // astral 字元遮罩：𠮷 非 Han 類別（Ext-B 在範圍外）→ 英數分支、不洩長度、不 500
  const g3level = await getJson(`/referrals/network/children?parentId=${g2.id}`, token);
  const g3Parsed = assertShape(NetworkChildrenResponseSchema, g3level.body, 'GET children g2');
  assertEquals(g3Parsed.data.nodes.length, 1);
  assertEquals(g3Parsed.data.nodes[0].userId, g3.id);
  assertEquals(g3Parsed.data.nodes[0].generation, 3);
  assertEquals(g3Parsed.data.nodes[0].name, '𠮷•••𠮷', '單一 astral 字元走英數遮罩分支');
});

Deno.test('children：gen3 超出可見範圍回空；陌生節點 403；缺 parentId 400', async () => {
  const leaf = await getJson(`/referrals/network/children?parentId=${g3.id}`, token);
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
  assertEquals(m.node.userId, g2.id);
  assertEquals(m.node.name, '陳○華');
  assertEquals(m.ancestorPath, [g1a.id, g2.id], '路徑：一代 → 命中者本身');
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
