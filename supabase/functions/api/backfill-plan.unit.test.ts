// ============================================================
// backfillPlan（Deno 側副本）—— 案例表在 _shared/backfill-cases.ts，
// 與前端副本（src/utils/twDate.test.ts）共用同一份，防雙副本漂移。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { BACKFILL_CASES } from '../_shared/backfill-cases.ts';
import { backfillPlan } from './tw-dates.ts';

for (const c of BACKFILL_CASES) {
  Deno.test(`backfillPlan：${c.name}`, () => {
    assertEquals(backfillPlan(c.lastEndDay, c.today), c.expected);
  });
}

Deno.test('backfillPlan：endDate 為 null（從未訂閱）→ null', () => {
  assertEquals(backfillPlan(null, '2026-05-02'), null);
});
