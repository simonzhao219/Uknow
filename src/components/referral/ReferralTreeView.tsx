import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
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
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { StatusCallout } from '../ui/status-callout';
import { cn } from '../ui/utils';
import { formatTwDate } from '../../utils/twDate';
import { useMediaQuery } from '../../hooks/useMediaQuery';
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
  type NetworkSummary,
} from '../../utils/referralNetwork';

// ============================================================
// 推薦網絡：懶載入縮排大綱樹（Tier B）
// - 節點扁平化：展開才呼叫 loadChildren（skeleton 等待、hook 層快取）
// - 排序：伺服器權威；此處只受控顯示 + 回報變更（原生 select，行動端佳）
// - 搜尋：debounce 300ms 打伺服器（真名比對在後端，深代遮罩也搜得到）
// - 對齊（方案 A）：前導槽固定寬只放 chevron；分支數移列右側，
//   即將到期的倒數優先於分支數
// - 顏色分工（S2c）：一個畫面裡顏色只做一件事。頭像底色＝訂閱狀態（唯一跟收入
//   直接相關的維度：三代獎勵同額，規格書 §8.1，下線續約就發獎）；世代是結構，
//   由縮排與連接線承擔，不再用頭像色重複編碼。狀態文字是色盲防線（§12.7）。
// - 過濾：樹上方的狀態 chip 只隱藏「確定沒有符合者」的節點，見 keepUnderFilter
// ============================================================

const GEN_LABEL: Record<number, string> = { 1: '一代', 2: '二代', 3: '三代' };
// 世代是結構屬性（§12.5 (c)）：走灰階，不占用頭像顏色。
const GEN_BADGE = 'bg-muted text-muted-foreground';
// 分支連接線依「子代」上色（一代是根、沒有入線，所以只有二、三代）：--muted-foreground
// 疊透明度，越深代越淡。最淡一階（80%）對 --background／--card 仍達非文字 3:1
// （淺 3.27／深 4.86），globals.test.ts 以同一公式釘住——要調透明度，先改那邊的常數。
// 不能再往下淡：55% 在淺色只剩 2.1:1。
const GEN_LINE: Record<number, string> = {
  2: 'border-muted-foreground',
  3: 'border-muted-foreground/80',
};

// 訂閱狀態的視覺語彙——單一事實來源：頭像、chip、詳情 pill、需要關注橫幅都從這裡取。
// class 一律寫字面量（Tailwind 靠掃原始碼產生 CSS，不能在執行期拼字串）。
//   avatar：頭像底＋字。實心底（A 形狀）＝亮底黑字；已失效沒有語義色，用中性灰。
//   pill／chip：淺底三件組（B 形狀）。已失效用 text-foreground 而非 text-muted-foreground
//     ——後者疊在 bg-muted 上只有 4.06:1，這是新增的文字，不該明知故犯。
//   dot：8px 色點，顏色與頭像底色對得上，所以 chip 兼作圖例，不必另畫顏色說明。
const STATUS: Record<
  NetworkNodeStatus,
  { label: string; dot: string; avatar: string; pill: string; chip: string }
> = {
  active: {
    label: '訂閱中',
    dot: 'bg-success',
    avatar: 'bg-success text-success-foreground',
    pill: 'bg-success-subtle text-success-subtle-foreground',
    chip: 'border-success-border bg-success-subtle text-success-subtle-foreground',
  },
  expiring: {
    label: '即將到期',
    dot: 'bg-warning',
    avatar: 'bg-warning text-warning-foreground',
    pill: 'bg-warning-subtle text-warning-subtle-foreground',
    chip: 'border-warning-border bg-warning-subtle text-warning-subtle-foreground',
  },
  expired: {
    label: '已失效',
    dot: 'bg-muted-foreground',
    avatar: 'bg-muted text-muted-foreground',
    pill: 'bg-muted text-foreground',
    chip: 'border-border bg-muted text-foreground',
  },
  suspended: {
    label: '已停權',
    dot: 'bg-destructive',
    avatar: 'bg-destructive text-destructive-foreground',
    pill: 'bg-destructive-subtle text-destructive-subtle-foreground',
    chip: 'border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground',
  },
};
const CHIP_ORDER: readonly NetworkNodeStatus[] = ['active', 'expiring', 'expired', 'suspended'];

/** 失效 / 停權者的刊登已被 has_active_subscription 隱藏，不提供「查看刊登」連結。 */
const listingHidden = (s: NetworkNodeStatus) => s === 'expired' || s === 'suspended';

function initial(name: string): string {
  return name.trim().slice(0, 1) || '?';
}

const NEW_MEMBER_DAYS = 30;
/** 加入 30 天內。伺服器缺值時 joinedAt 是 ''，Date.parse 得 NaN → 不算新（不顯示、不崩潰）。 */
function isNewMember(joinedAt: string, now = Date.now()): boolean {
  const ms = Date.parse(joinedAt);
  return Number.isFinite(ms) && now - ms <= NEW_MEMBER_DAYS * 86_400_000;
}

/** 整列底色：選中（brand-subtle）勝過即將到期（warning-subtle）；兩者都不被 hover 蓋掉。 */
function rowTone(status: NetworkNodeStatus, selected: boolean): string | undefined {
  if (selected) return 'bg-brand-subtle hover:bg-brand-subtle';
  if (status === 'expiring') return 'bg-warning-subtle hover:bg-warning-subtle';
  return undefined;
}

type ChildrenMap = Record<string, NetworkNode[] | 'loading'>;
type NodeStatusFilter = NetworkNodeStatus | null;
type StatusCounts = NetworkSummary['statusCounts'];

/**
 * 過濾下這個節點留不留：只隱藏「確定沒有符合者」的節點。
 * 樹是懶載入的，前端看不到未展開的子孫，所以以下都要留：
 *   - 自己符合；
 *   - 已載入的子孫裡有符合者（祖先留著當脈絡，符合者才找得到路）；
 *   - 子代尚未載入（可能藏著符合者——藏起來，使用者就找不到展開入口了）。
 * 葉節點（含第三代）沒有子孫，不符就是確定沒有。
 */
function keepUnderFilter(
  node: NetworkNode,
  childrenMap: ChildrenMap,
  filter: NetworkNodeStatus,
): boolean {
  if (node.status === filter) return true;
  if (node.generation >= 3 || node.childCount === 0) return false;
  const kids = childrenMap[node.userId];
  if (kids === undefined || kids === 'loading') return true;
  return kids.some((k) => keepUnderFilter(k, childrenMap, filter));
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

// ---------- 頭像：底色＝訂閱狀態（單一圓形，沒有角落小點） ----------
// dimmed 只淡化頭像本身：整列套 opacity 會把狀態文字一起稀釋（見 RowAside）。
function Avatar({
  node,
  size = 36,
  dimmed = false,
}: {
  node: NetworkNode;
  size?: number;
  dimmed?: boolean;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold',
        STATUS[node.status].avatar,
        dimmed && 'opacity-55',
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initial(node.name)}
    </span>
  );
}

// ---------- 名字＋「新」tag ----------
// 名字 truncate、tag shrink-0：窄版（375px）空間不夠時由名字吸收，tag 不換行也不被擠掉。
function NameLine({ node, dimmed = false }: { node: NetworkNode; dimmed?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={cn('truncate font-medium', dimmed && 'opacity-55')}>{node.name}</span>
      {isNewMember(node.joinedAt) && (
        <span className="shrink-0 rounded-full bg-brand-subtle px-1.5 py-px text-[10.5px] font-semibold text-brand-subtle-foreground">
          新
        </span>
      )}
    </span>
  );
}

// ---------- 列右側：每個非訂閱中的狀態都有文字（色盲防線 §12.7），訂閱中顯示分支數 ----------
// 這段文字刻意不跟著列淡化：已失效淡到 55% 只剩 2.13:1、已停權 3.02:1，都過不了 4.5:1，
// 而它正是「完全分不出顏色時，狀態仍讀得懂」唯一的依靠。
function RowAside({ node }: { node: NetworkNode }) {
  if (node.status === 'expiring') {
    const d = nodeDaysLeft(node);
    return (
      <span className="shrink-0 text-xs font-semibold text-warning-subtle-foreground">
        {d != null ? `剩 ${d} 天到期` : '即將到期'}
      </span>
    );
  }
  if (node.status === 'expired') {
    return <span className="shrink-0 text-xs text-muted-foreground">已失效</span>;
  }
  if (node.status === 'suspended') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-destructive-subtle-foreground">
        <Ban className="h-3 w-3" aria-hidden />
        已停權
      </span>
    );
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
  childrenMap: ChildrenMap;
  expanded: Set<string>;
  onToggle: (node: NetworkNode) => void;
  selectedId: string | null;
  onSelect: (n: NetworkNode) => void;
  /** 狀態過濾（null＝不過濾）。只影響「顯示哪些列」，不動排序與展開狀態。 */
  filter: NodeStatusFilter;
}

function NodeRow({
  node,
  childrenMap,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  filter,
}: NodeRowProps) {
  const expandable = node.generation < 3 && node.childCount > 0;
  const isOpen = expanded.has(node.userId);
  const kids = childrenMap[node.userId];
  const groupId = `rtn-group-${node.userId}`;
  const inactive = listingHidden(node.status);
  const selected = selectedId === node.userId;

  return (
    <div>
      <div
        role="treeitem"
        tabIndex={0}
        aria-level={node.generation}
        aria-selected={selected}
        aria-expanded={expandable ? isOpen : undefined}
        aria-owns={expandable && isOpen ? groupId : undefined}
        aria-label={`${node.name} 詳情`}
        className={cn(
          'group flex items-center gap-2 rounded-lg py-2 pl-1 pr-2 cursor-pointer transition-colors hover:bg-muted/60',
          INTERACTIVE_ROW,
          rowTone(node.status, selected),
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

        <Avatar node={node} dimmed={inactive} />

        <span className="min-w-0 flex-1">
          <NameLine node={node} dimmed={inactive} />
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
            <ChildRows
              kids={kids}
              childrenMap={childrenMap}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
              filter={filter}
            />
          )}
        </div>
      )}
    </div>
  );
}

// 已載入的子列；過濾時只留 keepUnderFilter 的，全被隱藏就明說（空框線會像壞掉）。
function ChildRows({
  kids,
  filter,
  ...rest
}: Omit<NodeRowProps, 'node'> & { kids: NetworkNode[] }) {
  const shown = filter ? kids.filter((k) => keepUnderFilter(k, rest.childrenMap, filter)) : kids;
  if (filter && shown.length === 0) {
    return <p className="py-2 pl-1 text-xs text-muted-foreground">沒有符合的下線</p>;
  }
  return (
    <>
      {shown.map((child) => (
        <NodeRow key={child.userId} node={child} filter={filter} {...rest} />
      ))}
    </>
  );
}

// ---------- 狀態 chip：四顆「狀態 N」，點選＝只顯示該狀態（再點取消），兼作圖例 ----------
// 計數由伺服器給全樹的數字（children 懶載入，前端算不出來）。選中態用 outline：
// 形狀線索（粗框）加 aria-pressed，不靠顏色；與 focus-visible 的 ring 並存、可分辨。
// 計數 0 的 chip 不能點（沒有東西可過濾）；選中的那顆除外，才取消得掉。
function StatusChips({
  counts,
  selected,
  onSelect,
}: {
  counts: StatusCounts;
  selected: NodeStatusFilter;
  onSelect: (status: NodeStatusFilter) => void;
}) {
  return (
    <fieldset
      aria-label="依訂閱狀態篩選"
      className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
    >
      {CHIP_ORDER.map((status) => {
        const s = STATUS[status];
        const on = selected === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={on}
            disabled={counts[status] === 0 && !on}
            onClick={() => onSelect(on ? null : status)}
            className={cn(
              'inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors pointer-coarse:min-h-[44px]',
              'focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              s.chip,
              on && 'outline-2 outline-offset-2 outline-brand',
            )}
          >
            <span aria-hidden className={cn('h-2 w-2 rounded-full', s.dot)} />
            {s.label} {counts[status]}
          </button>
        );
      })}
    </fieldset>
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
    <StatusCallout
      variant="warning"
      icon={AlertTriangle}
      title={`${attention.total} 位下線需要關注`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {attention.items.map((n) => (
            <button
              key={n.userId}
              type="button"
              onClick={() => onSelect(n)}
              className="flex items-center gap-2 rounded-full border border-warning-border bg-card px-2.5 py-1 text-xs transition-colors hover:bg-muted"
            >
              <span className={cn('h-2 w-2 rounded-full', STATUS[n.status].dot)} aria-hidden />
              <span className="font-medium">{n.name}</span>
              <span className="text-muted-foreground">· {reason(n)}</span>
            </button>
          ))}
          {overflow > 0 && <span className="text-xs">還有 {overflow} 位</span>}
        </div>
      }
    />
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
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', GEN_BADGE)}>
          {GEN_LABEL[node.generation]}
        </span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', s.pill)}>
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
              node.status === 'expiring' && 'text-warning-subtle-foreground',
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
  /** 背景重新請求中（切排序、focus revalidate）——清單仍是舊資料，需回饋 */
  isValidating?: boolean;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  // total = 全部命中數（不受分頁影響）；matches 是「目前已取回」的累積。
  // 兩者都要,使用者才知道還有多少沒看到——搜尋不得靜默截斷。
  | { status: 'done'; matches: NetworkSearchMatch[]; total: number; loadingMore: boolean }
  | { status: 'error' };

export function ReferralTreeView({
  overview,
  sort,
  onSortChange,
  loadChildren,
  searchNetwork,
  isValidating = false,
}: ReferralTreeViewProps) {
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = useState<ChildrenMap>({});
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const [statusFilter, setStatusFilter] = useState<NodeStatusFilter>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // 切排序：伺服器是排序權威，已展開的分支順序作廢 → 收合重來
  useEffect(() => {
    setExpanded(new Set());
    setChildrenMap({});
  }, [sort]);

  // 全樹的狀態計數由伺服器給。型別說必填、執行期不保證：部署前存進 sessionStorage 的
  // 舊快取、以及前端先於 Edge Function 上線的時差，都讀得到 undefined——此時不渲染 chip，
  // 且一律視為不過濾（沒有 chip 就沒有取消過濾的入口，不能讓使用者卡在過濾畫面）。
  const statusCounts = overview?.summary.statusCounts;
  const activeFilter = statusCounts ? statusFilter : null;

  // 選中的狀態計數歸零（例如背景重新驗證後最後一位也續約了）→ 自動解除，不卡在空畫面
  useEffect(() => {
    if (statusFilter && statusCounts?.[statusFilter] === 0) setStatusFilter(null);
  }, [statusFilter, statusCounts]);

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
        .then(({ matches, total }) => {
          if (!cancelled) setSearch({ status: 'done', matches, total, loadingMore: false });
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

  // 加載更多：offset = 已取回筆數，續接而非重打第一頁。
  // 失敗不清空已顯示的結果——只把 loadingMore 收掉，使用者可再按一次。
  const loadMoreMatches = useCallback(() => {
    if (search.status !== 'done' || search.loadingMore) return;
    const offset = search.matches.length;
    setSearch({ ...search, loadingMore: true });
    searchNetwork(query.trim(), offset)
      .then(({ matches, total }) => {
        setSearch((prev) =>
          prev.status === 'done'
            ? { status: 'done', matches: [...prev.matches, ...matches], total, loadingMore: false }
            : prev,
        );
      })
      .catch(() => {
        setSearch((prev) => (prev.status === 'done' ? { ...prev, loadingMore: false } : prev));
      });
  }, [search, searchNetwork, query]);

  const roots = overview?.roots ?? [];
  const visibleRoots = activeFilter
    ? roots.filter((n) => keepUnderFilter(n, childrenMap, activeFilter))
    : roots;
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
                className="absolute right-0 top-0 h-2 w-2 rounded-full bg-muted-foreground sm:hidden"
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

      {/* 狀態 chip（兼圖例）。放在搜尋列下方：搜尋中把它隱藏時，輸入框不會跟著位移。
          搜尋結果是伺服器端的扁平清單，不吃這個過濾，所以搜尋中不顯示（過濾狀態保留）。 */}
      {!searching && statusCounts && (
        <StatusChips counts={statusCounts} selected={activeFilter} onSelect={setStatusFilter} />
      )}
      {!searching && activeFilter && (
        <p className="text-xs text-muted-foreground">
          只列出已載入的「{STATUS[activeFilter].label}」下線，展開分支可看到更多
        </p>
      )}

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
                  rowTone(node.status, selected?.userId === node.userId),
                )}
              >
                <Avatar node={node} />
                <span className="min-w-0 flex-1">
                  <NameLine node={node} />
                  <span className="block text-xs text-muted-foreground">
                    {GEN_LABEL[node.generation]}
                  </span>
                </span>
                <RowAside node={node} />
              </div>
            ))}

            {/* 命中總數與續接——版位與文案照 RewardHistory 的既有慣例。
                沒有這一段，伺服器分頁就等於靜默截斷：使用者只看得到第一頁
                且毫不知情。 */}
            <div className="pt-2 text-center text-sm text-muted-foreground">
              已顯示 {Math.min(search.matches.length, search.total)} / {search.total} 筆記錄
            </div>
            {search.matches.length < search.total && (
              <div className="text-center">
                <Button
                  onClick={loadMoreMatches}
                  variant="outline"
                  size="sm"
                  disabled={search.loadingMore}
                >
                  {search.loadingMore ? '加載中...' : '加載更多'}
                </Button>
              </div>
            )}
          </div>
        ) : null
      ) : activeFilter && visibleRoots.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">沒有符合的下線</p>
      ) : (
        // 背景重新請求中：清單仍是舊排序的資料，降透明度 + aria-busy 讓
        // 「還沒重排完」看得見也聽得見。切排序時 setSort 走的是
        // isValidating 而非 loading（有資料就不整頁 spinner）。
        <div
          role="tree"
          aria-label="我的推薦網絡"
          aria-busy={isValidating || undefined}
          className={cn(
            'space-y-0.5 transition-opacity',
            isValidating && 'opacity-50 pointer-events-none',
          )}
        >
          {visibleRoots.map((node) => (
            <NodeRow
              key={node.userId}
              node={node}
              childrenMap={childrenMap}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selected?.userId ?? null}
              onSelect={onSelect}
              filter={activeFilter}
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
