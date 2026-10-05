import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { StatusCallout } from '../ui/status-callout';

export interface AttentionItem {
  key: string;
  to: string;
  label: string;
}

/**
 * 「需要注意」區（ui-ux-guidelines §13 第 3 條）：集中放在頁面最上面，warning
 * 淺底框，每條帶一個可點的動作。沒有事就整塊不渲染——空的提醒框只會訓練使用者
 * 忽略它。連結用墨色加底線（對 warning-subtle 淺 17.46／深 12.06，globals.test.ts 驗證）。
 */
export function AttentionCallout({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <StatusCallout
      variant="warning"
      title="需要注意"
      titleAs="h2"
      action={
        <ul className="md:space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 md:min-h-0"
              >
                {item.label}
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      }
    />
  );
}
