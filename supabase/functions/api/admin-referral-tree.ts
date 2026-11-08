// ============================================================
// 後台推薦樹查帳（第 6 波 S3a 階段 5）：/admin/referral-tree/* 的處理函式。
//
// 依賴方向：本檔**不得 import ./index.ts**（反向匯入會把整個 Hono app 拖進測試，也是
// 循環匯入；admin-referral-tree.unit.test.ts 讀原文把關）。資料庫存取只經 deps.rpc，
// 由 index.ts 的路由註冊處組一次 deps 傳進 createAdminReferralTreeHandlers。
//
// 資料全部由 RPC 組裝（migrations 20261116000001～4），本檔只做三件事：
//   1. 參數驗證（uuid、空 q、group）→ 400
//   2. RPC 錯誤一律 500，不回空清單；查無此人 → 404
//   3. snake_case → camelCase，並用 deriveNodeStatus 推導會籍四態（與推薦網絡同一份）
// 掛載位置：必須在 index.ts 的 app.use('/admin/*') 守門之後；handler 內再查一次 admin。
// ============================================================

import type { Context } from 'npm:hono@4';
import type {
  AdminReferralAnomalyKind,
  AdminReferralMemberAuditResponse,
  AdminReferralNode,
  AdminReferralNodesResponse,
  AdminReferralPaymentsResponse,
  AdminReferralSearchResponse,
} from '../_shared/admin-referral-contract.ts';
import { deriveNodeStatus } from './node-status.ts';

export interface AdminReferralTreeDeps {
  /** 呼叫 security definer RPC（service role）。 */
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  /** 第二道守門：回 null＝放行，否則回應的 HTTP 狀態（401／403）。 */
  authorize: (c: Context) => Promise<401 | 403 | null>;
}

/** 由 index.ts 的 requireAuth／isAdminUser 組出第二道守門（只傳參照，不在 index.ts 呼叫）。 */
export function adminAuthorizer(
  requireAuth: (c: Context) => Promise<{ id: string } | null>,
  isAdmin: (userId: string) => Promise<boolean>,
): AdminReferralTreeDeps['authorize'] {
  return async (c) => {
    const user = await requireAuth(c);
    if (!user) return 401;
    return (await isAdmin(user.id)) ? null : 403;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;

type Json = Record<string, any>;

function bad(c: Context, message: string) {
  return c.json({ success: false, error: { code: 'invalid_params', message } }, 400);
}

function failed(c: Context, where: string, error: unknown) {
  console.error(`[admin-referral-tree] ${where} RPC 失敗`, error);
  return c.json(
    { success: false, error: { code: 'internal', message: '讀取失敗，請稍後再試' } },
    500,
  );
}

function denied(c: Context, status: 401 | 403) {
  return c.json({ error: status === 401 ? '未授權' : '僅限管理員' }, status);
}

function optionalUuid(raw: string | undefined): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === '') return { ok: true, value: null };
  return UUID_RE.test(raw) ? { ok: true, value: raw } : { ok: false };
}

function page(c: Context): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || PAGE_DEFAULT, 1), PAGE_MAX);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  return { limit, offset };
}

/** 推薦碼正規化：NFKC → 小寫 → 去頭尾空白（規格書 §7.1，與其他輸入點一致）。 */
export function normalizeCode(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().trim();
}

export function toNode(raw: Json): AdminReferralNode {
  const { status, daysToExpiry } = deriveNodeStatus(
    { status: raw.account_status ?? null, end_date: raw.end_date ?? null },
    raw.suspended_at ?? null,
  );
  return {
    id: raw.id,
    name: raw.name ?? '',
    referralCode: raw.referral_code ?? null,
    layer: raw.layer ?? null,
    directCount: Number(raw.direct_count ?? 0),
    status,
    daysToExpiry,
    endDate: raw.end_date ?? null,
    referralProgramJoined: Boolean(raw.referral_program_joined),
    referralProgramJoinedAt: raw.referral_program_joined_at ?? null,
    anomalyKinds: (raw.anomaly_kinds ?? []) as AdminReferralAnomalyKind[],
    anomalyScanTruncated: Boolean(raw.anomaly_scan_truncated),
  };
}

const person = (p: Json) => ({
  id: p.id,
  name: p.name ?? '',
  referralCode: p.referral_code ?? null,
});

export function createAdminReferralTreeHandlers(deps: AdminReferralTreeDeps) {
  async function guard(c: Context) {
    const status = await deps.authorize(c);
    return status ? denied(c, status) : null;
  }

  return {
    async nodes(c: Context) {
      const g = await guard(c);
      if (g) return g;
      const parent = optionalUuid(c.req.query('parentId'));
      const ensure = optionalUuid(c.req.query('ensureId'));
      const group = c.req.query('group') || null;
      if (!parent.ok) return bad(c, 'parentId 格式錯誤');
      if (!ensure.ok) return bad(c, 'ensureId 格式錯誤');
      if (group !== null && group !== 'unplaceable') return bad(c, 'group 不支援');
      if (group !== null && parent.value !== null) return bad(c, 'group 與 parentId 不可同時使用');
      const { limit, offset } = page(c);

      const { data, error } = await deps.rpc('admin_referral_tree_nodes', {
        p_parent: parent.value,
        p_group: group,
        p_ensure_id: ensure.value,
        p_limit: limit,
        p_offset: offset,
      });
      if (error || !data) return failed(c, 'nodes', error);
      const d = data as Json;
      return c.json(
        {
          success: true,
          data: {
            total: Number(d.total),
            nodes: (d.nodes ?? []).map(toNode),
            pinned: d.pinned ? toNode(d.pinned) : null,
            // 只有頂層回應帶；undefined 在 JSON 序列化時省略。
            unplaceableCount: d.unplaceable_count === undefined
              ? undefined
              : Number(d.unplaceable_count),
          },
        } satisfies AdminReferralNodesResponse,
      );
    },

    async search(c: Context) {
      const g = await guard(c);
      if (g) return g;
      const q = (c.req.query('q') ?? '').trim();
      if (!q) return bad(c, '請輸入姓名或推薦碼');
      const { limit, offset } = page(c);

      const { data, error } = await deps.rpc('admin_referral_tree_search', {
        p_name: q,
        p_code: normalizeCode(q),
        p_limit: limit,
        p_offset: offset,
      });
      if (error || !data) return failed(c, 'search', error);
      const d = data as Json;
      return c.json(
        {
          success: true,
          data: {
            total: Number(d.total),
            matches: (d.matches ?? []).map((m: Json) => ({
              ...toNode(m),
              ancestorIds: m.ancestor_ids ?? null,
              unplaceableReason: m.unplaceable_reason ?? null,
            })),
          },
        } satisfies AdminReferralSearchResponse,
      );
    },

    async member(c: Context) {
      const g = await guard(c);
      if (g) return g;
      const id = c.req.param('id') ?? '';
      if (!UUID_RE.test(id)) return bad(c, '會員 id 格式錯誤');

      const { data, error } = await deps.rpc('admin_referral_member_audit', { p_user: id });
      if (error) return failed(c, 'member', error);
      if (!data) {
        return c.json(
          { success: false, error: { code: 'not_found', message: '找不到此會員' } },
          404,
        );
      }
      const d = data as Json;
      return c.json(
        {
          success: true,
          data: {
            node: toNode(d.node),
            upline: (d.upline ?? []).map(person),
            uplineStatus: d.upline_status,
            rewards: {
              byGeneration: {
                g1: Number(d.rewards?.by_generation?.['1'] ?? 0),
                g2: Number(d.rewards?.by_generation?.['2'] ?? 0),
                g3: Number(d.rewards?.by_generation?.['3'] ?? 0),
              },
              available: Number(d.rewards?.available ?? 0),
              totalEarned: Number(d.rewards?.total_earned ?? 0),
            },
            tasks: {
              monthKey: d.tasks.month_key,
              monthlyCount: Number(d.tasks.monthly_count ?? 0),
              threshold: d.tasks.threshold ?? null,
              creditsUnclaimed: Number(d.tasks.credits_unclaimed ?? 0),
              creditsClaimed: Number(d.tasks.credits_claimed ?? 0),
            },
            withdrawals: {
              pendingAmount: Number(d.withdrawals.pending_amount ?? 0),
              awaitingCollectionAmount: Number(d.withdrawals.awaiting_collection_amount ?? 0),
              completedAmount: Number(d.withdrawals.completed_amount ?? 0),
            },
            referrerHistory: {
              pastReferrers: (d.referrer_history?.past_referrers ?? []).map(person),
              freshEvents: (d.referrer_history?.fresh_events ?? []).map((e: Json) => ({
                completedAt: e.completed_at,
                newReferrerId: e.new_referrer_id,
                newReferrerName: e.new_referrer_name ?? null,
                effective: e.effective,
              })),
            },
            referrerMismatch: Boolean(d.referrer_mismatch),
            anomalies: (d.anomalies ?? []) as AdminReferralAnomalyKind[],
            paymentSummary: {
              missingCount: Number(d.payment_summary?.missing_count ?? 0),
              mismatchCount: Number(d.payment_summary?.mismatch_count ?? 0),
            },
          },
        } satisfies AdminReferralMemberAuditResponse,
      );
    },

    async payments(c: Context) {
      const g = await guard(c);
      if (g) return g;
      const id = c.req.param('id') ?? '';
      if (!UUID_RE.test(id)) return bad(c, '會員 id 格式錯誤');
      const { limit, offset } = page(c);

      const { data, error } = await deps.rpc('admin_referral_payment_audit', {
        p_user: id,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) return failed(c, 'payments', error);
      if (!data) {
        return c.json(
          { success: false, error: { code: 'not_found', message: '找不到此會員' } },
          404,
        );
      }
      const d = data as Json;
      return c.json(
        {
          success: true,
          data: {
            total: Number(d.total),
            items: (d.items ?? []).map((i: Json) => ({
              kind: i.kind,
              eventId: i.event_id,
              at: i.at ?? null,
              subscriptionId: i.subscription_id ?? null,
              claimId: i.claim_id ?? null,
              generations: (i.generations ?? []).map((g: Json) => ({
                generation: Number(g.generation),
                result: g.result,
                reason: g.reason ?? null,
                expectedId: g.expected_id ?? null,
                expectedName: g.expected_name ?? null,
                actualId: g.actual_id ?? null,
                actualName: g.actual_name ?? null,
                actualAmount: g.actual_amount ?? null,
              })),
            })),
          },
        } satisfies AdminReferralPaymentsResponse,
      );
    },
  };
}
