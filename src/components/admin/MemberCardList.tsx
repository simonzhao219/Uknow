import type { AdminMember } from '@contract';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

/**
 * 會員管理的**手機版**列表：一位會員一張卡。
 *
 * **卡上只有一顆操作鍵（查看）。** 停權／恢復與管理員授予／撤銷都在詳情
 * 面板裡，走同一個 `MemberAction` 路徑（同一種確認框、同一處錯誤顯示）
 * ——依 `ui-ux-guidelines.md` §11.1：改「一個人的狀態」的動作一律移進詳情
 * 面板，且同類動作必須用同一套邏輯與設計。桌面表格也同步只剩「查看」。
 *
 * 抽成子元件與 `WithdrawalCardList` 同理（審查 F10），但風險等級不同：
 * `MemberManagement` 的操作鍵本來就是顯式 `<Button>`、不依賴 `<tr>` 結構，
 * 所以沒有審查 F1 那種「排版變更悄悄拿掉一個互動」的隱性耦合——它正是 F1
 * 的對照組。這裡要守的是**資訊量**：`plan.md` §4.1 明列的欄位一項都不能少。
 */

interface MemberCardListProps {
  members: AdminMember[];
  accountBadge: (status: string) => { label: string; className: string };
  onOpenDetail: (id: string) => void;
  processingId: string | null;
}

export function MemberCardList({
  members,
  accountBadge,
  onOpenDetail,
  processingId,
}: MemberCardListProps) {
  return (
    <div className="space-y-3">
      {members.map((member) => {
        const acct = accountBadge(member.accountStatus);
        return (
          <Card
            key={member.id}
            role="group"
            aria-label={`${member.name ?? member.email} 的會員資料`}
          >
            <CardContent className="space-y-2 p-3">
              {/* 收合態一眼要回答的：是誰、有沒有異常。**正常狀態不顯示 badge**
                  ——「一般會員」「正常」是預設值，佔了位置卻沒有資訊量，
                  六個 badge 擠在一起反而讓真正需要注意的那個消失在噪音裡。
                  會籍與刊登數留著（會籍決定他能不能用、刊登數是他的活躍度）。 */}
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium break-words">{member.name ?? '—'}</p>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {member.isAdmin && <Badge variant="default">管理員</Badge>}
                  {member.suspended && <Badge variant="destructive">已暫停</Badge>}
                </div>
              </div>

              {/* Email 單行截斷而不是換行：長度無上限，換行會讓卡片高度隨資料
                  變動（實測長 Email 讓卡片從 130px 變 154px）。列表的工作是
                  「找到那個人」，截斷仍然認得出來，完整值在詳情 Sheet 裡一點就有。
                  電話與 Email 併成一行，不多佔一列——收合態預算只剩 12px。
                  搜尋框 placeholder 寫的是「搜尋姓名 / Email / 電話」，admin 用
                  來電號碼搜到人之後，得看得到命中的是哪個號碼才能確認是同一人，
                  而手機是唯一能一鍵撥號的裝置。
                  ⚠️ `truncate` 當 flex item 時 `min-width:auto` 會讓它不縮反溢，
                  `min-w-0` 不可省。 */}
              <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{member.email}</span>
                {member.phone && <span className="shrink-0 font-mono">{member.phone}</span>}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`${acct.className} border`}>
                    {acct.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">刊登 {member.listingCount}</span>
                </div>
                {/* **卡上只有「查看」一顆**（ui-ux-guidelines §11.1）:
                    停權改的是**一個人的狀態**，不是一筆資料——這類動作一律
                    移進詳情面板，做之前本來就該先看清楚他是誰。
                    先前這裡留著停權，理由是「時效性」（援引提領台的
                    「退件與代為完成不鎖」）。**那個先例不轉移**:提領台改的是
                    一筆交易，會員管理改的是一個人；分類不同，先例就不適用。
                    §11.1 已明文廢止該理由，桌面表格也同步只剩「查看」。 */}
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    aria-label={`查看 ${member.name ?? member.email} 的詳情`}
                    onClick={() => onOpenDetail(member.id)}
                  >
                    查看
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
