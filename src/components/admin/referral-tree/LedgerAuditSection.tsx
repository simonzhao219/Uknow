// 點數來源明細與跨表核對（第 6 波 S3b 階段 11，規劃 §2.3）。查帳 Sheet 的最後一個區塊：
// 帳本逐列（分類、金額、異動後餘額，推薦獎勵帶第幾代與付款人，提領帶提領單狀態），
// 頂部列出四條跨表核對的不符原因；延遲補沖只寫資訊。三態與付款區相同、彼此不連坐。
import type { AdminReferralLedgerFindingKind } from '@admin-referral-contract';
import { AlertTriangle } from 'lucide-react';
import { useId } from 'react';
import { formatTwTimestamp } from '../../../utils/twDate';
import { REWARD_SOURCE_LABELS } from '../../../utils/rewardHistoryFilter';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { StatusCallout } from '../../ui/status-callout';
import type { LedgerData } from './loaders';
import { displayName } from './referralAudit';

const FINDING_TEXT: Record<Exclude<AdminReferralLedgerFindingKind, 'reset_delayed'>, string> = {
  withdrawal_debit: '提領單的帳本扣款不是恰好一筆，或金額不符',
  refund_missing: '退件的提領沒有恰好一筆正確金額的退款',
  refund_unexpected: '未退件的提領卻有退款',
  orphan_debit: '有帳本扣款對不上這位會員的提領單',
  reset_amount: '新約清空的金額與清空前的餘額不符',
};

const WITHDRAWAL_STATUS_TEXT: Record<string, string> = {
  pending: '審核中',
  awaiting_collection: '已匯款待查收',
  completed: '已匯款',
  rejected: '已退件',
};

// 帳本金額一律帶正負號；負號用 U+2212，與「−1,015 P」的排版一致。
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n).toLocaleString()} P`;
const balance = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()} P`;

const categoryLabel = (cat: string, type: string) =>
  (REWARD_SOURCE_LABELS as Record<string, string>)[cat] ?? type;

export interface LedgerState {
  status: 'loading' | 'error' | 'ready';
  items: LedgerData['items'];
  total: number;
  findings: LedgerData['findings'];
  loadMoreError: boolean;
  loadingMore?: boolean;
}

function LedgerRow({ row }: { row: LedgerData['items'][number] }) {
  const isReward = row.type === 'referral_reward';
  const withdrawalLine =
    row.withdrawalId !== null
      ? `提領單：${WITHDRAWAL_STATUS_TEXT[row.withdrawalStatus ?? ''] ?? row.withdrawalStatus ?? '找不到'}`
      : row.type === 'withdrawal'
        ? '提領單：找不到'
        : null;
  return (
    <li className="space-y-0.5 py-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{categoryLabel(row.sourceCategory, row.type)}</span>
        <span>{signed(row.amount)}</span>
        <span className="text-muted-foreground">餘額 {balance(row.balanceAfter)}</span>
        {row.finding && row.finding !== 'reset_delayed' ? (
          <Badge variant="warning-subtle">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            核對不符
          </Badge>
        ) : null}
      </p>
      <p className="text-xs text-muted-foreground">{formatTwTimestamp(row.at)}</p>
      {isReward ? (
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {`第 ${row.generation ?? '—'} 代 · ${displayName(row.refereeName ?? '')}${
            row.eventAt ? ` · 付款 ${formatTwTimestamp(row.eventAt)}` : ''
          }`}
        </p>
      ) : null}
      {withdrawalLine ? <p className="text-xs text-muted-foreground">{withdrawalLine}</p> : null}
    </li>
  );
}

export function LedgerSection({
  ledger,
  onRetry,
  onMore,
}: {
  ledger: LedgerState;
  onRetry: () => void;
  onMore: () => void;
}) {
  const id = useId();
  const mismatches = ledger.findings.filter((f) => !f.info);
  const counts = new Map<keyof typeof FINDING_TEXT, number>();
  for (const f of mismatches) {
    const k = f.kind as keyof typeof FINDING_TEXT;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const hasDelayed = ledger.findings.some((f) => f.kind === 'reset_delayed');

  return (
    <section aria-labelledby={id} className="py-4">
      <h3
        id={id}
        tabIndex={-1}
        data-section="ledger"
        className="text-sm font-semibold outline-none"
      >
        點數來源
      </h3>
      <div className="mt-2 text-sm">
        {ledger.status === 'loading' ? (
          <output aria-label="點數來源載入中" aria-busy="true" className="block space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </output>
        ) : ledger.status === 'error' ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">點數來源讀取失敗</p>
            <Button tone="secondary" size="sm" onClick={onRetry}>
              重試
            </Button>
          </div>
        ) : (
          <>
            {counts.size > 0 ? (
              <div className="mb-2">
                <StatusCallout
                  variant="warning"
                  title="點數跨表核對不符"
                  description={
                    <>
                      <ul className="list-disc pl-5">
                        {[...counts].map(([k, n]) => (
                          <li key={k}>
                            {n > 1 ? `${FINDING_TEXT[k]}（${n} 筆）` : FINDING_TEXT[k]}
                          </li>
                        ))}
                      </ul>
                      {counts.has('reset_amount') ? (
                        <p className="mt-1">
                          清空當下若有別筆交易同時寫入，金額可能差一筆；請先對照該時段的帳本再判斷。
                        </p>
                      ) : null}
                    </>
                  }
                />
              </div>
            ) : null}
            {hasDelayed ? (
              <p className="mb-2 text-xs text-muted-foreground">
                有一筆延遲補沖的清空，金額以告警快照為準
              </p>
            ) : null}
            {ledger.items.length === 0 ? (
              <p className="text-muted-foreground">帳本沒有紀錄</p>
            ) : (
              <>
                <ul className="divide-y">
                  {ledger.items.map((row) => (
                    <LedgerRow key={row.id} row={row} />
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
                  <span>
                    已顯示 {ledger.items.length} / {ledger.total} 筆
                  </span>
                  {ledger.items.length < ledger.total ? (
                    <Button
                      tone="secondary"
                      size="sm"
                      disabled={ledger.loadingMore}
                      onClick={onMore}
                    >
                      {ledger.loadMoreError ? '載入失敗，重試載入更多' : '載入更多'}
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
