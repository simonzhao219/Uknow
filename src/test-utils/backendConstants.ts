// 前端測試讀後端常數的單一出口。
//
// 卡片與信件模板上的數字（每小時 5 封、24 小時、7 天、刪除天數）是給使用者的承諾，
// 真相在 Deno 側：限流常數在 supabase/functions/api/index.ts、purge 預設天數在 migration。
// vitest 不載入 Deno 模組（vitest 設定絕不 include supabase/**），所以這裡以 node:fs 讀
// 原文抽值——**抽不到就拋錯**：常數改名或改寫法時測試要紅，不能默默拿到 undefined 而綠。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const INDEX_TS = resolve(ROOT, 'supabase/functions/api/index.ts');
const PURGE_MIGRATION = resolve(
  ROOT,
  'supabase/migrations/20261025000011_purge_stale_referral_invites.sql',
);

/** `export const NAME = <數字與 * 組成的乘式>;` → 數值。 */
export function readBackendConstant(name: string, source = readFileSync(INDEX_TS, 'utf8')): number {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*([0-9_\\s*]+);`));
  if (!match) throw new Error(`backendConstants: index.ts 找不到 ${name}`);
  const value = match[1]
    .split('*')
    .map((part) => Number(part.trim().replace(/_/g, '')))
    .reduce((a, b) => a * b, 1);
  if (!Number.isFinite(value)) throw new Error(`backendConstants: ${name} 不是數字乘式`);
  return value;
}

/** purge 函式的預設天數（`p_older_than_days int default N`）。 */
export function readPurgeDefaultDays(source = readFileSync(PURGE_MIGRATION, 'utf8')): number {
  const match = source.match(/p_older_than_days\s+int\s+default\s+(\d+)/i);
  if (!match) throw new Error('backendConstants: purge migration 找不到 p_older_than_days 預設值');
  return Number(match[1]);
}
