import { useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { PAUSED_LOOK } from './adminBusy';
import type { RemittanceGate } from './remittanceGate';
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
 * **目前只有提領卡在用**（不是「三個列表共用」——會員卡與告警卡都沒有選單）。
 * 判準以 `ui-ux-guidelines.md` §11 為準，不在這裡另立一套:
 *
 * - 進選單的是**唯讀、罕用、無時效性**的動作。提領卡是「查看證件」與
 *   「查看歷史」，正好兩項——§11.2 要求選單放得下兩項以上才值得，只裝一項
 *   是把一次點擊變兩次而沒換到任何東西。
 * - **destructive 與時效性動作不進選單**:退件留在卡片上（它改的是一筆交易、
 *   客服接到電話當下就要能處理）。改「一個人的狀態」的動作（停權、授予權限）
 *   則連卡片都不該有，一律進詳情面板（§11.1）——那也是會員卡沒有選單的原因。
 */

export interface CardOverflowAction {
  label: string;
  /**
   * `trigger` 是 ⋯ 鈕：從選單開出的對話框沒有 Trigger，關閉時焦點要還給它，不是整張卡。
   */
  onSelect: (trigger: HTMLElement | null) => void;
  disabled?: boolean;
  destructive?: boolean;
  /**
   * 匯款類閘門（例：提領資料未確認時的查看證件）：暫停時 aria-disabled、選了不動作，但仍在
   * roving focus 裡——Radix 的 disabled 會讓鍵盤跳過它，報讀器使用者就聽不到停用的原因。
   * 停用外觀出現時項目內補一行短原因（`hint`）：觸控沒有游標可變，只變淡的話點了沒反應
   * 也看不出是壞了還是在等。
   */
  gate?: RemittanceGate;
}

interface CardOverflowMenuProps {
  /** 無障礙名稱要能分辨是哪一筆的選單——一個列表裡會有很多顆。 */
  label: string;
  actions: CardOverflowAction[];
}

export function CardOverflowMenu({ label, actions }: CardOverflowMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) => {
          const paused = a.gate?.paused ?? false;
          const look = paused && (a.gate?.look ?? false);
          return (
            <DropdownMenuItem
              key={a.label}
              onSelect={(event) => {
                if (paused) {
                  event.preventDefault();
                  return;
                }
                a.onSelect(triggerRef.current);
              }}
              disabled={a.disabled}
              aria-disabled={paused || undefined}
              aria-describedby={paused ? a.gate?.describedBy : undefined}
              data-paused={look ? 'true' : undefined}
              // §1 觸控 ≥44px。DropdownMenuItem 基底是 px-2 py-1.5（實測 32px），
              // 而 ⋯ trigger 本身已經是 44×44——入口 44、開出來 32 是說不通的。
              // 只補在這裡、**不動 ui/dropdown-menu.tsx 基底**:比照 R2 的
              // checkbox opt-in 先例，改基底會連帶把 Navbar 的六個選單項各加
              // 12px，那是範圍外的視覺變更。
              className={cn(
                'pointer-coarse:min-h-[44px]',
                PAUSED_LOOK,
                a.destructive &&
                  'text-destructive-subtle-foreground focus:text-destructive-subtle-foreground',
              )}
            >
              {a.label}
              {/* 名稱不變（報讀器走 aria-describedby），小字只給看得到的人。 */}
              {look && a.gate?.hint && (
                <span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">
                  {a.gate.hint}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
