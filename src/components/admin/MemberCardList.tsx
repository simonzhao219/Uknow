import type { AdminMember } from '@contract';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

/**
 * 會員管理的**手機版**列表：一位會員一張卡。
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
  onToggleAdmin: (member: AdminMember) => void;
  onToggleSuspend: (member: AdminMember) => void;
  processingId: string | null;
}

export function MemberCardList({
  members,
  accountBadge,
  onOpenDetail,
  onToggleAdmin,
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
            <CardContent className="space-y-3 pt-4">
              <div className="min-w-0">
                <p className="font-medium break-words">{member.name ?? '—'}</p>
                {/* Email 來自 Supabase Auth、長度無上限——break-all 而不是靠
                    「大概不會太長」。 */}
                <p className="text-sm text-muted-foreground break-all">{member.email}</p>
                <p className="text-sm text-muted-foreground">{member.phone ?? '—'}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`${acct.className} border`}>
                  {acct.label}
                </Badge>
                {member.isAdmin ? (
                  <Badge variant="default">管理員</Badge>
                ) : (
                  <Badge variant="outline">一般會員</Badge>
                )}
                {member.suspended ? (
                  <Badge variant="destructive">已暫停</Badge>
                ) : (
                  <Badge variant="default">正常</Badge>
                )}
                <span className="text-xs text-muted-foreground">刊登 {member.listingCount}</span>
              </div>

              {/* P14:底部已被 BottomNav 佔用，操作鍵一律在卡片內。 */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`查看 ${member.name ?? member.email} 的詳情`}
                  onClick={() => onOpenDetail(member.id)}
                >
                  查看
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onToggleAdmin(member)}
                  disabled={processingId === member.id}
                >
                  {member.isAdmin ? '撤銷管理員' : '設為管理員'}
                </Button>
                <Button
                  size="sm"
                  variant={member.suspended ? 'default' : 'destructive'}
                  onClick={() => onToggleSuspend(member)}
                  disabled={processingId === member.id}
                >
                  {member.suspended ? '恢復' : '暫停'}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
