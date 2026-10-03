// ============================================================
// 推薦網絡的節點狀態與依狀態計數（純函式契約）
//
// 推薦會員看這頁是為了錢，數字錯一次信任就沒了：樹上每一列的顏色、橫幅、樹上方的
// 狀態 chip 計數，都必須來自同一套判定。這支釘住判定本身（deriveNodeStatus）與
// 計數（countNodesByStatus）：
//   * 四態互斥且窮盡，**停權優先**（被停權者即使帳戶還 active 也算 suspended）。
//   * expiring 的邊界在「剩 30 天」：第 30 天含、第 31 天不含，今天到期仍是 expiring。
//   * 時鐘由呼叫端注入（nowMs）——overview 一個請求只取一次 now，才不會有節點在
//     30 天邊界兩側被算成不同狀態，造成計數與樹上的列對不上。
//
// 與真實 handler 的接線（四數之和 = totalReferrals、非 active 三項之和 =
// attention.total）由 network-endpoints.test.ts 在真資料庫上斷言；這支不碰 DB，
// 本機秒級可跑。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { countNodesByStatus, deriveNodeStatus } from './index.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-03T00:00:00Z');
const activeAcct = (endMs: number | null) => ({
  status: 'active',
  end_date: endMs === null ? null : new Date(endMs).toISOString(),
});

Deno.test('deriveNodeStatus：停權優先於一切，帳戶仍 active 也算 suspended → 不倒數', () => {
  const expected = { status: 'suspended', daysToExpiry: null } as const;
  assertEquals(
    deriveNodeStatus(activeAcct(NOW + 100 * DAY), '2026-09-01T00:00:00Z', NOW),
    expected,
  );
  assertEquals(deriveNodeStatus({ status: 'expired' }, '2026-09-01T00:00:00Z', NOW), expected);
  assertEquals(deriveNodeStatus(undefined, '2026-09-01T00:00:00Z', NOW), expected);
});

Deno.test('deriveNodeStatus：帳戶缺席或非 active → expired，不倒數', () => {
  const expected = { status: 'expired', daysToExpiry: null } as const;
  assertEquals(deriveNodeStatus(undefined, null, NOW), expected);
  assertEquals(deriveNodeStatus(null, null, NOW), expected);
  assertEquals(deriveNodeStatus({ status: 'expired', end_date: null }, null, NOW), expected);
});

Deno.test('deriveNodeStatus：剛好剩 30 天 → expiring（邊界含第 30 天）', () => {
  assertEquals(deriveNodeStatus(activeAcct(NOW + 30 * DAY), null, NOW), {
    status: 'expiring',
    daysToExpiry: 30,
  });
});

Deno.test('deriveNodeStatus：多 1 毫秒就是第 31 天 → active（邊界不含第 31 天）', () => {
  assertEquals(deriveNodeStatus(activeAcct(NOW + 30 * DAY + 1), null, NOW), {
    status: 'active',
    daysToExpiry: 31,
  });
});

Deno.test('deriveNodeStatus：今天到期（剩 0 天）→ expiring，不是 expired', () => {
  assertEquals(deriveNodeStatus(activeAcct(NOW), null, NOW), {
    status: 'expiring',
    daysToExpiry: 0,
  });
});

Deno.test('deriveNodeStatus：active 但沒有到期日 → active，不倒數', () => {
  assertEquals(deriveNodeStatus(activeAcct(null), null, NOW), {
    status: 'active',
    daysToExpiry: null,
  });
});

Deno.test('deriveNodeStatus：同一個 nowMs 之下，跨 30 天邊界的兩人各得確定的狀態', () => {
  // 兩人到期日只差 1 毫秒、橫跨邊界：同一個 now 之下一個 expiring、一個 active。
  // 若各自讀時鐘，兩人的歸屬就可能隨呼叫時機互換——這就是 overview 要共用快照的原因。
  const a = deriveNodeStatus(activeAcct(NOW + 30 * DAY), null, NOW).status;
  const b = deriveNodeStatus(activeAcct(NOW + 30 * DAY + 1), null, NOW).status;
  assertEquals([a, b], ['expiring', 'active']);
});

Deno.test('countNodesByStatus：空清單 → 四個狀態都回 0，key 一個不缺', () => {
  assertEquals(countNodesByStatus([]), { active: 0, expiring: 0, expired: 0, suspended: 0 });
});

Deno.test('countNodesByStatus：混合狀態 → 各狀態各自計數，一個節點只落進一個桶', () => {
  const nodes = [
    { status: 'active' as const },
    { status: 'active' as const },
    { status: 'active' as const },
    { status: 'expiring' as const },
    { status: 'expiring' as const },
    { status: 'expired' as const },
    { status: 'suspended' as const },
  ];
  assertEquals(countNodesByStatus(nodes), { active: 3, expiring: 2, expired: 1, suspended: 1 });
});
