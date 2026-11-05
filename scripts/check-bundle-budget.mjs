#!/usr/bin/env node
// ============================================================================
// Bundle 預算閘門。
//
// 這是**棘輪**不是目標：擋住「無聲長大」，不是宣稱現況良好。
// 2026-07 基準：entry chunk 955 kB raw / 296 kB gzip——已經偏大
// （行動優先的服務，296 kB gzip 在 4G 上就是額外一秒以上的白畫面），
// 拆包是獨立的技術債，不在這支腳本的職責內。
//
// 超標時的正確反應順序：
//   1. 先問「這次 PR 真的需要多這些位元組嗎」
//   2. 真的需要 → 在 PR 內說明理由，然後才調高下面的數字
// 直接調數字而不說理由，等於這道閘門不存在。
// ============================================================================
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const ASSETS = 'build/assets';

// entry chunk（index-*.js）是「開啟任何一頁都要先下載完」的那一塊，
// 唯一真正影響首屏的數字。其餘 chunk 都是路由層 lazy 載入的。
const BUDGET = {
  // S4（PostHog 監控）分項：entry 實測 raw +1.9 kB／gzip +0.8 kB（facade、gate、
  // 排程、pageview hook），故在 S7 的 W5-30 額度之外另加 raw +2、gzip +1.0。
  // 誰後合併，誰在 PR 內文寫明兩項合計值（S7 另有 gzip +3 的專用額度）。
  entryRawKB: 1002, // 原 1000；S4 +2
  entryGzipKB: 313, // 原 310→312（H1 hotfix）；S4 +1.0
  // S4：posthog-js 的動態 chunk（module-*.js ≈ 357 kB raw）與 analyticsConfig chunk
  // 只在 idle 之後載入，不影響首屏，實測總量 1917.8 kB（原 1555.8）。
  totalRawKB: 1950, // 原 1600；S4 +350
};

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

let files;
try {
  files = readdirSync(ASSETS).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`✗ 找不到 ${ASSETS}/ —— 請先 npm run build`);
  process.exit(1);
}

const entryName = files.find((f) => /^index-.*\.js$/.test(f));
if (!entryName) {
  console.error(`✗ ${ASSETS}/ 裡找不到 index-*.js entry chunk`);
  process.exit(1);
}

const entryBuf = readFileSync(join(ASSETS, entryName));
const entryRaw = kb(entryBuf.byteLength);
const entryGzip = kb(gzipSync(entryBuf).byteLength);
const totalRaw = kb(files.reduce((sum, f) => sum + statSync(join(ASSETS, f)).size, 0));

const checks = [
  ['entry raw ', entryRaw, BUDGET.entryRawKB],
  ['entry gzip', entryGzip, BUDGET.entryGzipKB],
  ['總 JS raw ', totalRaw, BUDGET.totalRawKB],
];

let failed = false;
for (const [label, actual, budget] of checks) {
  const pct = Math.round((actual / budget) * 100);
  const over = actual > budget;
  if (over) failed = true;
  console.log(`${over ? '✗' : '✓'} ${label}  ${actual} kB / ${budget} kB  (${pct}%)`);
}

if (failed) {
  console.error('\n✗ 超出 bundle 預算。先確認這些位元組是必要的，再考慮調整');
  console.error('  scripts/check-bundle-budget.mjs 的 BUDGET（並在 PR 說明理由）。');
  process.exit(1);
}
console.log('\n✓ bundle 預算內');
