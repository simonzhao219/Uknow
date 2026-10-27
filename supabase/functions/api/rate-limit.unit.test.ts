// ============================================================
// 限流工具的純函式層（不碰資料庫）：
//   (A) clientIp(c)——限流鍵用的用戶端 IP。cf-connecting-ip 優先；
//       沒有它時才退回 x-forwarded-for 第一段（用戶端可自填）。
//       格式不像 IP 的一律歸 'unknown'：超長字串當鍵會讓 bump_rate_limit
//       的 btree 寫入出錯、被它的 exception 分支吞成 fail-open（等於繞過限流），
//       任意字串也不該變成計數表裡的一列。
//   (B) 窗口上限守衛——rate_limits 由 prune_rate_limits 每小時清掉超過保留期
//       的列。窗口若長於保留期，列會在窗內被清掉＝提早重置。這條讀兩邊原始碼
//       比對，不靠兩處註解互相提醒。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ensureEdgeFunctionEnv } from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const { clientIp, clientIpSource, CHECK_EMAIL_RATE_MAX } = await import('./index.ts');

/** 最小的 Hono context 替身：clientIp 只讀 c.req.header(name)。 */
function ctx(headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { req: { header: (name: string) => lower[name.toLowerCase()] } };
}

// ------------------------------------------------------------
// (A) clientIp
// ------------------------------------------------------------

Deno.test('clientIp：cf-connecting-ip 與 x-forwarded-for 並存 → 取 cf-connecting-ip', () => {
  assertEquals(
    clientIp(ctx({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' })),
    '203.0.113.7',
  );
});

Deno.test('clientIp：沒有 cf 標頭 → 取 x-forwarded-for 第一段', () => {
  assertEquals(
    clientIp(ctx({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })),
    '198.51.100.1',
  );
});

Deno.test('clientIp：IPv6 位址照常採用', () => {
  assertEquals(clientIp(ctx({ 'cf-connecting-ip': '2001:db8::1' })), '2001:db8::1');
});

Deno.test('clientIp：兩個標頭都沒有 → unknown', () => {
  assertEquals(clientIp(ctx({})), 'unknown');
});

Deno.test('clientIp：格式不像 IP（超長、含非 IP 字元）→ unknown', () => {
  assertEquals(clientIp(ctx({ 'x-forwarded-for': 'a'.repeat(5000) })), 'unknown');
  assertEquals(clientIp(ctx({ 'x-forwarded-for': 'evil<script>' })), 'unknown');
  assertEquals(clientIp(ctx({ 'cf-connecting-ip': '1'.repeat(46) })), 'unknown');
});

// ------------------------------------------------------------
// (B) 窗口上限守衛
// ------------------------------------------------------------

Deno.test('限流窗口：index.ts 每個 *_WINDOW_SECONDS 都不長於 prune 保留期', async () => {
  const dir = new URL('.', import.meta.url);
  const source = await Deno.readTextFile(new URL('./index.ts', dir));
  const migration = await Deno.readTextFile(
    new URL('../../migrations/20261017000001_rate_limits_prune.sql', dir),
  );

  const retention = migration.match(/p_older_than_seconds int default (\d+)/);
  assert(retention, '在 migration 找不到 prune_rate_limits 的保留期預設值');
  const retentionSeconds = Number(retention[1]);

  // 常數可寫成乘式（5 * 60）以便規格書用「分鐘」對照；這裡把乘式算出來。
  const windows = [...source.matchAll(/const (\w+_WINDOW_SECONDS) = ([\d\s*]+);/g)].map((m) => ({
    name: m[1],
    seconds: m[2].split('*').reduce((acc, n) => acc * Number(n.trim()), 1),
  }));
  // 抽不到就空轉成假綠——至少要看到 check-email、members/verify、推薦碼雙窗。
  assert(windows.length >= 4, `只抽到 ${windows.length} 個窗口常數：${JSON.stringify(windows)}`);
  for (const w of windows) {
    assert(
      w.seconds <= retentionSeconds,
      `${w.name}=${w.seconds}s 長於 prune 保留期 ${retentionSeconds}s——先調高 migration 的保留期`,
    );
  }
});

// ------------------------------------------------------------
// (C) clientIpSource / check-email 限流值（現場共用 Wi-Fi 的容量裁決）
// ------------------------------------------------------------

Deno.test('clientIpSource：回報解析到的標頭名稱，不含 IP 本身', () => {
  assertEquals(
    clientIpSource(ctx({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' })),
    'cf-connecting-ip',
  );
  assertEquals(clientIpSource(ctx({ 'x-forwarded-for': '198.51.100.1' })), 'x-forwarded-for');
  assertEquals(clientIpSource(ctx({})), 'unknown');
  // 與 clientIp 一致：格式不合就是 unknown，不報來源標頭
  assertEquals(clientIpSource(ctx({ 'cf-connecting-ip': 'not an ip!' })), 'unknown');
});

Deno.test('CHECK_EMAIL_RATE_MAX：現場尖峰（同 Wi-Fi 共用 IP）上限為 60／5 分鐘', () => {
  assertEquals(CHECK_EMAIL_RATE_MAX, 60);
});
