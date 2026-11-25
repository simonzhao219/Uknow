// ============================================================
// 告警文案引用的 README 手冊小節必須存在（第 7 波 S4）。
// LINE／後台告警的「下一步」寫「依 supabase/README〈X〉處理」——小節標題是跨檔契約：
// 標題改字而告警沒跟著改，業主收到的指引就指向不存在的地方。
// 掃描範圍：payment_closeout migration 內所有〈…〉引用（新增告警的唯一出處）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';

const README = new URL('../../README.md', import.meta.url);
const MIGRATION = new URL('../../migrations/20261125000001_payment_closeout.sql', import.meta.url);

Deno.test('payment_closeout 告警：引用的 README〈小節〉都以「## 標題」存在', async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  const cited = [...new Set([...sql.matchAll(/supabase\/README〈([^〉]+)〉/g)].map((m) => m[1]))]
    .sort();
  assertEquals(cited, ['已付款未開通', '補寫推薦連結', '補綁預設推薦人', '補計任務進度'].sort());
  const headings = new Set(
    (await Deno.readTextFile(README)).split('\n').filter((l) => l.startsWith('## ')).map((l) =>
      l.slice(3).trim()
    ),
  );
  for (const h of cited) assert(headings.has(h), `README 缺「## ${h}」`);
});
