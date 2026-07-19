import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
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
 * 點下去會卸載整個表單、清空使用者填到一半的 useState —— 這正是本次要修的
 * 資料遺失 bug。改用彈窗後，表單始終掛載在底下，讀完條款關掉即可繼續，
 * 不換頁、不開新分頁，於 LINE 等內建瀏覽器（會擋 target=_blank）也一致可用。
 *
 * 觸發元件刻意用 <button>（而非 <a>），避免巢狀在 <label> 裡的連結在行動裝置
 * 上誤觸表單其他行為；並 stopPropagation，點條款不會連帶勾到旁邊的同意勾選框。
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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <LegalMarkdown content={content} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
