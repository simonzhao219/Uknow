import { cn } from '../ui/utils';

// 世代色（ui-ux-guidelines §12.3／§12.5 (c) 核准的唯一例外）：一代 teal、二代 violet、
// 三代 pink。chip 的底與字色都隨世代（一個共用 foreground token 配不了三個色相）；
// token 存在與對比度由 globals.test.ts 驗，元件有沒有用對（-1/-2/-3 對應世代 1/2/3）由
// GenerationChip.test.tsx 驗。世代色只表示「第幾代」，不表示任何狀態，也不得擴散到
// 與「代」無關的地方。
const LABEL: Record<number, string> = { 1: '一代', 2: '二代', 3: '三代' };

const CHIP: Record<number, string> = {
  1: 'bg-[var(--tree-gen-badge-1)] text-[var(--tree-gen-badge-foreground-1)]',
  2: 'bg-[var(--tree-gen-badge-2)] text-[var(--tree-gen-badge-foreground-2)]',
  3: 'bg-[var(--tree-gen-badge-3)] text-[var(--tree-gen-badge-foreground-3)]',
};

const DOT: Record<number, string> = {
  1: 'bg-[var(--tree-gen-avatar-1)]',
  2: 'bg-[var(--tree-gen-avatar-2)]',
  3: 'bg-[var(--tree-gen-avatar-3)]',
};

/** 產品 UI 的「代」一律寫「一代／二代／三代」（§12.13）；超出三代的資料退回「第 N 代」。 */
export function generationLabel(generation: number): string {
  return LABEL[generation] ?? `第 ${generation} 代`;
}

/** 世代 chip：推薦詳情、獎勵明細等提到「代」的地方共用（會員中心卡片不放世代）。 */
export function GenerationChip({
  generation,
  className,
}: {
  generation: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        CHIP[generation] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {generationLabel(generation)}
    </span>
  );
}

/** 世代小圓點：列內的次要標記，世代文字由旁邊的文字承擔，所以不進可及樹。 */
export function GenerationDot({
  generation,
  className,
}: {
  generation: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        DOT[generation] ?? 'bg-muted-foreground',
        className,
      )}
    />
  );
}
