import type { AdminMember } from '@contract';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

/**
 * 會員管理的**手機版**列表：一位會員一張卡。
 *
 * **只有兩顆操作鍵**（查看、暫停·恢復）。「設為／撤銷管理員」不在這裡——
 * 它已在 PR #258 移出列表、改放進詳情 Sheet 的「權限」區，理由是動作位階:
 * 罕用、破壞力最高、而且**在資料層面不可逆**（授予的當下他就讀得到全站
 * 身分證與收款帳號，撤回權限撤不回已經看過的東西）。見 `ui-ux-guidelines.md`
 * §11 與 plan.md §4.1 的前提變更註記。
 *
 * 抽成子元件與 `WithdrawalCardList` 同理（審查 F10），但風險等級不同:
 * MemberManagement 的三顆操作鍵本來就是顯式 `<Button>`、不依賴 `<tr>` 結構，
 * 所以沒有審查 F1 那種「排版變更悄悄拿掉一個互動」的隱性耦合——它正是 F1
 * 的對照組。這裡要守的是**資訊量**:`ui-ux-guidelines.md` §7 明文禁止手機
 * 卡片退化成「只剩照片＋名字」，所以桌面表格的八欄關鍵資訊一欄都不能少。
 */

interface MemberCardListProps {
  members: AdminMember[];
  accountBadge: (status: string) => { label: string; className: string };
  onOpenDetail: (id: string) => void;
  onToggleSuspend: (member: AdminMember) => void;
  processingId: string | null;
}

export function MemberCardList({
  members,
  accountBadge,
  onOpenDetail,
  onToggleSuspend,
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
              {/* 收合態一眼要回答的:是誰、有沒有異常。**正常狀態不顯示 badge**
                  ——「一般會員」「正常」是預設值，佔了位置卻沒有資訊量，
                  六個 badge 擠在一起反而讓真正需要注意的那個消失在噪音裡。
                  會籍與刊登數留著（會籍決定他能不能用、刊登數是他的活躍度），
                  電話收進詳情。 */}
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium break-words">{member.name ?? '—'}</p>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {member.isAdmin && <Badge variant="default">管理員</Badge>}
                  {member.suspended && <Badge variant="destructive">已暫停</Badge>}
                </div>
              </div>

              {/* 單行截斷而不是換行:Email 長度無上限，換行會讓卡片高度隨資料
                  變動（實測長 Email 讓卡片從 130px 變 154px）。列表的工作是
                  「找到那個人」，截斷仍然認得出來，完整值在詳情 Sheet 裡一點就有
                  ——換來的是固定的卡高與可預測的掃視節奏。 */}
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>

              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`${acct.className} border`}>
                    {acct.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">刊登 {member.listingCount}</span>
                </div>
                {/* 卡片上唯一留下的動作:查看詳情——這個列表存在的理由就是
                    「找到那個人」。設為管理員／停權都是低頻且危險的，進選單。 */}
                {/* 兩顆鍵，**不用溢出選單**（ui-ux-guidelines §11 規則 3）:
                    「設為管理員」已移出列表、改在詳情 Sheet 的權限區
                    （罕用＋破壞力最高、且在資料層面不可逆），剩下的選單只裝
                    一項——那是把一次點擊變兩次而沒換到任何東西。
                    停權也**不收進選單**:§11 明列它是時效性動作，與「退件與
                    代為完成不鎖」同一類。
                    視覺權重跟頻率走（§11 規則 1）:每天要按的「查看」用
                    outline，偶爾用的「暫停」用 ghost＋紅字——紅字足以讀出
                    危險，真正的防線是確認框，不是把它做成視線磁鐵。 */}
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className={
                      member.suspended ? undefined : 'text-destructive hover:text-destructive'
                    }
                    onClick={() => onToggleSuspend(member)}
                    disabled={processingId === member.id}
                  >
                    {member.suspended ? '恢復' : '暫停'}
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
