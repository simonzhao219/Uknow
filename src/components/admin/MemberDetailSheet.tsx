import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { formatTwTimestamp } from '../../utils/twDate';
import { BreakableEmail } from '../common/BreakableEmail';
import type { AdminMemberDetail } from '@contract';
import type { MemberAction } from './MemberManagement';
import { withdrawalStatusLabel } from './WithdrawalStatusBadge';

/**
 * 會員詳情面板（純呈現）。
 *
 * **會改變狀態的動作只回呼 `onRequestAction`。** `MemberAction` 型別、要不要確認
 * （`needsConfirm`）、確認框文案（`actionCopy`）、執行器與唯一的確認框都留在
 * `MemberManagement.tsx`，與 ui-ux-guidelines §11 的〔實作〕指向同一處——這裡
 * 不判斷、不呼叫 API、不渲染任何確認框。兩份實作各自演化的那天，就會有一個忘了
 * 把後果講清楚。
 */
interface MemberDetailSheetProps {
  detail: AdminMemberDetail;
  /** 管理動作進行中：四顆管理鈕停用。 */
  processing: boolean;
  /** 管理動作的錯誤。面板蓋在列表上，錯誤只能印在面板裡。 */
  panelError: string | null;
  onRequestAction: (action: MemberAction) => void;
  onClose: () => void;
}

const ID_STATUS_LABEL: Record<string, string> = {
  none: '未上傳',
  pending: '審核中',
  approved: '已通過',
  rejected: '已退回',
};

/* 詳情面板。§1.1 的頭號客服情境是「我提領怎麼還沒到」——近期提領記錄
   （含退件理由）是這個面板存在的理由，不是附加資訊。
   身分證與銀行帳號是**遮罩值**：需要全碼時回提領作業台看，那裡因匯款
   作業需要而維持完整值。查詢台是客服日常翻閱的地方，翻閱不需要全碼。 */
export function MemberDetailSheet({
  detail,
  processing,
  panelError,
  onRequestAction,
  onClose,
}: MemberDetailSheetProps) {
  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{detail.name ?? detail.email}</SheetTitle>
          <SheetDescription>
            <BreakableEmail email={detail.email} />
          </SheetDescription>
        </SheetHeader>

        {/* P9:「收款帳號」這類 `銀行代號 / 帳號` 的值在半寬欄裡會折行破碎。 */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4 text-sm">
          {/* 電話:詳情面板原本就缺這一欄（桌面只在表格列上有）。手機是
                JS 擇一渲染，表格根本不掛 DOM——沒補這欄的話，admin 用電話
                搜到人之後在手機上完全看不到號碼，也無法回撥。 */}
          <div>
            <dt className="text-muted-foreground">電話</dt>
            <dd className="font-mono">{detail.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">會籍</dt>
            <dd>{detail.accountStatus === 'active' ? '有效會員' : '已失效'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">到期日</dt>
            <dd>{detail.endDate ? formatTwTimestamp(detail.endDate) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">可提領點數</dt>
            <dd>{detail.availablePoints.toLocaleString()} P</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">已提領</dt>
            <dd>{detail.withdrawnPoints.toLocaleString()} P</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">推薦人</dt>
            <dd>{detail.referrerName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">直接推薦</dt>
            <dd>{detail.directChildCount} 位</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">證件審核</dt>
            <dd>{ID_STATUS_LABEL[detail.idVerificationStatus]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">刊登數</dt>
            <dd>{detail.listingCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">身分證字號</dt>
            <dd className="font-mono">{detail.idNumber ?? '未設定'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">收款帳號</dt>
            <dd className="font-mono">
              {detail.bankCode ?? '—'} / {detail.bankAccount ?? '未設定'}
            </dd>
          </div>
        </dl>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">近期提領記錄</h3>
          {detail.recentWithdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無提領記錄</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {detail.recentWithdrawals.map((w) => (
                <li key={w.id} className="rounded-md border p-2">
                  <div className="flex justify-between">
                    <span>{w.amount.toLocaleString()} P</span>
                    <span>{withdrawalStatusLabel(w.status)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    申請 {formatTwTimestamp(w.requestedAt)}
                  </p>
                  {/* 客服要的就是這一行 */}
                  {w.note && <p className="text-destructive-subtle-foreground">{w.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 管理。**所有會改變狀態的動作都在這裡**，放在面板最底、以分隔線
              隔開——位置要讓人「走到」而不是「路過」。兩列同構：左邊說現況、
              右邊是切換鍵，破壞性方向一律紅字。 */}
        <div className="mt-6 space-y-4 border-t pt-4">
          <h3 className="text-sm font-medium">管理</h3>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {detail.suspended ? '帳號已暫停' : '帳號正常'}
            </p>
            <Button
              size="sm"
              tone="secondary"
              className={
                detail.suspended
                  ? undefined
                  : 'text-destructive-subtle-foreground hover:text-destructive-subtle-foreground'
              }
              onClick={() => onRequestAction({ kind: 'suspend', next: !detail.suspended })}
              disabled={processing}
            >
              {detail.suspended ? '恢復' : '暫停'}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {detail.isAdmin ? '目前是平台管理員' : '一般會員'}
            </p>
            <Button
              size="sm"
              tone="secondary"
              className={
                detail.isAdmin
                  ? 'text-destructive-subtle-foreground hover:text-destructive-subtle-foreground'
                  : undefined
              }
              onClick={() => onRequestAction({ kind: 'admin', next: !detail.isAdmin })}
              disabled={processing}
            >
              {detail.isAdmin ? '撤銷管理員' : '設為管理員'}
            </Button>
          </div>

          {panelError && (
            <p role="alert" className="text-sm text-destructive-subtle-foreground">
              {panelError}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
