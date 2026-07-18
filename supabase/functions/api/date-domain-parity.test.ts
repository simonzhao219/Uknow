// ============================================================
// L9：台灣日期領域三份實作的對齊護欄。
//   SQL SSOT      = compute_subscription_period（migration 0718 0001）
//   Edge 鏡射     = tw-dates.ts（/payuni/prepare 預檢用）
// 兩者對同一錨定日必須算出同一效期；未來任一邊漂移，這支測試會紅。
// （前端 src/utils/twDate.ts 因 bundling 邊界無法在 Deno import，其與
//   tw-dates.ts 的一致性由前端 typecheck/相同邏輯人工維護，見兩檔註解。）
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { adminClient, ensureEdgeFunctionEnv } from './test-helpers.ts';
import { subscriptionLastDay, twStartOfDayInstant, twEndOfDayInstant } from './tw-dates.ts';

ensureEdgeFunctionEnv();

Deno.test('tw-dates 與 SQL compute_subscription_period 對同一錨定日算出相同效期', async () => {
  const client = adminClient();
  const anchors = [
    '2026-07-16', // 一般
    '2026-02-28', // 平年 2/28
    '2024-02-29', // 閏年起算（+1yr 夾到 2/28 的分支）
    '2026-01-01',
    '2026-12-31',
    '2025-03-01',
  ];

  for (const anchor of anchors) {
    const { data, error } = await client.rpc('compute_subscription_period', { p_anchor_day: anchor });
    assertEquals(error, null, `rpc error for ${anchor}: ${error?.message}`);
    const row = Array.isArray(data) ? data[0] : data;

    const tsLastDay = subscriptionLastDay(anchor);

    assertEquals(
      new Date(row.start_date).getTime(),
      twStartOfDayInstant(anchor).getTime(),
      `start_date mismatch for anchor ${anchor}`,
    );
    assertEquals(
      new Date(row.end_date).getTime(),
      twEndOfDayInstant(tsLastDay).getTime(),
      `end_date mismatch for anchor ${anchor}`,
    );
  }
});
