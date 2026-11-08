// 階段 5b 紅燈 stub：處理函式在綠燈 commit 實作。
import type { Context } from 'npm:hono@4';

export interface AdminReferralTreeDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  authorize: (c: Context) => Promise<401 | 403 | null>;
}

export function normalizeCode(raw: string): string {
  return raw;
}

export function createAdminReferralTreeHandlers(_deps: AdminReferralTreeDeps) {
  const notYet = (c: Context) => c.json({ success: false }, 501);
  return { nodes: notYet, search: notYet, member: notYet, payments: notYet };
}
