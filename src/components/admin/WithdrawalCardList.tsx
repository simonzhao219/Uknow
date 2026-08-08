import { Copy } from 'lucide-react';
import type { AdminWithdrawalRecord } from '@contract';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

/**
 * 提領管理的**手機版**列表：一筆一張卡。
 *
 * 抽成子元件而不是塞回 WithdrawalManagement（849 行、已是全 admin 最重的
 * 容器）:再疊一整套卡片渲染會讓它身兼「業務邏輯 ＋ 兩套完整 UI」（審查 F10）。
 * props 只收 record 與既有 handler，型別因此強制「手機與桌面共用同一組
 * handler、同一個 record 物件」——欄位差異不會靠複製貼上各自演化。
 *
 * **就地展開，不另立作業面板**（審查 F1）:桌面的作業面板釘在列表上方，靠的是
 * `activeId`，而它唯一的寫入點是 `<TableRow onClick>`。表格在手機被拿掉後
 * 那個寫入路徑就消失了，面板會永遠停在 `withdrawals[0]`。這裡把五欄收進
 * 卡片自己的展開區，`setActiveId` 寫在 trigger 上——同屏契約在手機重新成立
 * （375px 單欄下，把面板留在頁首等於點完要捲回去才看得到結果）。
 *
 * **用 Collapsible 的顯式 trigger，不做整卡可點**（審查 R5）:trigger 是真的
 * `<button>`，語意與鍵盤可達性自帶。桌面 `<TableRow onClick>` 沒有鍵盤語意
 * 是既有 a11y 債，不是把同一個反模式複製進新檔案的理由。同目錄的
 * `IdReviewQueue` 也一律用顯式 `<Button>`，全 admin 沒有整卡可點的先例。
 */

interface WithdrawalCardListProps {
  records: AdminWithdrawalRecord[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onCopyAccount: (account: string) => void;
  onOpenIdCard: (record: AdminWithdrawalRecord) => void;
  onOpenHistory: (record: AdminWithdrawalRecord) => void;
  onReject: (record: AdminWithdrawalRecord) => void;
  onComplete: (record: AdminWithdrawalRecord) => void;
  processingId: string | null;
  statusBadge: (status: string) => React.ReactNode;
  formatAmount: (n: number) => string;
}

export function WithdrawalCardList({
  records,
  activeId,
  onActivate,
  onCopyAccount,
  onOpenIdCard,
  onOpenHistory,
  onReject,
  onComplete,
  processingId,
  statusBadge,
  formatAmount,
}: WithdrawalCardListProps) {
  return (
    <div className="space-y-3">
      {records.map((w) => (
        <Card key={w.id} role="group" aria-label={`${w.userName} 的提領記錄`}>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{w.userName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(w.requestedAt).toLocaleDateString('zh-TW')}
                </p>
              </div>
              {statusBadge(w.status)}
            </div>

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground">匯款金額</span>
              <span className="text-xl font-bold">{formatAmount(w.amount)}</span>
              <span className="text-xs text-muted-foreground">扣點 {w.amount + w.fee} P</span>
            </div>

            {/* W1 的同屏契約在手機版由「就地展開」承接:展開的是這一筆，
                不需要捲回頁首去看另一個區塊。 */}
            <Collapsible open={activeId === w.id} onOpenChange={() => onActivate(w.id)}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  匯款資訊
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <dl className="mt-3 space-y-2 rounded-md border p-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">戶名</dt>
                    <dd className="font-medium break-words">{w.userName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">身分證字號</dt>
                    <dd className="font-mono break-all">{w.idNumber ?? '未設定'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">銀行代號</dt>
                    <dd className="font-mono">{w.bankCode ?? '未設定'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">收款帳號</dt>
                    <dd className="flex items-center gap-1">
                      <span className="font-mono break-all">{w.bankAccount ?? '未設定'}</span>
                      {w.bankAccount && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="複製收款帳號"
                          onClick={() => onCopyAccount(w.bankAccount ?? '')}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">匯款金額</dt>
                    <dd className="text-xl font-bold">{formatAmount(w.amount)}</dd>
                  </div>
                </dl>
              </CollapsibleContent>
            </Collapsible>

            {/* P14:底部已被 BottomNav 佔用，操作鍵一律在卡片內。 */}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenIdCard(w)}>
                查看
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenHistory(w)}>
                查看歷史
              </Button>
              {/* W8:「標記已匯款」在手機不出現（Q1(a) 維持現況）——它需要同時
                  開著網銀。退件與代為完成不鎖:那是客服接到電話當下就該能處理
                  的事（WithdrawalManagement.tsx:167-168 的原始理由）。 */}
              {w.status === 'pending' && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onReject(w)}
                  disabled={processingId === w.id}
                >
                  退件
                </Button>
              )}
              {w.status === 'awaiting_collection' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onComplete(w)}
                  disabled={processingId === w.id}
                >
                  代為完成
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
