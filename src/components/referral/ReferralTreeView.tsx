import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Users, ExternalLink, Ban } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { cn } from '../ui/utils';
import { formatTwDate } from '../../utils/twDate';
import type { ReferralNode, ReferralNodeStatus } from '../../hooks/useReferralData';

// ============================================================
// 推薦網絡：可展開的縮排大綱樹（取代按代數壓平的卡片牆）
// - 縮排 = 代數；左側箭頭收合分支（子節點懶渲染）
// - 狀態一律靠燈號；即將到期額外顯示「剩 N 天到期」
// - 點整列 → 底部 sheet 看詳情
// ============================================================

const GEN_LABEL: Record<number, string> = { 1: '一代', 2: '二代', 3: '三代' };

const GEN_RAIL: Record<number, string> = {
  1: 'border-l-green-500',
  2: 'border-l-purple-500',
  3: 'border-l-orange-500',
};

const GEN_BADGE: Record<number, string> = {
  1: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  2: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  3: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
};

const STATUS: Record<
  ReferralNodeStatus,
  { dot: string; label: string; badge: string }
> = {
  active:    { dot: 'bg-green-500', label: '訂閱中', badge: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' },
  expiring:  { dot: 'bg-amber-500', label: '即將到期', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  expired:   { dot: 'bg-gray-400', label: '已失效', badge: 'bg-muted text-muted-foreground' },
  suspended: { dot: 'bg-red-500', label: '已停權', badge: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
};

/** 失效 / 停權者的刊登已被 has_active_subscription 隱藏，不提供「查看刊登」連結。 */
const listingHidden = (s: ReferralNodeStatus) => s === 'expired' || s === 'suspended';

function initial(name: string): string {
  return name.trim().slice(0, 1) || '?';
}

interface NodeRowProps {
  node: ReferralNode;
  depth: number;
  onSelect: (node: ReferralNode) => void;
}

function NodeRow({ node, depth, onSelect }: NodeRowProps) {
  const [open, setOpen] = useState(false);
  const expandable = node.generation < 3 && node.childCount > 0;
  const s = STATUS[node.status];

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-lg border-l-[3px] py-2 pr-2 cursor-pointer transition-colors hover:bg-muted/60',
          GEN_RAIL[node.generation] ?? 'border-l-transparent',
          listingHidden(node.status) && 'opacity-55',
        )}
        style={{ paddingLeft: 8 + depth * 18 }}
        onClick={() => onSelect(node)}
      >
        {/* 展開箭頭（可展開才有） */}
        {expandable ? (
          <button
            type="button"
            aria-label={open ? '收合' : '展開'}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        {/* 大頭 + 狀態燈號 */}
        <span className="relative shrink-0">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initial(node.name)}
          </span>
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
              s.dot,
            )}
            aria-hidden
          />
        </span>

        {/* 姓名 */}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{node.name}</span>
        </span>

        {/* 右側：僅即將到期顯示倒數 */}
        {node.status === 'expiring' && node.daysToExpiry != null && (
          <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400">
            剩 {node.daysToExpiry} 天到期
          </span>
        )}
      </div>

      {/* 子節點（展開才渲染） */}
      {expandable && open && (
        <div>
          {node.children.map((child) => (
            <NodeRow key={child.userId} node={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeDetailSheet({
  node,
  onOpenChange,
}: {
  node: ReferralNode | null;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  if (!node) return null;
  const s = STATUS[node.status];
  const hidden = listingHidden(node.status);

  return (
    <Sheet open={!!node} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85%] gap-0 rounded-t-2xl sm:max-w-lg"
      >
        <SheetHeader className="pb-2">
          <div className="flex items-center gap-3 pr-8">
            <span className="relative shrink-0">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                {initial(node.name)}
              </span>
              <span className={cn('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card', s.dot)} aria-hidden />
            </span>
            <SheetTitle className="text-lg">{node.name}</SheetTitle>
          </div>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-6">
          {/* 徽章列 */}
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

          {/* 欄位 */}
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

          {/* 查看刊登：失效/停權者刊登已下架，不提供連結 */}
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
      </SheetContent>
    </Sheet>
  );
}

export function ReferralTreeView({ roots }: { roots: ReferralNode[] }) {
  const [selected, setSelected] = useState<ReferralNode | null>(null);

  if (roots.length === 0) {
    return (
      <div className="rounded-lg border py-8 text-center">
        <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">尚未有推薦人</p>
        <p className="mt-2 text-sm text-muted-foreground">分享您的推薦碼給好友吧！</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0.5">
        {roots.map((node) => (
          <NodeRow key={node.userId} node={node} depth={0} onSelect={setSelected} />
        ))}
      </div>
      <NodeDetailSheet node={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
