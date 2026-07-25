import type React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Users,
  ExternalLink,
  Ban,
  Search,
  AlertTriangle,
  X,
  ArrowUpDown,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { formatTwDate } from '../../utils/twDate';
import {
  DEFAULT_NETWORK_SORT,
  SORT_OPTIONS,
  parseSortMode,
  nodeDaysLeft,
  type NetworkNode,
  type NetworkNodeStatus,
  type NetworkOverview,
  type NetworkSearchMatch,
  type NetworkSortMode,
} from '../../utils/referralNetwork';

// ============================================================
// 推薦網絡：懶載入縮排大綱樹（Tier B）
// - 節點扁平化：展開才呼叫 loadChildren（skeleton 等待、hook 層快取）
// - 排序：伺服器權威；此處只受控顯示 + 回報變更（原生 select，行動端佳）
// - 搜尋：debounce 300ms 打伺服器（真名比對在後端，深代遮罩也搜得到）
// - 對齊（方案 A）：前導槽固定寬只放 chevron；分支數移列右側，
//   即將到期的倒數優先於分支數
// - 顏色語意：頭像底色＝世代、右下角圓點＝訂閱狀態，兩者各自單一職責
// ============================================================

const GEN_LABEL: Record<number, string> = { 1: '一代', 2: '二代', 3: '三代' };
const GEN_BADGE: Record<number, string> = {
  1: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  2: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  3: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
};
// 分支連接線依「子代」低飽和上色（世代線索綁在結構上）
const GEN_LINE: Record<number, string> = {
  2: 'border-purple-300 dark:border-purple-900',
  3: 'border-orange-300 dark:border-orange-900',
};

const STATUS: Record<NetworkNodeStatus, { dot: string; label: string; badge: string }> = {
  active: {
    dot: 'bg-green-500',
    label: '訂閱中',
    badge: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  },
  expiring: {
    dot: 'bg-amber-500',
    label: '即將到期',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  expired: { dot: 'bg-gray-400', label: '已失效', badge: 'bg-muted text-muted-foreground' },
  suspended: {
    dot: 'bg-red-500',
    label: '已停權',
    badge: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  },
};

/** 失效 / 停權者的刊登已被 has_active_subscription 隱藏，不提供「查看刊登」連結。 */
const listingHidden = (s: NetworkNodeStatus) => s === 'expired' || s === 'suspended';

// 頭像底色綁世代（與 GEN_BADGE / GEN_LINE 同色系）：一代綠、二代紫、三代橘。
// 先前是 userId 雜湊色，調色盤與狀態色／世代色撞色，容易被誤讀成分類。
const GEN_AVATAR: Record<number, string> = {
  1: '#16a34a',
  2: '#7c3aed',
  3: '#ea580c',
};
const GEN_AVATAR_FALLBACK = '#64748b'; // 世代超出 1–3 時的中性色
function avatarColor(generation: number): string {
  return GEN_AVATAR[generation] ?? GEN_AVATAR_FALLBACK;
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

const INTERACTIVE_ROW = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
function rowKeyActivate(handler: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };
}

// ---------- 頭像 ----------
function Avatar({ node, size = 36 }: { node: NetworkNode; size?: number }) {
  const s = STATUS[node.status];
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid h-full w-full place-items-center rounded-full font-semibold text-white"
        style={{ backgroundColor: avatarColor(node.generation), fontSize: size * 0.38 }}
      >
        {initial(node.name)}
      </span>
      <span
        className={cn('absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-card', s.dot)}
        style={{ width: size * 0.3, height: size * 0.3 }}
        aria-hidden
      />
    </span>
  );
}

// ---------- 列右側：到期倒數優先，其次分支數 ----------
function RowAside({ node }: { node: NetworkNode }) {
  if (node.status === 'expiring') {
    const d = nodeDaysLeft(node);
    if (d != null) {
      return (
        <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400">
          剩 {d} 天到期
        </span>
      );
    }
  }
  if (node.childCount > 0) {
    return (
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {node.childCount > 99 ? '99+' : node.childCount} 位
      </span>
    );
  }
  return null;
}

// ---------- 樹的一列（懶載入） ----------
interface NodeRowProps {
  node: NetworkNode;
  childrenMap: Record<string, NetworkNode[] | 'loading'>;
  expanded: Set<string>;
  onToggle: (node: NetworkNode) => void;
  selectedId: string | null;
  onSelect: (n: NetworkNode) => void;
}

function NodeRow({ node, childrenMap, expanded, onToggle, selectedId, onSelect }: NodeRowProps) {
  const expandable = node.generation < 3 && node.childCount > 0;
  const isOpen = expanded.has(node.userId);
  const kids = childrenMap[node.userId];
  const groupId = `rtn-group-${node.userId}`;

  return (
    <div>
      <div
        role="treeitem"
        tabIndex={0}
        aria-level={node.generation}
        aria-selected={selectedId === node.userId}
        aria-expanded={expandable ? isOpen : undefined}
        aria-owns={expandable && isOpen ? groupId : undefined}
        aria-label={`${node.name} 詳情`}
        className={cn(
          'group flex items-center gap-2 rounded-lg py-2 pl-1 pr-2 cursor-pointer transition-colors hover:bg-muted/60',
          INTERACTIVE_ROW,
          selectedId === node.userId && 'bg-muted',
          listingHidden(node.status) && 'opacity-55',
        )}
        onClick={() => onSelect(node)}
        onKeyDown={rowKeyActivate(() => onSelect(node))}
      >
        {/* 前導槽固定寬（方案 A）：只放 chevron，葉節點等寬留白 → 頭像永遠對齊 */}
        {expandable ? (
          <button
            type="button"
            aria-label={isOpen ? '收合' : '展開'}
            aria-expanded={isOpen}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node);
            }}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        <Avatar node={node} />

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{node.name}</span>
        </span>

        <RowAside node={node} />
      </div>

      {expandable && isOpen && (
        <div
          id={groupId}
          role="group"
          className={cn('ml-4 border-l pl-2', GEN_LINE[node.generation + 1] ?? 'border-border/70')}
        >
          {kids === 'loading' || kids === undefined ? (
            <div data-testid="children-loading" className="space-y-2 py-2 pl-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ) : (
            kids.map((child) => (
              <NodeRow
                key={child.userId}
                node={child}
                childrenMap={childrenMap}
                expanded={expanded}
                onToggle={onToggle}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------- 需要關注橫幅（伺服器算好：依緊急度排序 + 上限） ----------
function AttentionBanner({
  attention,
  onSelect,
}: {
  attention: { total: number; items: NetworkNode[] };
  onSelect: (n: NetworkNode) => void;
}) {
  if (attention.total === 0 || attention.items.length === 0) return null;

  const reason = (n: NetworkNode) =>
    n.status === 'expiring'
      ? `剩 ${nodeDaysLeft(n)} 天到期`
      : n.status === 'suspended'
        ? '已停權'
        : '已失效';
  const overflow = attention.total - attention.items.length;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        {attention.total} 位下線需要關注
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {attention.items.map((n) => (
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
        {overflow > 0 && (
          <span className="text-xs text-amber-800 dark:text-amber-300">還有 {overflow} 位</span>
        )}
      </div>
    </div>
  );
}

// ---------- 詳情內容（sheet 與桌機側欄共用） ----------
function NodeDetail({ node }: { node: NetworkNode }) {
  const navigate = useNavigate();
  const s = STATUS[node.status];
  const hidden = listingHidden(node.status);
  const d = node.status === 'expiring' ? nodeDaysLeft(node) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold',
            GEN_BADGE[node.generation],
          )}
        >
          {GEN_LABEL[node.generation]}
        </span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', s.badge)}>
          ● {s.label}
        </span>
        {node.generation < 3 && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {node.childCount} 位直接下線
          </span>
        )}
      </div>

      <dl className="divide-y divide-border rounded-lg border">
        <div className="flex items-center justify-between px-3 py-2.5 text-sm">
          <dt className="text-muted-foreground">加入日期</dt>
          <dd className="font-medium">{node.joinedAt ? formatTwDate(node.joinedAt) : '—'}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 text-sm">
          <dt className="text-muted-foreground">訂閱到期</dt>
          <dd
            className={cn(
              'font-medium',
              node.status === 'expiring' && 'text-amber-600 dark:text-amber-400',
            )}
          >
            {node.endDate ? formatTwDate(node.endDate) : '—'}
            {d != null && `（剩 ${d} 天）`}
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
        <div className="rounded-lg bg-muted px-3 py-2.5 text-center text-sm text-muted-foreground">
          尚未建立刊登
        </div>
      )}
    </div>
  );
}

// ---------- 主元件 ----------
interface ReferralTreeViewProps {
  overview: NetworkOverview | null;
  sort: NetworkSortMode;
  onSortChange: (mode: NetworkSortMode) => void;
  loadChildren: (parentId: string) => Promise<NetworkNode[]>;
  searchNetwork: (
    q: string,
    offset: number,
  ) => Promise<{ matches: NetworkSearchMatch[]; total: number }>;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; matches: NetworkSearchMatch[] }
  | { status: 'error' };

export function ReferralTreeView({
  overview,
  sort,
  onSortChange,
  loadChildren,
  searchNetwork,
}: ReferralTreeViewProps) {
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = useState<Record<string, NetworkNode[] | 'loading'>>({});
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // 切排序：伺服器是排序權威，已展開的分支順序作廢 → 收合重來
  useEffect(() => {
    setExpanded(new Set());
    setChildrenMap({});
  }, [sort]);

  // 伺服器搜尋（debounce 300ms；過時回應丟棄）
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearch({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setSearch({ status: 'loading' });
    const t = setTimeout(() => {
      searchNetwork(q, 0)
        .then(({ matches }) => {
          if (!cancelled) setSearch({ status: 'done', matches });
        })
        .catch(() => {
          if (!cancelled) setSearch({ status: 'error' });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, searchNetwork, sort]);

  const roots = overview?.roots ?? [];
  const onSelect = (n: NetworkNode) => setSelected(n);

  const onToggle = (node: NetworkNode) => {
    const id = node.userId;
    if (expanded.has(id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setExpanded((prev) => new Set(prev).add(id));
    if (childrenMap[id] === undefined) {
      setChildrenMap((prev) => ({ ...prev, [id]: 'loading' }));
      loadChildren(id)
        .then((nodes) => setChildrenMap((prev) => ({ ...prev, [id]: nodes })))
        .catch(() => {
          // 載入失敗：收回展開，讓使用者可重試（skeleton 不會卡死）
          setChildrenMap((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    }
  };

  if (roots.length === 0 && (overview?.attention.total ?? 0) === 0) {
    return (
      <div className="rounded-lg border py-8 text-center">
        <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">尚未有推薦人</p>
        <p className="mt-2 text-sm text-muted-foreground">分享您的推薦碼給好友吧！</p>
      </div>
    );
  }

  const searching = query.trim().length > 0;

  const treeColumn = (
    <div className="space-y-3">
      {overview && <AttentionBanner attention={overview.attention} onSelect={onSelect} />}

      {/* 搜尋 + 排序 */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border bg-muted/40 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋下線姓名"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              aria-label="清除搜尋"
              onClick={() => setQuery('')}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* 排序：Radix DropdownMenu——原生 select 的選單面板由 OS 渲染，
            風格管不到（直角、系統反白），與站內其他篩選器不一致，故退役。
            觸發器維持晶片：手機 icon-only（非預設排序亮指示點補償狀態
            可見性）、sm+ 帶短標籤；單一文字來源，疊字問題結構性絕跡。 */}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`排序方式：${SORT_OPTIONS.find((o) => o.value === sort)?.label ?? ''}`}
            className="relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border bg-muted/40 p-2.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:py-2 sm:pl-3 sm:pr-3"
          >
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            {/* 四個標籤疊同一 grid 格：晶片寬恆為最寬標籤之寬，切換排序不伸縮。
                非當前者 invisible 佔位、aria-hidden 退出 a11y 樹（單一可讀文字不變） */}
            <span data-testid="sort-label" className="hidden sm:grid">
              {SORT_OPTIONS.map((o) => (
                <span
                  key={o.value}
                  aria-hidden={o.value !== sort || undefined}
                  className={cn(
                    'col-start-1 row-start-1 whitespace-nowrap',
                    o.value !== sort && 'invisible',
                  )}
                >
                  {o.label}
                </span>
              ))}
            </span>
            {sort !== DEFAULT_NETWORK_SORT && (
              <span
                data-testid="sort-active-dot"
                aria-hidden
                className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-500 sm:hidden"
              />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[9rem]">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(v) => onSortChange(parseSortMode(v))}
            >
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value} className="py-2.5">
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {searching ? (
        search.status === 'loading' ? (
          <div className="space-y-2 py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ) : search.status === 'error' ? (
          <p className="py-6 text-center text-sm text-muted-foreground">搜尋失敗，請稍後再試</p>
        ) : search.status === 'done' && search.matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">找不到「{query.trim()}」</p>
        ) : search.status === 'done' ? (
          <div className="space-y-0.5">
            {search.matches.map(({ node }) => (
              <div
                key={node.userId}
                role="button"
                tabIndex={0}
                aria-label={`${node.name} 詳情`}
                onClick={() => onSelect(node)}
                onKeyDown={rowKeyActivate(() => onSelect(node))}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg py-2 pl-1 pr-2 transition-colors hover:bg-muted/60',
                  INTERACTIVE_ROW,
                  selected?.userId === node.userId && 'bg-muted',
                )}
              >
                <Avatar node={node} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{node.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {GEN_LABEL[node.generation]}
                  </span>
                </span>
                <RowAside node={node} />
              </div>
            ))}
          </div>
        ) : null
      ) : (
        <div role="tree" aria-label="我的推薦網絡" className="space-y-0.5">
          {roots.map((node) => (
            <NodeRow
              key={node.userId}
              node={node}
              childrenMap={childrenMap}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selected?.userId ?? null}
              onSelect={onSelect}
            />
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
            {selected ? (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar node={selected} size={44} />
                  <p className="text-lg font-semibold">{selected.name}</p>
                </div>
                <NodeDetail node={selected} />
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
        <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent
            side="bottom"
            className="mx-auto max-h-[85%] gap-0 rounded-t-2xl sm:max-w-lg"
          >
            {selected && (
              <>
                <SheetHeader className="pb-2">
                  <div className="flex items-center gap-3 pr-8">
                    <Avatar node={selected} size={48} />
                    <SheetTitle className="text-lg">{selected.name}</SheetTitle>
                  </div>
                </SheetHeader>
                <div className="overflow-y-auto px-4 pb-6">
                  <NodeDetail node={selected} />
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
