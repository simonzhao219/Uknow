import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Search, Shield, UserX, Users } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { StatCardGrid } from '../ui/stat-card-grid';
import { formatTwTimestamp } from '../../utils/twDate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { IdReviewQueue } from './IdReviewQueue';
import { MemberCardList } from './MemberCardList';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePagedList } from '../../hooks/usePagedList';
import type {
  AdminIdReview,
  AdminMember,
  AdminMemberDetail,
  AdminMembersResponse,
} from '@contract';

const PAGE_SIZE = 50;

export interface MemberManagementProps {
  loadMembers: (params: {
    search?: string;
    limit: number;
    offset: number;
  }) => Promise<AdminMembersResponse['data']>;
  loadMemberDetail: (id: string) => Promise<AdminMemberDetail>;
  setMemberAdmin: (id: string, isAdmin: boolean) => Promise<void>;
  suspendMember: (id: string, suspend: boolean) => Promise<void>;
  loadIdReviews: (params: {
    limit: number;
    offset: number;
  }) => Promise<{ reviews: AdminIdReview[]; total: number }>;
  submitIdReview: (userId: string, approve: boolean, reason?: string) => Promise<void>;
}

const ACCOUNT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: '有效會員', className: 'bg-green-100 text-green-800 border-green-300' },
  expired: { label: '已失效', className: 'bg-gray-100 text-gray-800 border-gray-300' },
};

const EMPTY_STATS = { total: 0, active: 0, expired: 0, suspended: 0, admins: 0 };

const ID_STATUS_LABEL: Record<string, string> = {
  none: '未上傳',
  pending: '審核中',
  approved: '已通過',
  rejected: '已退回',
};

const WITHDRAWAL_STATUS_LABEL: Record<string, string> = {
  pending: '待處理',
  awaiting_collection: '待查收',
  completed: '已完成',
  rejected: '已退件',
};

/**
 * 詳情面板裡會改變會員狀態的動作。兩種動作**共用同一條路徑**——同一個確認框、
 * 同一個執行器、同一處錯誤顯示。相同的東西用相同的邏輯，才不會日後其中一個
 * 被改了另一個沒跟上（改版前正是如此：停權在列上、管理員在面板裡，兩套流程）。
 */
type MemberAction = { kind: 'admin' | 'suspend'; next: boolean };

/**
 * 判準是**逐方向看破壞力**，不是逐動作。四個方向裡只有「恢復」是 ~0——
 * 把凍結的東西還回去。可逆又無傷的動作也收確認框，只會把確認框訓練成
 * 無腦點掉的一步，真正危險的那次就攔不住了。
 */
function needsConfirm(action: MemberAction) {
  return !(action.kind === 'suspend' && action.next === false);
}

/**
 * 確認框文案一律說出**後果**，不是「確定嗎」——admin 要判斷的是這件事會對
 * 那個人造成什麼，不是重複一次自己剛按了什麼。
 */
function actionCopy(action: MemberAction, name: string) {
  if (action.kind === 'admin') {
    return action.next
      ? {
          title: '授予管理員權限？',
          confirm: '確認授予',
          body: `${name} 將可存取平台管理後台，並讀取全站會員的身分證字號與收款帳號。權限隨時可以撤回，但他在這段期間看過的資料無法追溯撤回。`,
        }
      : {
          title: '撤銷管理員權限？',
          confirm: '確認撤銷',
          body: `${name} 將立即失去平台管理後台的全部存取權（提領作業、會員管理、證件審核）。`,
        };
  }
  return {
    title: '暫停這個帳號？',
    confirm: '確認暫停',
    body: `${name} 的刊登將立即隱藏，且無法提領點數或領取免費續約 credit。會員區瀏覽不受影響，解除暫停後即恢復。`,
  };
}

export function MemberManagement({
  loadMembers,
  loadMemberDetail,
  setMemberAdmin,
  suspendMember,
  loadIdReviews,
  submitIdReview,
}: MemberManagementProps) {
  // 版面切換用 JS 判定而非 CSS 雙套版面（plan §3 的刻意偏離，Q3 已裁決接受）:
  // 兩套都掛在 DOM 上，jsdom 的 getByText 會立刻變成 found multiple elements，
  // 既有測試會整批誤紅，而那個紅燈不代表任何真實缺陷。
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [detailFor, setDetailFor] = useState<AdminMemberDetail | null>(null);
  // **會改變會員狀態的動作全部只在詳情面板裡，走同一條路徑**：同一個
  // pendingAction、同一個確認框、同一個執行器。列上一顆都不放。
  //
  // 為什麼兩個動作同規格：停權與授予管理員是同一類事——**對一個人做的判斷**，
  // 不是對一筆資料做的修改。做這種判斷之前本來就該先看清楚他是誰，而那些
  // 資訊全在面板裡。曾經替停權開過例外（理由是「客服接到電話當下就該能處理」，
  // 援引 `WithdrawalManagement` 的退件不鎖），那個先例不轉移：提領台的動作是
  // 對**一筆交易**做的，交易該看的欄位整列都在，看不看詳情不影響判斷品質。
  //
  // 為什麼授予也要確認框（推翻更早的「授錯了撤回即可」不對稱推理）：那個
  // 推理只在權限層成立。管理員當下就讀得到全站的身分證字號與收款帳號
  // （提領作業台維持全碼），撤回權限撤不回已經被看過的資料——**授予在資料層
  // 面是不可逆的**，方向和直覺相反。
  //
  // 唯一不收確認框的是「恢復」：四個方向裡只有它的破壞力是 ~0（把東西還
  // 回去）。判準是逐方向看破壞力，不是逐動作——所以「撤銷管理員」雖然也是
  // 還原方向，照樣要確認（對方瞬間失去全部管理能力）。
  const [pendingAction, setPendingAction] = useState<MemberAction | null>(null);
  // 面板蓋在列表上，面板內動作的錯誤印在列表區等於印在看不見的地方。
  const [panelError, setPanelError] = useState<string | null>(null);

  // 分頁走共用 hook：「不得靜默截斷」原本在三個地方各自手刻，三份實作各自
  // 演化的那天就會有一個忘了顯示總數、或忘了在載入更多失敗時保留已顯示的資料。
  const list = usePagedList<AdminMember>({
    pageSize: PAGE_SIZE,
    deps: [search],
    load: useCallback(
      async ({ limit, offset }: { limit: number; offset: number }) => {
        const data = await loadMembers({ search: search || undefined, limit, offset });
        // stats 直通伺服器算好的**全站**數字。不從 members 加總——那樣算出來
        // 的統計卡會隨分頁改變（M2 的反例，改版前正是如此）。
        setStats(data.stats ?? EMPTY_STATS);
        return { items: data.members ?? [], total: data.total ?? 0 };
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [search],
    ),
  });
  const members = list.items;
  const total = list.total;
  const isLoading = list.isLoading;

  const openDetail = async (id: string) => {
    setActionError(null);
    setPanelError(null);
    try {
      setDetailFor(await loadMemberDetail(id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '無法取得會員詳情');
    }
  };

  const requestAction = (action: MemberAction) => {
    if (needsConfirm(action)) {
      setPendingAction(action);
      return;
    }
    runAction(action);
  };

  const runAction = async (action: MemberAction) => {
    const target = detailFor;
    if (!target) return;
    setProcessingId(target.id);
    setPanelError(null);
    try {
      await (action.kind === 'admin'
        ? setMemberAdmin(target.id, action.next)
        : suspendMember(target.id, action.next));
    } catch (err) {
      // 錯誤原文直通：後端分得出 cannot_demote_self 與 last_admin，壓成
      // 「操作失敗」等於把那個區別丟掉，admin 不知道該找誰處理。
      setPanelError(err instanceof Error ? err.message : '操作失敗');
      setProcessingId(null);
      return;
    }
    // 變更已成立。之後的重讀失敗**不得**回報成「操作失敗」——這兩顆鈕的
    // 標籤都隨狀態翻面，admin 以為沒生效而再按一次時，按下去的是反方向。
    try {
      setDetailFor(await loadMemberDetail(target.id));
    } catch {
      setPanelError('已更新，但重新讀取詳情失敗，請關閉面板後重開');
    }
    await list.reload();
    setProcessingId(null);
  };

  return (
    // 次分頁殼：證件審核併在「會員管理」底下，不新增 AdminDashboard 的第 6 個
    // 頂層 Tab（規格書 §13 註記：那是釘死的 5 欄 grid，硬加會壞版面）。
    //
    // 手機 12px / 桌面 24px 的區塊間距與提領台一致（理由寫在
    // `WithdrawalManagement.tsx` 的同一處，不重述）。兩個分頁在同一個
    // AdminDashboard 底下，節奏不同會被讀成「其中一頁壞了」。
    <Tabs defaultValue="members" className="space-y-3 sm:space-y-6">
      <TabsList>
        <TabsTrigger value="members">會員列表</TabsTrigger>
        <TabsTrigger value="id-reviews">證件審核</TabsTrigger>
      </TabsList>

      <TabsContent value="id-reviews">
        <IdReviewQueue loadReviews={loadIdReviews} submitReview={submitIdReview} />
      </TabsContent>

      {/* 確認框的文案一律說出**後果**，不是「確定嗎」——admin 要判斷的是
          這件事會對那個人造成什麼，不是重複一次自己剛按了什麼。 */}
      {/* 一個確認框服務兩種動作。文案來自 actionCopy 的單一來源——兩個分開的
          對話框各自演化的那天，就會有一個忘了把後果講清楚。 */}
      {pendingAction && detailFor && (
        <AlertDialog open onOpenChange={() => setPendingAction(null)}>
          <AlertDialogContent>
            {(() => {
              const copy = actionCopy(pendingAction, detailFor.name ?? detailFor.email);
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                    <AlertDialogDescription>{copy.body}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        const action = pendingAction;
                        setPendingAction(null);
                        runAction(action);
                      }}
                    >
                      {copy.confirm}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            })()}
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 詳情面板。§1.1 的頭號客服情境是「我提領怎麼還沒到」——近期提領記錄
          （含退件理由）是這個面板存在的理由，不是附加資訊。
          身分證與銀行帳號是**遮罩值**：需要全碼時回提領作業台看，那裡因匯款
          作業需要而維持完整值。查詢台是客服日常翻閱的地方，翻閱不需要全碼。 */}
      {detailFor && (
        <Sheet open onOpenChange={() => setDetailFor(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{detailFor.name ?? detailFor.email}</SheetTitle>
              <SheetDescription>{detailFor.email}</SheetDescription>
            </SheetHeader>

            {/* P9:「收款帳號」這類 `銀行代號 / 帳號` 的值在半寬欄裡會折行破碎。 */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4 text-sm">
              {/* 電話:詳情面板原本就缺這一欄（桌面只在表格列上有）。手機是
                  JS 擇一渲染，表格根本不掛 DOM——沒補這欄的話，admin 用電話
                  搜到人之後在手機上完全看不到號碼，也無法回撥。 */}
              <div>
                <dt className="text-muted-foreground">電話</dt>
                <dd className="font-mono">{detailFor.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">會籍</dt>
                <dd>{detailFor.accountStatus === 'active' ? '有效會員' : '已失效'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">到期日</dt>
                <dd>{detailFor.endDate ? formatTwTimestamp(detailFor.endDate) : '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">可提領點數</dt>
                <dd>{detailFor.availablePoints.toLocaleString()} P</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">已提領</dt>
                <dd>{detailFor.withdrawnPoints.toLocaleString()} P</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">推薦人</dt>
                <dd>{detailFor.referrerName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">直接下線</dt>
                <dd>{detailFor.directChildCount} 人</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">證件審核</dt>
                <dd>{ID_STATUS_LABEL[detailFor.idVerificationStatus]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">刊登數</dt>
                <dd>{detailFor.listingCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">身分證字號</dt>
                <dd className="font-mono">{detailFor.idNumber ?? '未設定'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">收款帳號</dt>
                <dd className="font-mono">
                  {detailFor.bankCode ?? '—'} / {detailFor.bankAccount ?? '未設定'}
                </dd>
              </div>
            </dl>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">近期提領記錄</h3>
              {detailFor.recentWithdrawals.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無提領記錄</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {detailFor.recentWithdrawals.map((w) => (
                    <li key={w.id} className="rounded-md border p-2">
                      <div className="flex justify-between">
                        <span>{w.amount.toLocaleString()} P</span>
                        <span>{WITHDRAWAL_STATUS_LABEL[w.status] ?? w.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        申請 {formatTwTimestamp(w.requestedAt)}
                      </p>
                      {/* 客服要的就是這一行 */}
                      {w.note && <p className="text-destructive">{w.note}</p>}
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
                  {detailFor.suspended ? '帳號已暫停' : '帳號正常'}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className={
                    detailFor.suspended ? undefined : 'text-destructive hover:text-destructive'
                  }
                  onClick={() => requestAction({ kind: 'suspend', next: !detailFor.suspended })}
                  disabled={processingId === detailFor.id}
                >
                  {detailFor.suspended ? '恢復' : '暫停'}
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {detailFor.isAdmin ? '目前是平台管理員' : '一般會員'}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className={
                    detailFor.isAdmin ? 'text-destructive hover:text-destructive' : undefined
                  }
                  onClick={() => requestAction({ kind: 'admin', next: !detailFor.isAdmin })}
                  disabled={processingId === detailFor.id}
                >
                  {detailFor.isAdmin ? '撤銷管理員' : '設為管理員'}
                </Button>
              </div>

              {panelError && (
                <p role="alert" className="text-sm text-destructive">
                  {panelError}
                </p>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <TabsContent value="members" className="space-y-3 sm:space-y-6">
        {/* 統計卡片：讀伺服器算好的**全站** stats。改版前是
            `members.filter(...).length`——那個數字會隨分頁改變。 */}
        <section aria-label="會員統計">
          {/* 手機整組換成一行摘要，與提領彙總同一個理由:壓扁過的三張卡仍佔
              一屏的可觀比例，而 admin 打開手機是為了找那個人。桌面維持卡片。 */}
          {!isDesktop ? (
            <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
              <div className="flex items-baseline gap-1">
                <dt className="text-xs text-muted-foreground">總會員</dt>
                <dd className="font-bold text-blue-600">{stats.total}</dd>
              </div>
              <div className="flex items-baseline gap-1">
                <dt className="text-xs text-muted-foreground">暫停</dt>
                <dd className="font-bold text-red-600">{stats.suspended}</dd>
              </div>
              <div className="flex items-baseline gap-1">
                <dt className="text-xs text-muted-foreground">管理員</dt>
                <dd className="font-bold text-green-600">{stats.admins}</dd>
              </div>
            </dl>
          ) : (
            <StatCardGrid className="grid-cols-3 gap-2 sm:gap-4">
              <Card>
                <CardHeader className="p-2 pb-0 sm:p-6 sm:pb-3">
                  <CardTitle className="flex items-center gap-1 text-xs sm:gap-2 sm:text-lg">
                    <Users className="h-3.5 w-3.5 shrink-0 text-blue-600 sm:h-5 sm:w-5" />
                    <span className="truncate">總會員數</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
                  <div className="text-lg font-bold sm:text-3xl text-blue-600">{stats.total}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-2 pb-0 sm:p-6 sm:pb-3">
                  <CardTitle className="flex items-center gap-1 text-xs sm:gap-2 sm:text-lg">
                    <UserX className="h-3.5 w-3.5 shrink-0 text-red-600 sm:h-5 sm:w-5" />
                    <span className="truncate">暫停會員</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
                  <div className="text-lg font-bold sm:text-3xl text-red-600">
                    {stats.suspended}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-2 pb-0 sm:p-6 sm:pb-3">
                  <CardTitle className="flex items-center gap-1 text-xs sm:gap-2 sm:text-lg">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-green-600 sm:h-5 sm:w-5" />
                    <span className="truncate">管理員</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
                  <div className="text-lg font-bold sm:text-3xl text-green-600">{stats.admins}</div>
                </CardContent>
              </Card>
            </StatCardGrid>
          )}
        </section>

        {actionError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {actionError}
          </div>
        )}

        {/* 會員列表 */}
        <Card>
          <CardHeader>
            {/* P8:375px 下標題與 w-56 的搜尋框互相擠壓（實測 +9px）。 */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                {/* 手機隱藏:分頁標籤已經寫著「會員管理」。 */}
                <CardTitle className="hidden sm:block">會員管理</CardTitle>
                <CardDescription className="hidden sm:block">管理平台所有會員帳號</CardDescription>
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(searchInput.trim());
                }}
              >
                <Input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="搜尋姓名 / Email / 電話"
                  className="w-56"
                />
                <Button type="submit" variant="outline" size="sm">
                  <Search className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div role="status" aria-label="載入會員列表中" className="space-y-3 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : list.error ? (
              // 三態的「錯」：說出錯在哪、給一顆重試。靜默的空表格會讓 admin
              // 以為系統裡沒有這個人，而不是「沒讀到」。
              <div className="py-12 text-center space-y-3">
                <p className="text-destructive">{list.error}</p>
                <Button variant="outline" onClick={list.reload}>
                  重試
                </Button>
              </div>
            ) : members.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">沒有符合條件的會員</p>
            ) : !isDesktop ? (
              <MemberCardList
                members={members}
                accountBadge={(status) =>
                  ACCOUNT_STATUS_BADGE[status] ?? ACCOUNT_STATUS_BADGE.expired
                }
                onOpenDetail={openDetail}
                processingId={processingId}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>電話</TableHead>
                    <TableHead>會籍</TableHead>
                    <TableHead>刊登數</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const acct =
                      ACCOUNT_STATUS_BADGE[member.accountStatus] ?? ACCOUNT_STATUS_BADGE.expired;
                    return (
                      <TableRow key={member.id}>
                        <TableCell>{member.name ?? '—'}</TableCell>
                        <TableCell className="text-sm">{member.email}</TableCell>
                        <TableCell className="text-sm">{member.phone ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${acct.className} border`}>
                            {acct.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{member.listingCount}</TableCell>
                        <TableCell>
                          {member.isAdmin ? (
                            <Badge variant="default">管理員</Badge>
                          ) : (
                            <Badge variant="outline">一般會員</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {member.suspended ? (
                            <Badge variant="destructive">已暫停</Badge>
                          ) : (
                            <Badge variant="default">正常</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* 列上只有一個動作：進去看。**沒有任何會改變狀態的
                              鍵可以從列表直接按到**——誤觸的上限就是開錯一個面板。
                              改版前是三顆等寬平排，而且視覺權重和使用頻率相反：
                              每天要按的「查看」是最輕的 ghost，偶爾才用的「暫停」
                              卻是滿版紅底、在掃描時最搶眼。 */}
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`查看 ${member.name ?? member.email} 的詳情`}
                            onClick={() => openDetail(member.id)}
                          >
                            查看
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {!isLoading && !list.error && members.length > 0 && (
              <div className="pt-4 text-center space-y-2 text-sm text-muted-foreground">
                {/* 不得靜默截斷（ui-ux-guidelines §5）。 */}
                <p>
                  已顯示 {members.length} / {total} 筆
                </p>
                {list.hasMore && (
                  <Button variant="outline" onClick={list.loadMore} disabled={list.isLoadingMore}>
                    {list.isLoadingMore ? '載入中…' : '載入更多'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
