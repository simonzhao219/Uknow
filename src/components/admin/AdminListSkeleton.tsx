import { Skeleton } from '../ui/skeleton';

/**
 * 後台四頁共用的列表骨架。
 *
 * - 外層是 `<output>`（隱含 role="status"；biome 的 useSemanticElements 不接受
 *   `div role="status"`）＋名稱＋`aria-busy`。e2e 與 journey 的 page object 以這個名稱
 *   等列表載入完成，所以名稱由頁面傳入、沿用各頁既有的字。
 * - 內部只用 div：用了 table／row 角色，page object 會把骨架當成載入完成的表格。
 * - `message`（慢更新提示）放在 `<output>` 之外：busy 的 live region 暫不播報新增的文字。
 */
export interface AdminListSkeletonProps {
  label: string;
  /** 手機內容是卡片就用卡片形，桌機表格用列形。 */
  variant: 'rows' | 'cards';
  count?: number;
  message?: string;
}

const BLOCK_KEYS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

export function AdminListSkeleton({ label, variant, count = 3, message }: AdminListSkeletonProps) {
  const block = variant === 'cards' ? 'h-24 w-full rounded-lg' : 'h-10 w-full';
  return (
    <div className="py-4">
      <output
        aria-label={label}
        aria-busy="true"
        data-variant={variant}
        className="block space-y-3"
      >
        {BLOCK_KEYS.slice(0, count).map((key) => (
          <Skeleton key={key} className={block} />
        ))}
      </output>
      {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
