import { MoreHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

/**
 * 手機卡片的「更多」選單。
 *
 * 為什麼需要它:攤平所有動作的代價是**掃視成本**。實測未收合前，提領卡
 * 254px 高、4 顆可見按鈕，會員卡 216px、3 顆——375×812 的第一屏扣掉頁首、
 * 分頁、統計與工具列只剩約 470px，**連兩筆都放不下**，而且每往下一筆都要
 * 重新讀一次同樣的按鈕列。列表頁的工作是「找到那一筆」，不是「對每一筆
 * 都做決定」，所以次要動作應該要求一次額外點擊。
 *
 * 判準（寫在這裡是因為它會被三個列表共用）:**留在卡片上的只有「這個列表
 * 存在的理由」那一個動作**——提領是「看匯款資訊」（admin 要照著打進網銀）、
 * 會員是「查看詳情」。其餘進選單。
 *
 * destructive 動作（退件、停權）**放在選單裡而不是卡片上**:掃視時最先被
 * 點到的不該是最危險的那顆。真正的防線仍是既有的 AlertDialog 確認框——
 * 收進選單只是不讓它搶視線，不是拿它當安全機制。
 */

export interface CardOverflowAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface CardOverflowMenuProps {
  /** 無障礙名稱要能分辨是哪一筆的選單——一個列表裡會有很多顆。 */
  label: string;
  actions: CardOverflowAction[];
}

export function CardOverflowMenu({ label, actions }: CardOverflowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.label}
            onSelect={a.onSelect}
            disabled={a.disabled}
            className={a.destructive ? 'text-destructive focus:text-destructive' : undefined}
          >
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
