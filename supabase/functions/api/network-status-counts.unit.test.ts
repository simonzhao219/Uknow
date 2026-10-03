// ============================================================
// 推薦網絡 overview 的 summary.statusCounts：依訂閱狀態的全樹計數（純函式契約）
//
// 為什麼要伺服器算：節點是懶載入的，前端只握有已展開的那幾層，算不出全樹。
// 計數的語意由 deriveNodeStatus 決定（停權優先、四態互斥且窮盡），這裡只釘「怎麼數」：
//   * 四個 key 永遠都在（0 也要有）——前端的 chip 列據此固定渲染四顆。
//   * 一個節點恰好落進一個桶 → 四數之和 = 節點數。
//
// 與真實 handler 的接線（四數之和 = totalReferrals、非 active 三項之和 = attention.total）
// 由 network-endpoints.test.ts 在真資料庫上斷言；這支不碰 DB，本機秒級可跑。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { countNodesByStatus } from './index.ts';

Deno.test('countNodesByStatus：空清單 → 四個狀態都回 0，key 一個不缺', () => {
  assertEquals(countNodesByStatus([]), { active: 0, expiring: 0, expired: 0, suspended: 0 });
});

Deno.test('countNodesByStatus：混合狀態 → 各自計數，四數之和等於節點總數', () => {
  const nodes = [
    { status: 'active' as const },
    { status: 'active' as const },
    { status: 'active' as const },
    { status: 'expiring' as const },
    { status: 'expiring' as const },
    { status: 'expired' as const },
    { status: 'suspended' as const },
  ];
  const counts = countNodesByStatus(nodes);
  assertEquals(counts, { active: 3, expiring: 2, expired: 1, suspended: 1 });
  assertEquals(
    counts.active + counts.expiring + counts.expired + counts.suspended,
    nodes.length,
    '一個節點恰好落進一個桶',
  );
});

Deno.test('countNodesByStatus：吃 Map.values() 這類 iterable → 與陣列同結果', () => {
  const byId = new Map([
    ['a', { status: 'expired' as const }],
    ['b', { status: 'expired' as const }],
    ['c', { status: 'active' as const }],
  ]);
  assertEquals(countNodesByStatus(byId.values()), {
    active: 1,
    expiring: 0,
    expired: 2,
    suspended: 0,
  });
});
