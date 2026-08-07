// ============================================================
// 自訂服務類別的資料層(migration 20260807000002):
//   (A) public_listing_categories 檢視表 —— 類別詞彙的推導來源
//   (B) listings.category 的寫入正規化 trigger
//
// 這裡守的是需求「只要還有一個人使用就留著,沒有任何人使用就直接刪除」。
// 因為類別詞彙是推導的(group by),那句需求沒有對應的「刪除」程式碼可測
// ——能測的是它的**可觀察結果**:最後一個使用者離開後,類別確實不再出現。
//
// 播種一律用 service-role client、透過檢視表驗證(理由見 listings.test.ts
// 檔頭:本地 supabase start 缺 hosted 的 anon/authenticated 預設授權)。
// 檢視表的 WHERE 對所有角色生效,所以能見度邏輯測得到;真正的 anon GRANT
// 是否生效測不到,那是繼承自 public_listings 的既有落差,非本 migration 新增。
//
// ⚠️ 這張檢視表是**全站聚合**,不像 listings 查詢可以 eq(user_id) 隔離。
// 所以每個測試都用獨一無二的類別名稱,避免與並行測試/殘留資料互相干擾。
// ============================================================
import { assertEquals, assertExists } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  ensureEdgeFunctionEnv,
  payForUser,
} from './test-helpers.ts';

ensureEdgeFunctionEnv();

/** 全站聚合的檢視表需要不可能撞名的類別。 */
function uniqueCategory(tag: string): string {
  return `zz${tag}${crypto.randomUUID().slice(0, 8)}`;
}

function listingRow(userId: string, category: string) {
  return {
    user_id: userId,
    name: '測試刊登',
    category,
    city: '台北市',
    districts: ['全區'],
    gender: '女',
    photos: [],
    contacts: { instagram: 'ig' },
    description: 'x',
  };
}

async function categoryRow(admin: SupabaseClient, category: string) {
  const { data } = await admin
    .from('public_listing_categories')
    .select('category, listing_count')
    .eq('category', category)
    .maybeSingle();
  return data;
}

// ============================================================
// (A) public_listing_categories:推導出的類別詞彙
// ============================================================

Deno.test('public_listing_categories：有可見刊登在用的類別會出現，並帶正確使用數', async () => {
  const admin = adminClient();
  const category = uniqueCategory('used');
  const first = await createTestUser(admin, { name: '甲會員' });
  const second = await createTestUser(admin, { name: '乙會員' });
  try {
    await payForUser(admin, first.id);
    await payForUser(admin, second.id);
    await admin.from('listings').insert(listingRow(first.id, category));

    const one = await categoryRow(admin, category);
    assertExists(one);
    assertEquals(one.listing_count, 1);

    // 第二個人用同一個類別 → 使用數累加(這正是「還有一個人使用」的計數)
    await admin.from('listings').insert(listingRow(second.id, category));
    assertEquals((await categoryRow(admin, category))?.listing_count, 2);
  } finally {
    await deleteTestUsers(admin, [first.id, second.id]);
  }
});

Deno.test('public_listing_categories：最後一筆刊登改成別的類別後，原類別消失', async () => {
  const admin = adminClient();
  const category = uniqueCategory('moved');
  const user = await createTestUser(admin, { name: '改類別的會員' });
  try {
    await payForUser(admin, user.id);
    await admin.from('listings').insert(listingRow(user.id, category));
    assertExists(await categoryRow(admin, category));

    await admin.from('listings').update({ category: '美髮' }).eq('user_id', user.id);

    // 沒有任何清理邏輯跑過——類別消失是 group by 的直接結果
    assertEquals(await categoryRow(admin, category), null);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

Deno.test('public_listing_categories：最後一筆刊登被刪除後，該類別消失', async () => {
  const admin = adminClient();
  const category = uniqueCategory('deleted');
  const user = await createTestUser(admin, { name: '刪刊登的會員' });
  try {
    await payForUser(admin, user.id);
    await admin.from('listings').insert(listingRow(user.id, category));
    assertExists(await categoryRow(admin, category));

    await admin.from('listings').delete().eq('user_id', user.id);
    assertEquals(await categoryRow(admin, category), null);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

Deno.test('public_listing_categories：兩人共用時，其中一人離開該類別仍留著', async () => {
  const admin = adminClient();
  const category = uniqueCategory('shared');
  const stayer = await createTestUser(admin, { name: '留下的會員' });
  const leaver = await createTestUser(admin, { name: '離開的會員' });
  try {
    await payForUser(admin, stayer.id);
    await payForUser(admin, leaver.id);
    await admin.from('listings').insert(listingRow(stayer.id, category));
    await admin.from('listings').insert(listingRow(leaver.id, category));

    await admin.from('listings').delete().eq('user_id', leaver.id);

    // 「只要還有一個人使用就留著」——這條斷言就是那句需求本身
    assertEquals((await categoryRow(admin, category))?.listing_count, 1);
  } finally {
    await deleteTestUsers(admin, [stayer.id, leaver.id]);
  }
});

Deno.test('public_listing_categories：未付款會員的類別不外顯', async () => {
  const admin = adminClient();
  const category = uniqueCategory('unpaid');
  const user = await createTestUser(admin, { name: '未付款會員' });
  try {
    await admin.from('listings').insert(listingRow(user.id, category));
    assertEquals(await categoryRow(admin, category), null);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

Deno.test('public_listing_categories：擁有者被停權後該類別消失，解除後回來', async () => {
  const admin = adminClient();
  const category = uniqueCategory('susp');
  const user = await createTestUser(admin, { name: '被停權會員' });
  try {
    await payForUser(admin, user.id);
    await admin.from('listings').insert(listingRow(user.id, category));
    assertExists(await categoryRow(admin, category));

    // 停權與會籍過期走同一把尺(has_active_subscription),兩者都要驗
    // ——規格書 §5.3 要求刊登可見性三處逐字對齊,不能只靠結構順帶涵蓋。
    await admin.from('profiles').update({ suspended_at: '2020-01-01T00:00:00Z' }).eq('id', user.id);
    assertEquals(await categoryRow(admin, category), null);

    await admin.from('profiles').update({ suspended_at: null }).eq('id', user.id);
    assertExists(await categoryRow(admin, category));
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

// ============================================================
// (B) 寫入正規化 trigger
// ============================================================

Deno.test('listings_normalize_category：頭尾空白在寫入時被去除', async () => {
  const admin = adminClient();
  const category = uniqueCategory('trim');
  const user = await createTestUser(admin, { name: '空白會員' });
  try {
    await payForUser(admin, user.id);
    await admin.from('listings').insert(listingRow(user.id, `  ${category}  `));

    const { data } = await admin
      .from('listings').select('category').eq('user_id', user.id).single();
    assertEquals(data?.category, category);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

Deno.test('listings_normalize_category：內部連續空白收成一個，近似重複不進資料庫', async () => {
  const admin = adminClient();
  const tag = uniqueCategory('gap');
  const user = await createTestUser(admin, { name: '多空白會員' });
  try {
    await payForUser(admin, user.id);
    await admin.from('listings').insert(listingRow(user.id, `${tag}   甲`));

    const { data } = await admin
      .from('listings').select('category').eq('user_id', user.id).single();
    assertEquals(data?.category, `${tag} 甲`);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

Deno.test('listings_normalize_category：全形空白與換行同樣被收斂', async () => {
  // 前端的 JS `\s` **確定**含全形空白(ECMAScript 明文),Postgres 的 `\s`
  // 等價 `[[:space:]]`、是否含 U+3000 取決於資料庫 ctype。兩邊不一致就等於
  // 「UI 收斂了、資料層沒收斂」,而近似重複字串正是這道 trigger 要擋的東西。
  const admin = adminClient();
  const tag = uniqueCategory('wide');
  const user = await createTestUser(admin, { name: '全形空白會員' });
  try {
    await payForUser(admin, user.id);
    // U+3000 全形空白 ×2 + 換行
    await admin.from('listings').insert(listingRow(user.id, `\u3000${tag}\u3000\n甲\u3000`));

    const { data } = await admin
      .from('listings').select('category').eq('user_id', user.id).single();
    assertEquals(data?.category, `${tag} 甲`);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

Deno.test('listings_normalize_category：純空白的類別被拒絕寫入', async () => {
  const admin = adminClient();
  const user = await createTestUser(admin, { name: '空類別會員' });
  try {
    await payForUser(admin, user.id);
    const { error } = await admin.from('listings').insert(listingRow(user.id, '   '));
    assertExists(error);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

Deno.test('listings_normalize_category：超過 20 字的類別被拒絕寫入', async () => {
  const admin = adminClient();
  const user = await createTestUser(admin, { name: '超長類別會員' });
  try {
    await payForUser(admin, user.id);
    const { error } = await admin.from('listings').insert(listingRow(user.id, '寵'.repeat(21)));
    assertExists(error);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});

Deno.test('listings_normalize_category：UPDATE 路徑同樣正規化', async () => {
  const admin = adminClient();
  const category = uniqueCategory('upd');
  const user = await createTestUser(admin, { name: '更新類別會員' });
  try {
    await payForUser(admin, user.id);
    await admin.from('listings').insert(listingRow(user.id, '美髮'));
    await admin.from('listings').update({ category: ` ${category} ` }).eq('user_id', user.id);

    const { data } = await admin
      .from('listings').select('category').eq('user_id', user.id).single();
    assertEquals(data?.category, category);
  } finally {
    await deleteTestUsers(admin, [user.id]);
  }
});
