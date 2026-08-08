import { Copy } from 'lucide-react';
import type { AdminWithdrawalRecord } from '@contract';
import { Button } from '../ui/button';

/**
 * 匯款作業要打進網銀的**五個欄位**（W1 的同屏契約）。
 *
 * 桌面與手機共用這一份 render（審查 R6）。兩邊的**容器排法**不同——桌面是
 * `md:grid-cols-5` 一排五欄，手機是卡片展開區裡的垂直堆疊——但**欄位本身
 * 是同一組事實**，所以只有 `className` 由呼叫端決定，欄位清單不外露。
 *
 * 為什麼一定要共用:各自手刻會長出兩份會各自演化的 JSX。日後加一個欄位、
 * 或改一個標籤，很容易只改到其中一份，而「手機少一欄」這種缺陷在桌面
 * 開發時看不見。這正是 `useMediaQuery.ts:7-9` 檔頭註解點名要避免的模式，
 * 也是 §7 風險表「雙套版面 = 兩份真相」那一列真正的防線——原本它只涵蓋
 * handler 與 record，現在把 markup 也納入。
 *
 * 保留桌面原本的 `<section aria-label>` ＋ `<div><p>` 結構，**不順手改成
 * `<dl>`**:既有測試查的是 `role="region"`（`<section>` 有可及名稱時才是
 * landmark），改結構等於改契約，那是另一件事、不該搭本次 RWD 的便車。
 * `ariaLabel` 做成選用——桌面給（維持既有 landmark），手機不給:每張卡片
 * 都掛一個同名 region 只會讓螢幕閱讀器的地標清單變成雜訊，卡片本身已有
 * `role="group"` 與會員姓名可辨識。
 */

interface WithdrawalFundingFieldsProps {
  record: AdminWithdrawalRecord;
  onCopyAccount: (account: string) => void;
  /** 容器排法由呼叫端決定:桌面一排五欄、手機垂直堆疊。 */
  className?: string;
  /** 給了才成為具名 landmark。桌面給，手機不給（見檔頭）。 */
  ariaLabel?: string;
  formatAmount: (n: number) => string;
}

export function WithdrawalFundingFields({
  record,
  onCopyAccount,
  className,
  ariaLabel,
  formatAmount,
}: WithdrawalFundingFieldsProps) {
  return (
    <section aria-label={ariaLabel} className={className}>
      <div>
        <p className="text-xs text-muted-foreground">戶名</p>
        <p className="font-medium break-words">{record.userName}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">身分證字號</p>
        <p className="font-mono break-all">{record.idNumber ?? '未設定'}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">銀行代號</p>
        <p className="font-mono">{record.bankCode ?? '未設定'}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">收款帳號</p>
        <div className="flex items-center gap-1">
          <span className="font-mono break-all">{record.bankAccount ?? '未設定'}</span>
          {record.bankAccount && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="複製收款帳號"
              onClick={() => onCopyAccount(record.bankAccount ?? '')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">匯款金額</p>
        <p className="text-xl font-bold">{formatAmount(record.amount)}</p>
      </div>
    </section>
  );
}
