// ============================================================
// 推薦網絡：型別 + 回應正規化（前後端獨立部署的相容層）
// ============================================================
//
// /referrals/my-tree 由「壓平三代」改為「巢狀 roots」是破壞性契約變更。
// 前端（Cloudflare）與後端 edge function（Supabase）各自獨立部署——
// deploy-supabase.yml 只在 push main 時部署，branch 預覽跑的是舊後端。
// 因此新前端可能打到「仍回舊 referralTree 形狀」的後端。
//
// 這裡用「寬容讀取」(Postel's law)：優先用新 roots；缺 roots 但有舊
// referralTree 時，於前端把壓平三代組回巢狀樹，讓新前端在部署過渡窗
// 仍可運作。待後端新版全面部署後，可移除 legacy 分支。
// ============================================================

export type ReferralNodeStatus = 'active' | 'expiring' | 'expired' | 'suspended';

/** 推薦網絡節點（巢狀，封頂 3 代）。姓名於伺服器端遮罩（二、三代）。 */
export interface ReferralNode {
  userId: string;
  name: string;
  generation: number;
  status: ReferralNodeStatus;
  daysToExpiry: number | null;
  endDate: string | null;
  joinedAt: string;
  listingId: string | null;
  childCount: number;
  children: ReferralNode[];
}

export interface ReferralSummary {
  totalReferrals: number;
  firstGenCount: number;
  secondGenCount: number;
  thirdGenCount: number;
}

export interface ReferralData {
  userReferralCode: string;
  roots: ReferralNode[];
  summary: ReferralSummary;
}

const EMPTY_SUMMARY: ReferralSummary = {
  totalReferrals: 0,
  firstGenCount: 0,
  secondGenCount: 0,
  thirdGenCount: 0,
};

/** 舊 referralTree（壓平三代，各成員帶 referrer 連結）→ 巢狀 roots。 */
function rootsFromLegacyTree(tree: any): ReferralNode[] {
  const g1: any[] = Array.isArray(tree?.firstGeneration) ? tree.firstGeneration : [];
  const g2: any[] = Array.isArray(tree?.secondGeneration) ? tree.secondGeneration : [];
  const g3: any[] = Array.isArray(tree?.thirdGeneration) ? tree.thirdGeneration : [];

  // referrer.userId -> 直接下線（舊成員）
  const childrenByReferrer = new Map<string, any[]>();
  for (const m of [...g2, ...g3]) {
    const rid = m?.referrer?.userId;
    if (!rid) continue;
    const list = childrenByReferrer.get(rid) ?? [];
    list.push(m);
    childrenByReferrer.set(rid, list);
  }

  const toNode = (m: any, gen: number): ReferralNode => {
    const kids = childrenByReferrer.get(m?.userId) ?? [];
    return {
      userId: m?.userId ?? '',
      name: m?.userName ?? '',                 // 舊後端未遮罩；與現行 prod 行為一致（過渡）
      generation: gen,
      status: m?.isActive ? 'active' : 'expired',
      daysToExpiry: null,
      endDate: m?.activeUntil ?? null,
      joinedAt: m?.createdAt ?? '',
      listingId: m?.listingId ?? null,
      childCount: kids.length,
      children: gen < 3 ? kids.map((k) => toNode(k, gen + 1)) : [],
    };
  };

  return g1.map((m) => toNode(m, 1));
}

/**
 * 把 /referrals/my-tree 的 data 正規化成新的 ReferralData（roots）。
 * - 新後端：直接使用 roots。
 * - 舊後端：由 referralTree 於前端重建巢狀樹。
 * - 皆無：回空樹（保留 summary 若有）。
 */
export function normalizeReferralData(raw: any): ReferralData {
  const userReferralCode: string = raw?.userReferralCode ?? '';
  const summary: ReferralSummary = raw?.summary ?? EMPTY_SUMMARY;

  if (Array.isArray(raw?.roots)) {
    return { userReferralCode, roots: raw.roots as ReferralNode[], summary };
  }
  if (raw?.referralTree) {
    return { userReferralCode, roots: rootsFromLegacyTree(raw.referralTree), summary };
  }
  return { userReferralCode, roots: [], summary };
}
