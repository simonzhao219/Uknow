import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { LegalMarkdown } from './LegalMarkdown';

interface LegalDialogProps {
  /** 觸發用的連結文字，例如「服務條款」。 */
  triggerLabel: string;
  /** 彈窗標題。 */
  title: string;
  /** 要顯示的 Markdown 內容。 */
  content: string;
  triggerClassName?: string;
  /** 測試用 data-testid，掛在觸發按鈕上。 */
  triggerTestId?: string;
}

/**
 * 把法遵文件（服務條款等）以「就地彈窗」呈現，而不是導向到另一個路由。
 *
 * 為什麼不用 <Link>：在表單（例如註冊完善資料頁）裡放一條會換頁的 <Link>，
 * 點下去會卸載整個表單、清空使用者填到一半的 useState —— 這正是先前修的
 * 資料遺失 bug。改用彈窗後，表單始終掛載在底下，讀完關掉即可繼續，
 * 不換頁、不開新分頁，於 LINE 等內建瀏覽器（會擋 target=_blank）也一致可用。
 *
 * 觸發元件刻意用 <button>（而非 <a>），避免巢狀在 <label> 裡的連結在行動裝置
 * 上誤觸表單其他行為；並 stopPropagation，點條款不會連帶勾到旁邊的同意勾選框。
 *
 * 捲動採全站慣用的「同一元素上 max-h + overflow-y-auto」寫法（見 RewardHistory、
 * JoinReferralProgramDialog 等），而非 flex 子項 + Radix ScrollArea —— 後者受
 * flexbox `min-height:auto` 影響，長內文會撐破彈窗且不捲動（本次修的 bug）。
 * 標題列固定在上方、只有內文區塊捲動，關閉鈕（DialogContent 的絕對定位 X）
 * 因此永遠可點，不會被捲走。
 */
export function LegalDialog({
  triggerLabel,
  title,
  content,
  triggerClassName = 'text-primary underline',
  triggerTestId,
}: LegalDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          data-testid={triggerTestId}
          onClick={(e) => e.stopPropagation()}
        >
          {triggerLabel}
        </button>
      </DialogTrigger>
      {/* 只在 sm 以上才放寬到 max-w-2xl；手機刻意「不覆寫」寬度，保留
          DialogContent 預設的 w-full max-w-[calc(100%-2rem)] —— 那條規則替
          彈窗左右各留 1rem(16px)邊距，讓卡片輪廓浮出、不貼齊螢幕邊緣。
          先前直接寫 max-w-2xl 會把這條預設 gutter 蓋掉，手機上就全幅貼邊。 */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* 內文自己的 max-h + overflow-y-auto：標題不動、內文獨立捲動。
            max-h 用 dvh（動態視窗高度），行動瀏覽器網址列縮放時不會誤算高度；
            標題列 + 這塊 ≤ 約 85dvh，整個彈窗穩穩落在螢幕內、不被底部導覽列蓋住。 */}
        <div
          className="max-h-[70dvh] overflow-y-auto pr-2 -mr-2"
          data-testid="legal-dialog-body"
        >
          <LegalMarkdown content={content} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
