// ============================================================
// 會籍四態 deriveNodeStatus 的 characterization（第 6 波 S3a 階段 5a）。
//
// 從 index.ts 抽到 node-status.ts，讓推薦網絡、會員驗證與後台推薦樹共用同一份
// （規格書 §7.2 節點狀態四態）。行為不得改變：停權優先 → 非 active 即失效 →
// 距到期 ≤ RENEWAL_NOTICE_DAYS 天（無條件進位）為即將到期 → 其餘訂閱中。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { RENEWAL_NOTICE_DAYS } from '../_shared/api-contract.ts';
import { deriveNodeStatus } from './node-status.ts';

const NOW = Date.parse('2026-11-08T00:00:00Z');
const DAY = 86_400_000;
const endIn = (days: number) => new Date(NOW + days * DAY).toISOString();

Deno.test('deriveNodeStatus：有停權時間 → suspended，優先於會籍', () => {
  assertEquals(
    deriveNodeStatus({ status: 'active', end_date: endIn(100) }, '2026-11-01T00:00:00Z', NOW),
    { status: 'suspended', daysToExpiry: null },
  );
});

Deno.test('deriveNodeStatus：會籍不是 active 或沒有會籍 → expired', () => {
  assertEquals(deriveNodeStatus({ status: 'expired', end_date: endIn(-1) }, null, NOW), {
    status: 'expired',
    daysToExpiry: null,
  });
  assertEquals(deriveNodeStatus(null, null, NOW), { status: 'expired', daysToExpiry: null });
});

Deno.test('deriveNodeStatus：剛好剩 RENEWAL_NOTICE_DAYS 天 → expiring', () => {
  assertEquals(
    deriveNodeStatus({ status: 'active', end_date: endIn(RENEWAL_NOTICE_DAYS) }, null, NOW),
    { status: 'expiring', daysToExpiry: RENEWAL_NOTICE_DAYS },
  );
});

Deno.test('deriveNodeStatus：剩餘天數無條件進位 → 剩 0.5 天算 1 天', () => {
  assertEquals(deriveNodeStatus({ status: 'active', end_date: endIn(0.5) }, null, NOW), {
    status: 'expiring',
    daysToExpiry: 1,
  });
});

Deno.test('deriveNodeStatus：剩 RENEWAL_NOTICE_DAYS + 1 天 → active 並帶天數', () => {
  assertEquals(
    deriveNodeStatus({ status: 'active', end_date: endIn(RENEWAL_NOTICE_DAYS + 1) }, null, NOW),
    { status: 'active', daysToExpiry: RENEWAL_NOTICE_DAYS + 1 },
  );
});

Deno.test('deriveNodeStatus：active 但沒有 end_date → active 且天數為 null', () => {
  assertEquals(deriveNodeStatus({ status: 'active', end_date: null }, null, NOW), {
    status: 'active',
    daysToExpiry: null,
  });
});
