// 推薦樹節點詳情（第 6 波 S3a 階段 8）。由上到下（規劃 §4）：頁首 → 需要注意（有才渲染）→
// 帳號狀態說明 → 推薦人鏈 → 獎金與點數 → 任務 → 提領 → 換線紀錄 → 付款與三代獎金。
//
// 兩支請求（查帳詳情、付款查帳）各自三態，互不連坐。Sheet 內跳到另一人是「替換內容＋返回」：
// 堆疊存在元件 state，返回時沿用已載入的資料不重讀；Android 返回鍵（useOverlayBackClose）
// 先退堆疊、空了才關；Esc 與右上 X 一律整個關閉。
// portal 內容自己帶 privateClass（/admin 的 PrivateRegion 涵蓋不到 portal）。
import type { AdminReferralMemberAudit } from '@admin-referral-contract';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useOverlayBackClose } from '../../../hooks/useOverlayBackClose';
import { privateClass } from '../../../utils/analytics/privacy';
import { formatTwDate, formatTwTimestamp } from '../../../utils/twDate';
import { LoadErrorCallout } from '../../common/LoadErrorCallout';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../ui/sheet';
import { Skeleton } from '../../ui/skeleton';
import { StatusCallout } from '../../ui/status-callout';
import type { PaymentsData, ReferralTreeLoaders } from './loaders';
import { PaymentCard } from './PaymentAuditList';
import { anomalyLabel, displayName, uplineLabel, withdrawalBlockReason } from './referralAudit';

const PAYMENT_PAGE = 20;
const SHEET_CLASS = 'w-full gap-0 sm:max-w-lg';
const points = (n: number) => `${n.toLocaleString()} P`;

const STATUS_TEXT = {
  active: '訂閱中',
  expiring: '即將到期',
  expired: '已失效',
  suspended: '已停權',
} as const;

type Load<T> =
  | { status: 'loading' }
  | { status: 'error'; notFound: boolean }
  | { status: 'ready'; data: T };

interface PaymentsState {
  status: 'loading' | 'error' | 'ready';
  items: PaymentsData['items'];
  total: number;
  loadMoreError: boolean;
}

interface Entry {
  audit: Load<AdminReferralMemberAudit>;
  payments: PaymentsState;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="py-4">
      <h3 id={id} tabIndex={-1} className="text-sm font-semibold outline-none">
        {title}
      </h3>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

const isNotFound = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { status?: number }).status === 404;

export interface ReferralAuditSheetProps {
  loaders: ReferralTreeLoaders;
  userId: string;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function ReferralAuditSheet({
  loaders,
  userId,
  onClose,
  onCloseAutoFocus,
}: ReferralAuditSheetProps) {
  const [stack, setStack] = useState<string[]>([userId]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const current = stack[stack.length - 1];
  const entry = entries[current];
  // SheetTitle 不轉發 ref：比照 MemberDetailSheet，以 data-slot 找標題。
  const focusTitle = useCallback(() => {
    document.querySelector<HTMLElement>('[role="dialog"] [data-slot="sheet-title"]')?.focus();
  }, []);
  const scrollRef = useRef<HTMLElement>(null);
  const [announce, setAnnounce] = useState('');

  const patch = useCallback((id: string, fn: (prev: Entry | undefined) => Entry) => {
    setEntries((prev) => ({ ...prev, [id]: fn(prev[id]) }));
  }, []);

  const loadAudit = useCallback(
    async (id: string) => {
      patch(id, (prev) => ({
        audit: { status: 'loading' },
        payments: prev?.payments ?? {
          status: 'loading',
          items: [],
          total: 0,
          loadMoreError: false,
        },
      }));
      try {
        const data = await loaders.loadMember(id);
        patch(id, (prev) => ({ ...(prev as Entry), audit: { status: 'ready', data } }));
      } catch (err) {
        patch(id, (prev) => ({
          ...(prev as Entry),
          audit: { status: 'error', notFound: isNotFound(err) },
        }));
      }
    },
    [loaders, patch],
  );

  const loadPayments = useCallback(
    async (id: string, offset: number) => {
      if (offset === 0) {
        patch(id, (prev) => ({
          audit: prev?.audit ?? { status: 'loading' },
          payments: { status: 'loading', items: [], total: 0, loadMoreError: false },
        }));
      }
      try {
        const data = await loaders.loadPayments(id, { limit: PAYMENT_PAGE, offset });
        patch(id, (prev) => {
          const base = prev as Entry;
          return {
            ...base,
            payments: {
              status: 'ready',
              items: offset === 0 ? data.items : [...base.payments.items, ...data.items],
              total: data.total,
              loadMoreError: false,
            },
          };
        });
      } catch {
        patch(id, (prev) => {
          const base = prev as Entry;
          return {
            ...base,
            payments:
              offset === 0
                ? { status: 'error', items: [], total: 0, loadMoreError: false }
                : { ...base.payments, loadMoreError: true },
          };
        });
      }
    },
    [loaders, patch],
  );

  // 每一位只載一次：返回堆疊上的前一位時沿用已載入的資料。
  useEffect(() => {
    if (entries[current]) return;
    void loadAudit(current);
    void loadPayments(current, 0);
  }, [current, entries, loadAudit, loadPayments]);

  const goTo = (id: string) => {
    setStack((s) => [...s, id]);
    scrollRef.current?.scrollTo?.({ top: 0 });
  };
  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, []);

  // Android 返回鍵：堆疊不空先退一位，空了才關閉。
  const stackRef = useRef(stack);
  stackRef.current = stack;
  useOverlayBackClose(true, () => {
    if (stackRef.current.length > 1) goBack();
    else onClose();
  });

  const audit = entry?.audit.status === 'ready' ? entry.audit.data : null;
  const name = audit ? displayName(audit.node.name) : '';
  const previous = stack.length > 1 ? entries[stack[stack.length - 2]] : undefined;
  const previousName =
    previous?.audit.status === 'ready' ? displayName(previous.audit.data.node.name) : '上一位';

  // 換人後焦點落在標題並播報。
  const lastShown = useRef<string | null>(null);
  useEffect(() => {
    if (!audit || lastShown.current === current) return;
    if (lastShown.current !== null) {
      focusTitle();
      setAnnounce(`已切換到${name}`);
    }
    lastShown.current = current;
  }, [audit, current, name, focusTitle]);

  const contentProps = {
    'aria-describedby': undefined,
    onOpenAutoFocus: (e: Event) => {
      e.preventDefault();
      focusTitle();
    },
    onCloseAutoFocus,
  };

  return (
    <Sheet open onOpenChange={() => onClose()}>
      {/* SENSITIVE_PORTALS 的 anchor 行必須同時含遮蔽 class，其餘屬性收進 contentProps。 */}
      <SheetContent className={privateClass(SHEET_CLASS)} {...contentProps}>
        <SheetHeader className="gap-1.5 border-b pr-16">
          {stack.length > 1 ? (
            <Button tone="secondary" size="sm" className="w-fit" onClick={goBack}>
              返回{previousName}
            </Button>
          ) : null}
          <SheetTitle tabIndex={-1} className="text-lg outline-none wrap-anywhere">
            {audit ? name : '會員推薦與查帳資訊'}
          </SheetTitle>
          <SheetDescription className="sr-only">推薦關係、獎金與付款查帳</SheetDescription>
          {audit ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {audit.node.referralCode ? (
                <span className="font-mono">{audit.node.referralCode}</span>
              ) : null}
              <Badge variant="outline">{STATUS_TEXT[audit.node.status]}</Badge>
              {audit.node.endDate ? <span>{formatTwDate(audit.node.endDate)} 到期</span> : null}
            </p>
          ) : null}
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>
        </SheetHeader>

        <section
          ref={scrollRef}
          aria-label="查帳內容"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: 可捲動區要能用鍵盤捲（WCAG 2.1.1）
          tabIndex={0}
          className="min-h-0 flex-1 divide-y overflow-y-auto px-4 pb-6 outline-none"
        >
          {!entry || entry.audit.status === 'loading' ? (
            <output aria-label="查帳資訊載入中" aria-busy="true" className="block space-y-3 py-4">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </output>
          ) : entry.audit.status === 'error' ? (
            entry.audit.notFound ? (
              <p className="py-4 text-sm text-muted-foreground">找不到此會員（可能已刪除）</p>
            ) : (
              <div className="py-4">
                <LoadErrorCallout
                  title="查帳資訊讀取失敗"
                  description="可能是網路暫時不穩，請稍後再試。"
                  onRetry={() => {
                    void loadAudit(current);
                    focusTitle();
                  }}
                />
              </div>
            )
          ) : audit ? (
            <AuditBody
              audit={audit}
              payments={entry.payments}
              onOpenPerson={goTo}
              onRetryPayments={() => void loadPayments(current, 0)}
              onMorePayments={() => void loadPayments(current, entry.payments.items.length)}
            />
          ) : null}
        </section>
      </SheetContent>
    </Sheet>
  );
}

function AuditBody({
  audit,
  payments,
  onOpenPerson,
  onRetryPayments,
  onMorePayments,
}: {
  audit: AdminReferralMemberAudit;
  payments: PaymentsState;
  onOpenPerson: (id: string) => void;
  onRetryPayments: () => void;
  onMorePayments: () => void;
}) {
  const block = withdrawalBlockReason(audit.node);
  const attention: string[] = [];
  if (audit.paymentSummary.missingCount > 0) {
    attention.push(`獎金缺漏 ${audit.paymentSummary.missingCount} 筆`);
  }
  if (audit.paymentSummary.mismatchCount > 0) {
    attention.push(`收獎人不符 ${audit.paymentSummary.mismatchCount} 筆`);
  }
  for (const kind of audit.anomalies) {
    if (kind === 'cycle' || kind === 'self_referral') attention.push(anomalyLabel(kind));
  }
  const g = audit.rewards.byGeneration;
  const hasMissing = payments.items.some((i) => i.generations.some((x) => x.result === 'missing'));

  return (
    <>
      {attention.length > 0 ? (
        <div className="py-4">
          <StatusCallout
            variant="warning"
            title="需要注意"
            description={
              <ul className="list-disc pl-5">
                {attention.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            }
          />
        </div>
      ) : null}

      {block ? <p className="py-3 text-sm text-muted-foreground">{block}</p> : null}

      <Section title="推薦人鏈">
        {audit.upline.length === 0 ? (
          <p className="text-muted-foreground">沒有推薦人</p>
        ) : (
          <ol className="space-y-1">
            {audit.upline.map((u, i) => (
              <li key={u.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="shrink-0 text-muted-foreground">{uplineLabel(i)}</span>
                <Button
                  variant="link"
                  className="h-auto p-0 wrap-anywhere"
                  aria-label={`查看${displayName(u.name)}`}
                  onClick={() => onOpenPerson(u.id)}
                >
                  {displayName(u.name)}
                </Button>
                {u.referralCode ? <span className="font-mono">{u.referralCode}</span> : null}
              </li>
            ))}
          </ol>
        )}
        {audit.uplineStatus === 'truncated' ? (
          <p className="mt-1 text-muted-foreground">往上超過 50 位，未全部列出</p>
        ) : null}
        {audit.uplineStatus === 'cycle' ? (
          <p className="mt-1 text-muted-foreground">往上的推薦關係成環，只列到重複之前</p>
        ) : null}
        {audit.referrerMismatch ? (
          <p className="mt-1 text-muted-foreground">
            發獎的第 1 代依會員資料，樹依推薦關係，兩者目前不一致
          </p>
        ) : null}
      </Section>

      <Section title="獎金與點數">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">可提領</span>
          <span className="text-lg font-semibold">{points(audit.rewards.available)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          第 1 代 {points(g.g1)} · 第 2 代 {points(g.g2)} · 第 3 代 {points(g.g3)}
        </p>
        <p className="text-xs text-muted-foreground">
          累計已發 {points(audit.rewards.totalEarned)}
        </p>
      </Section>

      <Section title="任務">
        <p>
          本月 {audit.tasks.monthlyCount} / {audit.tasks.threshold ?? '—'} 位
        </p>
        <p className="text-xs text-muted-foreground">
          免費續約 未領 {audit.tasks.creditsUnclaimed} 張 · 已領 {audit.tasks.creditsClaimed} 張
        </p>
      </Section>

      <Section title="提領">
        <p>審核中 {points(audit.withdrawals.pendingAmount)}</p>
        <p className="text-xs text-muted-foreground">
          已匯款{' '}
          {points(audit.withdrawals.awaitingCollectionAmount + audit.withdrawals.completedAmount)}
          （含待查收 {points(audit.withdrawals.awaitingCollectionAmount)}）
        </p>
      </Section>

      <Section title="換線紀錄">
        <p className="text-xs text-muted-foreground">
          換線前後的完整順序在現有資料中無法重建，只列出可確認的部分。
        </p>
        <p className="mt-2 text-muted-foreground">曾有過的推薦人</p>
        {audit.referrerHistory.pastReferrers.length === 0 ? (
          <p>—</p>
        ) : (
          <ul className="flex flex-wrap gap-x-3">
            {audit.referrerHistory.pastReferrers.map((p) => (
              <li key={p.id}>{displayName(p.name)}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-muted-foreground">新約付款時指定的推薦人</p>
        {audit.referrerHistory.freshEvents.length === 0 ? (
          <p>—</p>
        ) : (
          <ul className="space-y-1">
            {audit.referrerHistory.freshEvents.map((e) => (
              <li key={`${e.completedAt}-${e.newReferrerId}`} className="wrap-anywhere">
                {formatTwTimestamp(e.completedAt)} 換到 {displayName(e.newReferrerName ?? '')}（
                {e.effective === 'confirmed' ? '已生效' : '現有資料無法確認是否生效'}）
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="付款與三代獎金">
        {payments.status === 'loading' ? (
          <output aria-label="付款紀錄載入中" aria-busy="true" className="block space-y-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </output>
        ) : payments.status === 'error' ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">付款紀錄讀取失敗</p>
            <Button tone="secondary" size="sm" onClick={onRetryPayments}>
              重試
            </Button>
          </div>
        ) : payments.items.length === 0 ? (
          <p className="text-muted-foreground">這位會員沒有付款紀錄</p>
        ) : (
          <>
            {hasMissing ? (
              <p className="mb-2 text-xs text-muted-foreground">
                缺漏會在該會員下次登入載入時自動補發；持續存在請回報。
              </p>
            ) : null}
            <ul className="space-y-2">
              {payments.items.map((item) => (
                <PaymentCard key={item.eventId} item={item} />
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
              <span>
                已顯示 {payments.items.length} / {payments.total} 筆
              </span>
              {payments.items.length < payments.total ? (
                <Button tone="secondary" size="sm" onClick={onMorePayments}>
                  {payments.loadMoreError ? '載入失敗，重試載入更多' : '載入更多'}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Section>
    </>
  );
}
