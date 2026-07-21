import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Users, ExternalLink, Ban, Search, AlertTriangle, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { cn } from '../ui/utils';
import { formatTwDate } from '../../utils/twDate';
import type { ReferralNode, ReferralNodeStatus } from '../../hooks/useReferralData';

// ============================================================
// 推薦網絡：可展開的縮排大綱樹
// P0：頭像依身分差色、連接線 + 降噪、需要關注橫幅
// P1：桌機雙欄（樹 + 常駐詳情）、搜尋、分支規模感（chevron 上的數量）
// ============================================================

const GEN_LABEL: Record<number, string> = { 1: '一代', 2: '二代', 3: '三代' };
const GEN_BADGE: Record<number, string> = {
  1: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  2: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  3: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
};

const STATUS: Record<ReferralNodeStatus, { dot: string; label: string; badge: string }> = {
  active:    { dot: 'bg-green-500', label: '訂閱中', badge: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' },
  expiring:  { dot: 'bg-amber-500', label: '即將到期', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  expired:   { dot: 'bg-gray-400', label: '已失效', badge: 'bg-muted text-muted-foreground' },
  suspended: { dot: 'bg-red-500', label: '已停權', badge: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
};

/** 失效 / 停權者的刊登已被 has_active_subscription 隱藏，不提供「查看刊登」連結。 */
const listingHidden = (s: ReferralNodeStatus) => s === 'expired' || s === 'suspended';
const needsAttention = (s: ReferralNodeStatus) => s === 'expiring' || s === 'expired' || s === 'suspended';

// 依 userId 給頭像底色（辨識度），取代單一底色的「一片相同」。
const AVATAR_COLORS = ['#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#ca8a04', '#4f46e5', '#0d9488'];
function avatarColor(id: string): string {
  let sum = 0;
  for (const ch of id) sum = (sum + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[sum];
}
function initial(name: string): string {
  return name.trim().slice(0, 1) || '?';
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function flatten(nodes: ReferralNode[]): ReferralNode[] {
  const out: ReferralNode[] = [];
  const walk = (n: ReferralNode) => {
    out.push(n);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

// ---------- 頭像 ----------
function Avatar({ node, size = 36 }: { node: ReferralNode; size?: number }) {
  const s = STATUS[node.status];
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid h-full w-full place-items-center rounded-full font-semibold text-white"
        style={{ backgroundColor: avatarColor(node.userId), fontSize: size * 0.38 }}
      >
        {initial(node.name)}
      </span>
      <span className={cn('absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-card', s.dot)} style={{ width: size * 0.3, height: size * 0.3 }} aria-hidden />
    </span>
  );
}

// ---------- 樹的一列 + 其子節點（連接線） ----------
function NodeRow({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: ReferralNode;
  depth: number;
  selectedId: string | null;
  onSelect: (n: ReferralNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const expandable = node.generation < 3 && node.childCount > 0;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-lg py-2 pl-1 pr-2 cursor-pointer transition-colors hover:bg-muted/60',
          selectedId === node.userId && 'bg-muted',
          listingHidden(node.status) && 'opacity-55',
        )}
        onClick={() => onSelect(node)}
      >
        {/* 展開箭頭（含分支規模：subtle 數量） */}
        {expandable ? (
          <button
            type="button"
            aria-label={open ? '收合' : '展開'}
            className="flex h-6 min-w-6 items-center justify-center gap-0.5 rounded px-0.5 text-muted-foreground hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
            <span className="text-[11px] tabular-nums leading-none">{node.childCount}</span>
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        <Avatar node={node} />

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{node.name}</span>
        </span>

        {node.status === 'expiring' && node.daysToExpiry != null && (
          <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400">
            剩 {node.daysToExpiry} 天到期
          </span>
        )}
      </div>

      {expandable && open && (
        // 連接線：以細的左邊界表達父子分支，取代原本的整條粗色軌
        <div className="ml-4 border-l border-border/70 pl-2">
          {node.children.map((child) => (
            <NodeRow key={child.userId} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- 需要關注橫幅 ----------
function AttentionBanner({ nodes, onSelect }: { nodes: ReferralNode[]; onSelect: (n: ReferralNode) => void }) {
  const items = useMemo(() => {
    const list = flatten(nodes).filter((n) => needsAttention(n.status));
    const rank = (n: ReferralNode) => (n.status === 'expiring' ? 0 : n.status === 'expired' ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));
  }, [nodes]);

  if (items.length === 0) return null;

  const reason = (n: ReferralNode) =>
    n.status === 'expiring' ? `剩 ${n.daysToExpiry} 天到期` : n.status === 'suspended' ? '已停權' : '已失效';

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        {items.length} 位下線需要關注
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((n) => (
          <button
            key={n.userId}
            type="button"
            onClick={() => onSelect(n)}
            className="flex items-center gap-2 rounded-full border border-amber-300 bg-card px-2.5 py-1 text-xs transition-colors hover:bg-muted dark:border-amber-800"
          >
            <span className={cn('h-2 w-2 rounded-full', STATUS[n.status].dot)} aria-hidden />
            <span className="font-medium">{n.name}</span>
            <span className="text-muted-foreground">· {reason(n)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- 詳情內容（sheet 與桌機側欄共用） ----------
function NodeDetail({ node }: { node: ReferralNode }) {
  const navigate = useNavigate();
  const s = STATUS[node.status];
  const hidden = listingHidden(node.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', GEN_BADGE[node.generation])}>
          {GEN_LABEL[node.generation]}
        </span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', s.badge)}>● {s.label}</span>
        {node.generation < 3 && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {node.childCount} 位直接下線
          </span>
        )}
      </div>

      <dl className="divide-y divide-border rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2.5 text-sm">
          <dt className="text-muted-foreground">加入日期</dt>
          <dd className="font-medium">{formatTwDate(node.joinedAt)}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 text-sm">
          <dt className="text-muted-foreground">訂閱到期</dt>
          <dd className={cn('font-medium', node.status === 'expiring' && 'text-amber-600 dark:text-amber-400')}>
            {node.endDate ? formatTwDate(node.endDate) : '—'}
            {node.status === 'expiring' && node.daysToExpiry != null && `（剩 ${node.daysToExpiry} 天）`}
          </dd>
        </div>
      </dl>

      {hidden ? (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          <Ban className="h-4 w-4" />
          此帳號{node.status === 'suspended' ? '已停權' : '已失效'}，刊登已下架
        </div>
      ) : node.listingId ? (
        <button
          type="button"
          onClick={() => navigate(`/service-providers/${node.listingId}`)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-4 w-4" />
          查看刊登
        </button>
      ) : (
        <div className="rounded-lg bg-muted px-3 py-2.5 text-center text-sm text-muted-foreground">尚未建立刊登</div>
      )}
    </div>
  );
}

// ---------- 主元件 ----------
export function ReferralTreeView({ roots }: { roots: ReferralNode[] }) {
  const [selected, setSelected] = useState<ReferralNode | null>(null);
  const [query, setQuery] = useState('');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // selected 依 userId 從最新 roots 取回（避免展開/資料更新後拿到舊物件）
  const flat = useMemo(() => flatten(roots), [roots]);
  const selectedNode = selected ? flat.find((n) => n.userId === selected.userId) ?? selected : null;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return flat.filter((n) => n.name.toLowerCase().includes(q));
  }, [query, flat]);

  if (roots.length === 0) {
    return (
      <div className="rounded-lg border py-8 text-center">
        <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">尚未有推薦人</p>
        <p className="mt-2 text-sm text-muted-foreground">分享您的推薦碼給好友吧！</p>
      </div>
    );
  }

  const onSelect = (n: ReferralNode) => setSelected(n);

  const treeColumn = (
    <div className="space-y-3">
      <AttentionBanner nodes={roots} onSelect={onSelect} />

      {/* 搜尋（比對顯示名稱；深代數已遮罩，主要適用直推） */}
      <div className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋下線姓名"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button type="button" aria-label="清除搜尋" onClick={() => setQuery('')} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {searchResults ? (
        searchResults.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">找不到「{query}」</p>
        ) : (
          <div className="space-y-0.5">
            {searchResults.map((n) => (
              <div
                key={n.userId}
                onClick={() => onSelect(n)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg py-2 pl-1 pr-2 transition-colors hover:bg-muted/60',
                  selectedNode?.userId === n.userId && 'bg-muted',
                )}
              >
                <Avatar node={n} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{n.name}</span>
                  <span className="text-xs text-muted-foreground">{GEN_LABEL[n.generation]}</span>
                </span>
                {n.status === 'expiring' && n.daysToExpiry != null && (
                  <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400">剩 {n.daysToExpiry} 天到期</span>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-0.5">
          {roots.map((node) => (
            <NodeRow key={node.userId} node={node} depth={0} selectedId={selectedNode?.userId ?? null} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 桌機：左樹右詳情（常駐）；手機：單欄 + bottom sheet */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        {treeColumn}

        <aside className="hidden lg:block">
          <div className="sticky top-4 rounded-lg border bg-card p-4">
            {selectedNode ? (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar node={selectedNode} size={44} />
                  <p className="text-lg font-semibold">{selectedNode.name}</p>
                </div>
                <NodeDetail node={selectedNode} />
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                點選任一節點
                <br />
                查看該下線的詳情
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* 手機詳情 sheet（桌機不觸發） */}
      {!isDesktop && (
        <Sheet open={!!selectedNode} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent side="bottom" className="mx-auto max-h-[85%] gap-0 rounded-t-2xl sm:max-w-lg">
            {selectedNode && (
              <>
                <SheetHeader className="pb-2">
                  <div className="flex items-center gap-3 pr-8">
                    <Avatar node={selectedNode} size={48} />
                    <SheetTitle className="text-lg">{selectedNode.name}</SheetTitle>
                  </div>
                </SheetHeader>
                <div className="overflow-y-auto px-4 pb-6">
                  <NodeDetail node={selectedNode} />
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
