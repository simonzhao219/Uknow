import { useId, type ReactNode, type Ref } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { cn } from '../ui/utils';
import { formatTwDate, formatTwTimestamp } from '../../utils/twDate';
import { BreakableEmail } from '../common/BreakableEmail';
import type { AdminMemberDetail, AdminMemberWithdrawal } from '@contract';
import type { MemberAction } from './MemberManagement';
import { memberName } from './memberName';
import { MemberStatusBadges } from './MemberStatusBadges';
import { WithdrawalStatusBadge } from './WithdrawalStatusBadge';

/**
 * 會員詳情面板（純呈現）。
 *
 * **會改變狀態的動作只回呼 `onRequestAction`。** `MemberAction` 型別、要不要確認
 * （`needsConfirm`）、確認框文案（`actionCopy`）、執行器與唯一的確認框都留在
 * `MemberManagement.tsx`，與 ui-ux-guidelines §11 的〔實作〕指向同一處——這裡
 * 不判斷、不呼叫 API、不渲染任何確認框。兩份實作各自演化的那天，就會有一個忘了
 * 把後果講清楚。
 *
 * **資訊有位階**（ui-ux-guidelines §13）：admin 要先知道「這是誰、狀態如何」，再往下
 * 找細節。所以身分卡（姓名＋徽章＋到期）固定在上，分區內文在下面捲動：帳號 → 點數 →
 * 近期提領 → 推薦關係 → 敏感資料 → 管理。近期提領緊接在點數之後——§1.1 的頭號客服
 * 情境是「我提領怎麼還沒到」，這一區是面板存在的理由，不是附加資訊。
 *
 * 只有一個請求取整份詳情，沒有分區各自的讀取：資料到齊才開面板（載入回饋在「查看」
 * 鈕上），取不到就不開；動作後重讀失敗只印在管理區，其他分區保留上一份資料。
 */
interface MemberDetailSheetProps {
  detail: AdminMemberDetail;
  /** 這位會員送出中的管理動作種類；非 null 時管理鈕全部停用。 */
  processingKind: MemberAction['kind'] | null;
  /** 管理動作的錯誤。面板蓋在列表上，錯誤只能印在面板裡。 */
  panelError: string | null;
  /** 動作已成功、只是重讀失敗的提示：中性字，不是紅色警示。 */
  panelNotice?: string | null;
  /** 另一位會員的動作失敗晚到、面板已換成這位時的提示（前綴那位的姓名）。 */
  otherNotice?: string | null;
  /** 管理區標題：父層在動作送出後把焦點放到這裡（被按的鈕送出中是停用的）。 */
  manageHeadingRef?: Ref<HTMLHeadingElement>;
  onRequestAction: (action: MemberAction) => void;
  onClose: () => void;
  /** 關閉後焦點要回去的地方由父層決定（它知道是哪一顆「查看」開的）。 */
  onCloseAutoFocus?: (event: Event) => void;
}

const ID_STATUS_LABEL: Record<string, string> = {
  none: '未上傳',
  pending: '審核中',
  approved: '已通過',
  rejected: '已退回',
};

// `admin_member_detail` 只回最近 10 筆、沒有總筆數
// （supabase/migrations/20260802000008_admin_member_detail.sql 的 `limit 10`）。
// 筆數到頂時照實說「最多列出最近 10 筆」——不得靜默截斷（ui-ux-guidelines §5）。
const RECENT_WITHDRAWALS_LIMIT = 10;

const points = (n: number) => `${n.toLocaleString()} P`;

/**
 * 標籤左、值右的一列。值可能是長 Email、長理由，一律可斷行、不撐寬。
 * `stacked`：長自由文字（證件退回理由，後端沒有長度上限）改成標籤在上、值整寬靠左——
 * 多行右對齊時左緣參差難讀，也和近期提領的「退件理由」版式不一致。
 */
function Field({
  label,
  children,
  valueClassName,
  stacked = false,
}: {
  label: string;
  children: ReactNode;
  valueClassName?: string;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="space-y-0.5 py-1">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className={cn('wrap-anywhere', valueClassName)}>{children}</dd>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 text-right wrap-anywhere', valueClassName)}>{children}</dd>
    </div>
  );
}

function Section({
  title,
  icon,
  description,
  headingRef,
  children,
}: {
  title: string;
  icon?: ReactNode;
  description?: string;
  /** 給了就讓標題可被程式聚焦（tabIndex -1，不進 Tab 順序）。 */
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="py-4">
      <h3
        id={id}
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className="flex items-center gap-1.5 text-sm font-semibold outline-none"
      >
        {icon}
        {title}
      </h3>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

function WithdrawalItem({ w }: { w: AdminMemberWithdrawal }) {
  return (
    <li className="space-y-0.5 py-2">
      <div className="flex items-center justify-between gap-2">
        {/* 手續費逐筆寫出：點數區的「處理中」含手續費，只有金額時客服加不回去。已退件
            不寫——退件時點數與手續費都退還（規格書 §10.3），寫出來客服會以為被收了。 */}
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="whitespace-nowrap font-medium">{points(w.amount)}</span>
          {w.status !== 'rejected' && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              手續費 {points(w.fee)}
            </span>
          )}
        </span>
        <WithdrawalStatusBadge status={w.status} />
      </div>
      <p className="text-xs text-muted-foreground">申請 {formatTwTimestamp(w.requestedAt)}</p>
      {/* 「款匯出去了沒」「會員確認了沒」——待查收看匯款時間、已完成看完成時間。 */}
      {w.status === 'awaiting_collection' && w.processedAt && (
        <p className="text-xs text-muted-foreground">匯款時間 {formatTwTimestamp(w.processedAt)}</p>
      )}
      {w.status === 'completed' && w.completedAt && (
        <p className="text-xs text-muted-foreground">完成時間 {formatTwTimestamp(w.completedAt)}</p>
      )}
      {/* `note` 是該筆最新一筆事件的備註，不限退件（代為完成必填原因、匯款可選填）。
          只有退件理由是客服要轉告會員的那一行，才用紅字。 */}
      {w.note &&
        (w.status === 'rejected' ? (
          <p className="text-xs text-destructive-subtle-foreground wrap-anywhere">
            退件理由：{w.note}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground wrap-anywhere">備註：{w.note}</p>
        ))}
    </li>
  );
}

export function MemberDetailSheet({
  detail,
  processingKind,
  panelError,
  panelNotice,
  otherNotice,
  manageHeadingRef,
  onRequestAction,
  onClose,
  onCloseAutoFocus,
}: MemberDetailSheetProps) {
  const bothBankFieldsMissing = detail.bankCode == null && detail.bankAccount == null;
  const name = memberName(detail.name);
  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent
        // 捲動放在內層：身分卡與右上角關閉鈕固定，做完管理動作不用捲回頂端才能關
        // （HomePage／ReferralTreeView 的 Sheet 同一個結構）。
        className="w-full gap-0 sm:max-w-lg"
        // 無名時標題就是 Email，不再印第二行描述；不給描述時要明說，Radix 才不警告。
        {...(name ? {} : { 'aria-describedby': undefined })}
        // 開啟時焦點放在姓名標題。Radix 預設落到 DOM 第一個可聚焦元素——那是
        // 畫面外的管理鈕，而「恢復」連確認框都沒有。
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.target as HTMLElement)
            .querySelector<HTMLElement>('[data-slot="sheet-title"]')
            ?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {/* 身分卡。pr-16：右上角關閉鈕實占右緣約 12–62px，長姓名不得鑽到它底下。 */}
        <SheetHeader className="gap-1.5 border-b pr-16">
          <SheetTitle tabIndex={-1} className="text-lg outline-none wrap-anywhere">
            {name ?? <BreakableEmail email={detail.email} />}
          </SheetTitle>
          {name && (
            <SheetDescription>
              <BreakableEmail email={detail.email} />
            </SheetDescription>
          )}
          <MemberStatusBadges
            suspended={detail.suspended}
            isAdmin={detail.isAdmin}
            accountStatus={detail.accountStatus}
          />
          {detail.endDate && (
            <p className="text-sm text-muted-foreground">
              {detail.accountStatus === 'active'
                ? `會籍到期 ${formatTwDate(detail.endDate)}`
                : `已於 ${formatTwDate(detail.endDate)} 到期`}
            </p>
          )}
        </SheetHeader>

        {/* 捲動區可被鍵盤聚焦：開啟焦點在上面固定的標題，沒有這個停駐點，純鍵盤使用者
            按 Tab 會直接跳到最底的管理鈕，中間的分區捲不到。 */}
        <section
          aria-label="詳情內容"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: 可捲動區要能用鍵盤捲（WCAG 2.1.1）
          tabIndex={0}
          className="min-h-0 flex-1 divide-y overflow-y-auto px-4 pb-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Section title="帳號">
            <dl>
              {/* 電話：admin 用來電號碼搜到人之後要認得出是同一個人，手機上也要能回撥。 */}
              <Field label="電話" valueClassName="font-mono">
                {detail.phone ?? '—'}
              </Field>
              <Field label="註冊日">{formatTwDate(detail.createdAt)}</Field>
              <Field label="刊登數">{detail.listingCount}</Field>
              {detail.suspendedAt && (
                <Field label="暫停時間">{formatTwTimestamp(detail.suspendedAt)}</Field>
              )}
            </dl>
          </Section>

          {/* 一區一個主數字：可提領是會員自己也看得到、客服對帳用的數字。處理中的細節
              由下一區逐筆回答，這裡不再放大一次（D10：處理中維持「灰字一行」——降級成
              小字；窄螢幕大額時可以折成兩行，但每一段都 nowrap，不從數字中間斷開）。
              處理中與已提領都是 amount＋fee 的加總（含待查收），與列表的「金額」對不上
              是正常的，所以兩邊都寫出來。 */}
          <Section title="點數">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">可提領點數</span>
              <span className="whitespace-nowrap text-lg font-semibold">
                {points(detail.availablePoints)}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">
                處理中 {points(detail.pendingPoints)}（含手續費）
              </span>
              <span className="whitespace-nowrap">
                已提領 {points(detail.withdrawnPoints)}（含手續費）
              </span>
            </p>
          </Section>

          <Section title="近期提領">
            {detail.recentWithdrawals.length === 0 ? (
              <p className="text-muted-foreground">尚無提領記錄</p>
            ) : (
              <>
                <ul className="divide-y">
                  {detail.recentWithdrawals.map((w) => (
                    <WithdrawalItem key={w.id} w={w} />
                  ))}
                </ul>
                {detail.recentWithdrawals.length >= RECENT_WITHDRAWALS_LIMIT && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    最多列出最近 {RECENT_WITHDRAWALS_LIMIT} 筆
                  </p>
                )}
              </>
            )}
          </Section>

          <Section title="推薦關係">
            <dl>
              {/* 「推薦人」這三個字是 journey f70 的定位器（get_by_text exact），整個面板
                  只能有這一處完整等於它。 */}
              <Field label="推薦人">{detail.referrerName ?? '—'}</Field>
              <Field label="直接推薦">{detail.directChildCount} 位</Field>
            </dl>
          </Section>

          {/* 遮罩值：需要全碼時回提領作業台看，那裡因匯款作業需要而維持完整值。查詢台
              是客服日常翻閱的地方，翻閱不需要全碼——這裡沒有、也不加「顯示完整」。 */}
          <Section
            title="敏感資料"
            icon={<Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
            description="身分證與收款帳號只顯示部分碼"
          >
            <dl>
              <Field label="證件審核">{ID_STATUS_LABEL[detail.idVerificationStatus]}</Field>
              {detail.idVerificationStatus === 'rejected' && detail.idRejectReason && (
                <Field label="退回理由" stacked>
                  {detail.idRejectReason}
                </Field>
              )}
              <Field label="身分證字號" valueClassName="font-mono">
                {detail.idNumber ?? '未設定'}
              </Field>
              <Field label="收款帳號" valueClassName="font-mono">
                {bothBankFieldsMissing
                  ? '未設定'
                  : `${detail.bankCode ?? '—'} / ${detail.bankAccount ?? '未設定'}`}
              </Field>
            </dl>
          </Section>

          {/* 管理。**所有會改變狀態的動作都在這裡**，放在最底、以分隔線隔開——位置要讓人
              「走到」而不是「路過」。兩列同構：左邊說現況、右邊是切換鍵；外觀依
              ui-ux-guidelines §12.11 按鈕三分法。 */}
          <Section title="管理" headingRef={manageHeadingRef}>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground">
                  {detail.suspended ? '帳號已暫停' : '帳號正常'}
                </p>
                <Button
                  size="sm"
                  tone={detail.suspended ? 'secondary' : 'destructive'}
                  onClick={() => onRequestAction({ kind: 'suspend', next: !detail.suspended })}
                  loading={processingKind === 'suspend'}
                  disabled={processingKind !== null}
                >
                  {detail.suspended ? '恢復' : '暫停'}
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground">
                  {detail.isAdmin ? '目前是平台管理員' : '一般會員'}
                </p>
                <Button
                  size="sm"
                  tone={detail.isAdmin ? 'destructive' : 'secondary'}
                  onClick={() => onRequestAction({ kind: 'admin', next: !detail.isAdmin })}
                  loading={processingKind === 'admin'}
                  disabled={processingKind !== null}
                >
                  {detail.isAdmin ? '撤銷管理員' : '設為管理員'}
                </Button>
              </div>

              {panelError && (
                <p role="alert" className="text-destructive-subtle-foreground">
                  {panelError}
                </p>
              )}
            </div>
            {/* 中性提示：常駐、只換文字——隨文字一起新插入 DOM 的 live region 報讀器不保證
                播報。空的時候不留間距（不用 hidden：display:none 的 live region 一樣不播）。 */}
            <div role="status" className="mt-4 space-y-1 text-muted-foreground empty:mt-0">
              {otherNotice && <p className="wrap-anywhere">{otherNotice}</p>}
              {panelNotice && <p>{panelNotice}</p>}
            </div>
          </Section>
        </section>
      </SheetContent>
    </Sheet>
  );
}
