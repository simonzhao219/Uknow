// 付款與三代獎金（第 6 波 S3a 階段 8）。Sheet 內一律卡片（Sheet 最寬 512px，表格會塞爆）：
// 一筆付款一張卡，每一代兩到三行——「第 N 代 · 結果徽章」、「應給 A」或「A · 金額」，
// 收獎人不符或無法判定且有實發時再加「實發 B · 金額」（規劃 §4）。
import type { AdminReferralGeneration, AdminReferralPaymentItem } from '@admin-referral-contract';
import { formatTwTimestamp } from '../../../utils/twDate';
import { AlertTriangle, CheckCircle2, CircleHelp, MinusCircle } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { displayName, resultLabel } from './referralAudit';

const points = (n: number) => `${n.toLocaleString()} P`;

const TONE_VARIANT = {
  neutral: 'outline',
  muted: 'secondary',
  warning: 'warning-subtle',
} as const;

// 徽章帶圖示：結果不只靠顏色辨識（UI 準則：狀態一律圖示＋文字）。
const RESULT_ICON = {
  paid: CheckCircle2,
  missing: AlertTriangle,
  recipient_mismatch: AlertTriangle,
  undeterminable: CircleHelp,
  not_applicable: MinusCircle,
  cycle_stopped: MinusCircle,
} as const;

function GenerationRow({ g }: { g: AdminReferralGeneration }) {
  const label = resultLabel(g.result, g.reason);
  const ResultIcon = RESULT_ICON[g.result];
  const expected = g.expectedName !== null ? displayName(g.expectedName) : null;
  const actual =
    g.actualId !== null
      ? `${displayName(g.actualName ?? '')}${g.actualAmount !== null ? ` · ${points(g.actualAmount)}` : ''}`
      : null;
  const showsExpectedOnly = g.result === 'missing' || g.result === 'recipient_mismatch';
  const showsActualLine =
    actual !== null && (g.result === 'recipient_mismatch' || g.result === 'undeterminable');
  return (
    <li className="space-y-0.5 py-1.5">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span>第 {g.generation} 代</span>
        <Badge variant={TONE_VARIANT[label.tone]}>
          <ResultIcon aria-hidden="true" className="size-3.5" />
          {label.text}
        </Badge>
      </p>
      {g.result === 'paid' && actual ? (
        <p className="text-sm text-muted-foreground wrap-anywhere">{actual}</p>
      ) : null}
      {(showsExpectedOnly || g.result === 'undeterminable') && expected ? (
        <p className="text-sm text-muted-foreground wrap-anywhere">應給 {expected}</p>
      ) : null}
      {showsActualLine ? (
        <p className="text-sm text-muted-foreground wrap-anywhere">實發 {actual}</p>
      ) : null}
    </li>
  );
}

export function PaymentCard({ item }: { item: AdminReferralPaymentItem }) {
  const kind = item.kind === 'payment' ? '付款' : '任務續約';
  const at = item.at ? formatTwTimestamp(item.at) : '時間不明';
  const flagged = item.generations.some(
    (g) => g.result === 'missing' || g.result === 'recipient_mismatch',
  );
  return (
    <li aria-label={`${kind} ${at}`} className="rounded-lg border p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span>{kind}</span>
        <span className="text-muted-foreground">{at}</span>
        {flagged ? (
          <Badge variant="warning-subtle">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            需要核對
          </Badge>
        ) : null}
      </p>
      <ul className="divide-y">
        {item.generations.map((g) => (
          <GenerationRow key={g.generation} g={g} />
        ))}
      </ul>
    </li>
  );
}
