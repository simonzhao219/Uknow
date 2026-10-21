import { Crown, type LucideIcon, Sparkles, Sprout, Star } from 'lucide-react';
import { type MedalFill, medalFills } from '../../utils/kingProgress';
import { cn } from '../ui/utils';

// 任務中心的四顆徽章＝本輪進度（畫面稿，業主 2026-10-05；plan.md §4 第 13 點），取代進度條
// 與舊的等級小標籤。亮度由 medalFills 換算：奇數半亮（左半填色＋淡環）、偶數全亮，滿一輪
// 四顆全亮＝推薦王，下一輪歸零重點。徽章下只放名稱——不放人數、等級小標籤、鼓勵文案。
//
// 填色是 `--medal-gradient`（品牌色 300→600），ui-ux-guidelines §12.4 唯一核准的漸層，
// 本檔登記在 scripts/check-color-usage.py 的 APPROVED_GRADIENT_FILES；別處不得引用。
//
// 亮度同時寫成文字（sr-only），不只靠顏色與填充（WCAG 1.4.1）。

const MEDALS: { name: string; Icon: LucideIcon }[] = [
  { name: '見習推薦', Icon: Sprout },
  { name: '推薦新星', Icon: Star },
  { name: '推薦達人', Icon: Sparkles },
  { name: '推薦王', Icon: Crown },
];

const FILL_TEXT: Record<MedalFill, string> = { 0: '未點亮', 0.5: '亮一半', 1: '已點亮' };

/** 亮的徽章的填色 class。測試從這裡匯入，不在測試檔重寫 token 名（守門腳本只放行登記過的檔）。 */
export const MEDAL_GRADIENT_CLASS = 'bg-[image:var(--medal-gradient)]';

const FACE: Record<MedalFill, string> = {
  0: 'border-border text-muted-foreground',
  0.5: `border-brand-border text-brand-subtle-foreground ring-[3px] ring-brand-faint ${MEDAL_GRADIENT_CLASS} bg-[length:50%_100%]`,
  1: `border-brand text-brand-foreground ${MEDAL_GRADIENT_CLASS} bg-[length:100%_100%]`,
};

export function TaskMedals({
  roundCount,
  target,
  className,
}: {
  /** 本輪人數（computeKingRounds 的 currentRoundCount），不是當月原始累計。 */
  roundCount: number;
  /** reward_config 的推薦王門檻；四顆各涵蓋 target/4 人。 */
  target: number;
  className?: string;
}) {
  const fills = medalFills(roundCount, target);
  return (
    <ol
      aria-label={`本輪進度 ${roundCount} / ${target}`}
      className={cn('grid grid-cols-4 gap-1', className)}
    >
      {MEDALS.map(({ name, Icon }, i) => {
        const fill = fills[i];
        return (
          <li key={name} data-fill={fill} className="flex flex-col items-center gap-1.5">
            <span
              data-testid="medal-face"
              className={cn(
                'grid size-10 place-items-center rounded-full border-2 bg-card bg-no-repeat',
                FACE[fill],
              )}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span
              data-testid="medal-name"
              className={cn(
                'text-center text-[11px] leading-tight',
                fill === 1 ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {name}
            </span>
            <span className="sr-only">{FILL_TEXT[fill]}</span>
          </li>
        );
      })}
    </ol>
  );
}
