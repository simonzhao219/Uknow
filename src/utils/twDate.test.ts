// backfillPlan（前端副本）——案例表經 @backfill-cases alias 與 Deno 側
// 副本（api/backfill-plan.unit.test.ts）共用同一份，防雙副本漂移。
import { describe, expect, it } from 'vitest';
import { BACKFILL_CASES } from '@backfill-cases';
import { backfillPlan } from './twDate';

describe('backfillPlan', () => {
  for (const c of BACKFILL_CASES) {
    it(c.name, () => {
      expect(backfillPlan(c.lastEndDay, c.today)).toEqual(c.expected);
    });
  }

  it('endDate 為 null（從未訂閱）時回傳 null', () => {
    expect(backfillPlan(null, '2026-05-02')).toBeNull();
  });
});
