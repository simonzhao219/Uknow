import { type ElementType, forwardRef, type ReactNode } from 'react';
import { Button } from '../ui/button';
import { StatusCallout } from '../ui/status-callout';
import { cn } from '../ui/utils';

export interface LoadErrorCalloutProps {
  title: ReactNode;
  description?: ReactNode;
  /** 只重發那支請求，不整頁重載（ui-ux-guidelines §6）。 */
  onRetry: () => void;
  retryLabel?: string;
  /** 標題要渲染的標籤，預設 `p`；原本是真標題的取代處要傳對應層級。 */
  titleAs?: ElementType;
  className?: string;
}

/**
 * 整頁主內容讀取失敗的共用黃框（ui-ux-guidelines §12.11）：暫時讀不到＝「錯誤但可重試」，
 * 併入 warning；重試是唯一出路，流程鈕取容器色，提示框內靠右、文字寬。
 *
 * ref 指到外層 `tabIndex=-1` 的 div，是重試後的焦點落點（StatusCallout 是函式元件，
 * 不轉發 ref）。搭配 `useRetryFocus`：重試落地仍失敗時焦點回到這裡。
 *
 * 範圍是「整頁主內容」。儀表板卡片內的單一區塊（例：我的訂閱卡）維持 §13 第 4 條的
 * 中性字，不用這個元件。
 */
export const LoadErrorCallout = forwardRef<HTMLDivElement, LoadErrorCalloutProps>(
  function LoadErrorCallout(
    { title, description, onRetry, retryLabel = '重新載入', titleAs, className },
    ref,
  ) {
    return (
      <div ref={ref} tabIndex={-1} className={cn('scroll-mt-20 outline-none', className)}>
        <StatusCallout
          variant="warning"
          titleAs={titleAs}
          title={title}
          description={description}
          action={
            <div className="flex justify-end">
              <Button container="warning" onClick={onRetry}>
                {retryLabel}
              </Button>
            </div>
          }
        />
      </div>
    );
  },
);
