// 後台推薦樹（第 6 波 S3a 階段 7）：搜尋框＋頂層樹＋逐層展開（W6-7），「先找到一個人」。
//
// 結構（規劃 §4）：巢狀 <ul>／<li> 加 disclosure 鈕，不用 role="tree"——TalkBack 對 tree 支援弱，
// 「載入更多」「重試」與 pinned 也都不是 tree 的合法子項。每列兩顆並列的按鈕：展開鈕
// （directCount>0 才有，aria-expanded）與名稱鈕（開詳情）。
//
// 每一層（頂層、某人的子層、「無法接上推薦樹的會員」群組）各自分頁、各自三態，失敗不連坐。
// 自動展開：依 ancestorIds 由頂層往下逐層請求、每層帶 ensureId；新操作作廢舊的展開鏈。
// pinned 的計數規則在 referralAudit.ts（不計入 X、不影響 offset、不重複渲染）。
import type { AdminReferralNode, AdminReferralSearchMatch } from '@admin-referral-contract';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadErrorCallout } from '../../common/LoadErrorCallout';
import { useRetryFocus } from '../../../hooks/useRetryFocus';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { AdminListSkeleton } from '../AdminListSkeleton';
import type { NodesParams, ReferralTreeLoaders } from './loaders';
import {
  appendPage,
  displayName,
  emptyLayer,
  type ExpandStep,
  expansionPath,
  type LayerState,
  layerLabel,
  nodeAnomalyBadges,
  rowsToRender,
  shownCount,
  unplaceableReasonText,
} from './referralAudit';

const PAGE_SIZE = 50;
const TOP = '__top__';
const UNPLACEABLE = '__unplaceable__';
const SEARCH_DEBOUNCE_MS = 300;
const INDENT_PX = 12;
const MAX_INDENT_DEPTH = 4;

const STATUS_TEXT: Record<AdminReferralNode['status'], string> = {
  active: '訂閱中',
  expiring: '即將到期',
  expired: '已失效',
  suspended: '已停權',
};

type LayerStatus = 'loading' | 'error' | 'ready';
interface Layer {
  state: LayerState;
  status: LayerStatus;
  loadingMore: boolean;
  loadMoreError: boolean;
}

export interface AdminReferralTreeProps {
  loaders: ReferralTreeLoaders;
  onOpenNode: (id: string) => void;
  /** 從會員詳情「在推薦樹中查看」帶來的目標；處理完呼叫 onFocusConsumed。 */
  focusId?: string | null;
  onFocusConsumed?: () => void;
  searchDebounceMs?: number;
}

function paramsFor(key: string, ensureId: string | null, offset: number): NodesParams {
  const base = { ensureId, limit: PAGE_SIZE, offset };
  if (key === TOP) return base;
  if (key === UNPLACEABLE) return { ...base, group: 'unplaceable' };
  return { ...base, parentId: key };
}

function keyOf(step: ExpandStep): string {
  if (step.kind === 'top') return TOP;
  if (step.kind === 'unplaceable') return UNPLACEABLE;
  return step.parentId;
}

function endDateText(endDate: string | null): string | null {
  if (!endDate) return null;
  return new Date(endDate).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}

function NodeSummary({ node }: { node: AdminReferralNode }) {
  const badges = nodeAnomalyBadges(node.anomalyKinds);
  const end = endDateText(node.endDate);
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground wrap-anywhere">
      <span>{layerLabel(node.layer)}</span>
      <Badge variant="outline">{STATUS_TEXT[node.status]}</Badge>
      {node.status === 'expiring' && node.daysToExpiry !== null ? (
        <span>剩 {node.daysToExpiry} 天</span>
      ) : null}
      {end ? <span>{end} 到期</span> : null}
      <span>直接推薦 {node.directCount} 位</span>
      {badges.map((b) => (
        <Badge key={b} variant="warning-subtle">
          {b}
        </Badge>
      ))}
      {node.anomalyScanTruncated ? <span>只檢查最近 50 筆</span> : null}
    </p>
  );
}

export function AdminReferralTree({
  loaders,
  onOpenNode,
  focusId = null,
  onFocusConsumed,
  searchDebounceMs = SEARCH_DEBOUNCE_MS,
}: AdminReferralTreeProps) {
  const [layers, setLayers] = useState<Record<string, Layer>>({});
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [unplaceableCount, setUnplaceableCount] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [expandError, setExpandError] = useState<{ key: string; resume: () => void } | null>(null);
  const expandToken = useRef(0);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  // ---- 每一層的載入 ----------------------------------------------------
  const setLayer = useCallback((key: string, patch: (prev: Layer | undefined) => Layer) => {
    setLayers((prev) => ({ ...prev, [key]: patch(prev[key]) }));
  }, []);

  const loadLayer = useCallback(
    async (key: string, ensureId: string | null = null): Promise<Layer | null> => {
      setLayer(key, (prev) => ({
        state: prev?.state ?? emptyLayer(),
        status: prev?.state.items.length ? 'ready' : 'loading',
        loadingMore: false,
        loadMoreError: false,
      }));
      try {
        const page = await loaders.loadNodes(paramsFor(key, ensureId, 0));
        if (key === TOP && page.unplaceableCount !== undefined) {
          setUnplaceableCount(page.unplaceableCount);
        }
        const next: Layer = {
          state: appendPage(emptyLayer(), page),
          status: 'ready',
          loadingMore: false,
          loadMoreError: false,
        };
        setLayer(key, () => next);
        return next;
      } catch {
        setLayer(key, (prev) => ({
          state: prev?.state ?? emptyLayer(),
          status: 'error',
          loadingMore: false,
          loadMoreError: false,
        }));
        return null;
      }
    },
    [loaders, setLayer],
  );

  const loadMore = useCallback(
    async (key: string) => {
      const current = layersRef.current[key];
      if (!current || current.loadingMore) return;
      setLayer(key, (prev) => ({ ...(prev as Layer), loadingMore: true, loadMoreError: false }));
      try {
        const page = await loaders.loadNodes(paramsFor(key, null, shownCount(current.state)));
        setLayer(key, (prev) => ({
          ...(prev as Layer),
          state: appendPage((prev as Layer).state, { ...page, pinned: null }),
          loadingMore: false,
        }));
      } catch {
        setLayer(key, (prev) => ({ ...(prev as Layer), loadingMore: false, loadMoreError: true }));
      }
    },
    [loaders, setLayer],
  );

  const topRetry = useRetryFocus({
    loading: layers[TOP]?.status === 'loading',
    failed: layers[TOP]?.status === 'error',
  });

  useEffect(() => {
    void loadLayer(TOP);
  }, [loadLayer]);

  const toggle = useCallback(
    (key: string) => {
      expandToken.current += 1;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      if (!layersRef.current[key]) void loadLayer(key);
    },
    [loadLayer],
  );

  // ---- 自動展開 ----------------------------------------------------------
  const runExpansion = useCallback(
    async (steps: ExpandStep[], targetId: string, targetName: string, from = 0) => {
      const token = ++expandToken.current;
      setExpandError(null);
      setAnnounce(`正在展開到${targetName}…`);
      for (let i = from; i < steps.length; i++) {
        const step = steps[i];
        const key = keyOf(step);
        if (key !== TOP) setExpanded((prev) => new Set(prev).add(key));
        const existing = layersRef.current[key];
        const present =
          existing?.status === 'ready' &&
          rowsToRender(existing.state).some((r) => r.node.id === step.ensureId);
        if (!present) {
          const result = await loadLayer(key, step.ensureId);
          if (token !== expandToken.current) return;
          if (!result) {
            setAnnounce('');
            setExpandError({
              key,
              resume: () => void runExpansion(steps, targetId, targetName, i),
            });
            return;
          }
        }
      }
      if (token !== expandToken.current) return;
      setAnnounce(`已展開到${targetName}`);
      setPendingFocus(targetId);
    },
    [loadLayer],
  );

  useEffect(() => {
    if (!pendingFocus) return;
    const el = document.querySelector<HTMLElement>(`[data-node-name="${pendingFocus}"]`);
    if (el) {
      el.scrollIntoView?.({ block: 'nearest' });
      el.focus();
      setPendingFocus(null);
    }
  });

  // ---- 搜尋 --------------------------------------------------------------
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    q: string;
    status: LayerStatus;
    total: number;
    matches: AdminReferralSearchMatch[];
    loadMoreError: boolean;
  } | null>(null);
  const latestQuery = useRef('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), searchDebounceMs);
    return () => clearTimeout(t);
  }, [input, searchDebounceMs]);

  const runSearch = useCallback(
    async (q: string, offset: number) => {
      latestQuery.current = q;
      if (offset === 0)
        setResults({ q, status: 'loading', total: 0, matches: [], loadMoreError: false });
      try {
        const data = await loaders.search({ q, limit: PAGE_SIZE, offset });
        if (latestQuery.current !== q) return;
        setResults((prev) => ({
          q,
          status: 'ready',
          total: data.total,
          matches: offset === 0 ? data.matches : [...(prev?.matches ?? []), ...data.matches],
          loadMoreError: false,
        }));
      } catch {
        if (latestQuery.current !== q) return;
        setResults((prev) =>
          offset === 0 || !prev
            ? { q, status: 'error', total: 0, matches: [], loadMoreError: false }
            : { ...prev, loadMoreError: true },
        );
      }
    },
    [loaders],
  );

  useEffect(() => {
    if (!query) {
      latestQuery.current = '';
      setResults(null);
      return;
    }
    void runSearch(query, 0);
  }, [query, runSearch]);

  const clearSearch = () => {
    setInput('');
    setQuery('');
  };

  const expandToMatch = (m: AdminReferralSearchMatch) => {
    const steps = expansionPath(m.id, m.ancestorIds, m.unplaceableReason);
    if (!steps) {
      onOpenNode(m.id);
      return;
    }
    clearSearch();
    void runExpansion(steps, m.id, displayName(m.name));
  };

  // 從會員詳情跳來：先查詳情取得往上鏈，再走同一條展開路徑。
  useEffect(() => {
    if (!focusId) return;
    let cancelled = false;
    void (async () => {
      try {
        const audit = await loaders.loadMember(focusId);
        if (cancelled) return;
        const ancestorIds =
          audit.uplineStatus === 'root' ? audit.upline.map((u) => u.id).reverse() : null;
        const reason = audit.uplineStatus === 'root' ? null : audit.uplineStatus;
        const steps = expansionPath(focusId, ancestorIds, reason);
        if (steps) void runExpansion(steps, focusId, displayName(audit.node.name));
        else onOpenNode(focusId);
      } catch {
        if (!cancelled) setAnnounce('無法展開到這位會員，請改用搜尋');
      } finally {
        if (!cancelled) onFocusConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusId, loaders, onFocusConsumed, onOpenNode, runExpansion]);

  // ---- 呈現 --------------------------------------------------------------
  function renderLayer(key: string, depth: number) {
    const layer = layers[key];
    if (!layer || layer.status === 'loading') {
      return <AdminListSkeleton label="推薦樹載入中" variant="rows" count={2} />;
    }
    if (layer.status === 'error') {
      const retryExpand = expandError?.key === key ? expandError.resume : null;
      return (
        <div className="space-y-2 py-2">
          <p tabIndex={-1} className="text-sm text-muted-foreground outline-none">
            讀取失敗，請稍後再試
          </p>
          <Button
            tone="secondary"
            size="sm"
            onClick={() => (retryExpand ? retryExpand() : void loadLayer(key))}
          >
            {retryExpand ? '重試展開' : '重試'}
          </Button>
        </div>
      );
    }
    const rows = rowsToRender(layer.state);
    if (rows.length === 0) {
      return (
        <p className="py-2 text-sm text-muted-foreground">
          {key === TOP ? '目前沒有符合條件的會員' : '目前沒有可顯示的推薦對象'}
        </p>
      );
    }
    const shown = shownCount(layer.state);
    return (
      <>
        <ul className="space-y-1">
          {rows.map(({ node, pinned }) => {
            const isOpen = expanded.has(node.id);
            const name = displayName(node.name);
            return (
              <li
                key={node.id}
                style={{ paddingInlineStart: Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX }}
              >
                <div className="flex min-w-0 items-start gap-1">
                  {node.directCount > 0 ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? '收合' : '展開'}${name}`}
                      onClick={() => toggle(node.id)}
                      className="flex shrink-0 items-center justify-center rounded-md p-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    >
                      {isOpen ? (
                        <ChevronDown className="size-4" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4" aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span className="w-6 shrink-0 pointer-coarse:w-11" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      data-node-name={node.id}
                      tabIndex={0}
                      aria-label={`查看${name}的推薦與查帳資訊`}
                      onClick={() => onOpenNode(node.id)}
                      className="scroll-mt-20 text-left font-medium wrap-anywhere pointer-coarse:min-h-11"
                    >
                      <span>{name}</span>
                      {node.referralCode ? <span> · {node.referralCode}</span> : null}
                    </button>
                    {pinned ? (
                      <Badge variant="secondary" className="ml-2">
                        搜尋目標
                      </Badge>
                    ) : null}
                    <NodeSummary node={node} />
                  </div>
                </div>
                {isOpen ? <div className="mt-1">{renderLayer(node.id, depth + 1)}</div> : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-2 py-2 text-sm text-muted-foreground">
          <span>
            已顯示 {shown} / {layer.state.total} 位
          </span>
          {shown < layer.state.total ? (
            <Button
              tone="secondary"
              size="sm"
              disabled={layer.loadingMore}
              onClick={() => void loadMore(key)}
            >
              {layer.loadMoreError ? '載入失敗，重試載入更多' : '載入更多'}
            </Button>
          ) : null}
        </div>
      </>
    );
  }

  function renderSearch() {
    if (!results || results.status === 'loading') {
      return <AdminListSkeleton label="搜尋中" variant="rows" count={2} />;
    }
    if (results.status === 'error') {
      return (
        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground">搜尋失敗，請稍後再試</p>
          <Button tone="secondary" size="sm" onClick={() => void runSearch(results.q, 0)}>
            重試
          </Button>
        </div>
      );
    }
    if (results.matches.length === 0) {
      return <p className="py-2 text-sm text-muted-foreground">找不到符合的會員</p>;
    }
    return (
      <>
        <ul className="space-y-2">
          {results.matches.map((m) => {
            const name = displayName(m.name);
            return (
              <li key={m.id} className="min-w-0">
                <button
                  type="button"
                  aria-label={`查看${name}的推薦與查帳資訊`}
                  onClick={() => onOpenNode(m.id)}
                  className="text-left font-medium wrap-anywhere pointer-coarse:min-h-11"
                >
                  <span>{name}</span>
                  {m.referralCode ? <span> · {m.referralCode}</span> : null}
                </button>
                <p className="flex min-w-0 flex-wrap gap-x-2 text-sm text-muted-foreground">
                  <span>
                    {m.ancestorIds === null && m.unplaceableReason === 'truncated'
                      ? unplaceableReasonText('truncated')
                      : layerLabel(m.layer)}
                  </span>
                  <Badge variant="outline">{STATUS_TEXT[m.status]}</Badge>
                </p>
                {m.ancestorIds !== null || m.unplaceableReason === 'cycle' ? (
                  <Button tone="secondary" size="sm" onClick={() => expandToMatch(m)}>
                    在樹上展開到{name}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-2 py-2 text-sm text-muted-foreground">
          <span>
            已顯示 {results.matches.length} / {results.total} 筆
          </span>
          {results.matches.length < results.total ? (
            <Button
              tone="secondary"
              size="sm"
              onClick={() => void runSearch(results.q, results.matches.length)}
            >
              {results.loadMoreError ? '載入失敗，重試載入更多' : '載入更多'}
            </Button>
          ) : null}
        </div>
      </>
    );
  }

  const top = layers[TOP];
  const unplaceableOpen = expanded.has(UNPLACEABLE);

  return (
    <section aria-labelledby="referral-tree-heading" className="space-y-3">
      <h2
        id="referral-tree-heading"
        ref={topRetry.headingRef}
        tabIndex={-1}
        className="text-base font-semibold outline-none"
      >
        推薦樹
      </h2>
      <search className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="搜尋姓名或推薦碼"
          placeholder="搜尋姓名或推薦碼"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="pl-9 pr-11"
        />
        {input ? (
          <button
            type="button"
            aria-label="清除搜尋"
            onClick={clearSearch}
            className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-2 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </search>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {announce}
      </p>

      {query ? (
        renderSearch()
      ) : top?.status === 'error' && !top.state.items.length ? (
        <LoadErrorCallout
          ref={topRetry.errorRef}
          title="推薦樹讀取失敗"
          description="可能是網路暫時不穩，請稍後再試。"
          onRetry={() => topRetry.retry(() => loadLayer(TOP))}
        />
      ) : (
        <>
          {renderLayer(TOP, 0)}
          {unplaceableCount > 0 ? (
            <div className="border-t pt-2">
              <button
                type="button"
                aria-expanded={unplaceableOpen}
                onClick={() => toggle(UNPLACEABLE)}
                className="flex items-center gap-1 text-sm font-medium pointer-coarse:min-h-11"
              >
                {unplaceableOpen ? (
                  <ChevronDown className="size-4" aria-hidden />
                ) : (
                  <ChevronRight className="size-4" aria-hidden />
                )}
                無法接上推薦樹的會員（{unplaceableCount}）
              </button>
              {unplaceableOpen ? renderLayer(UNPLACEABLE, 0) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
