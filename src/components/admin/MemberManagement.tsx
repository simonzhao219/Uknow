import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Search, Shield, UserX, Users } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { formatTwTimestamp } from '../../utils/twDate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { IdReviewQueue } from './IdReviewQueue';
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
  loadIdReviews: () => Promise<AdminIdReview[]>;
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

export function MemberManagement({
  loadMembers,
  loadMemberDetail,
  setMemberAdmin,
  suspendMember,
  loadIdReviews,
  submitIdReview,
}: MemberManagementProps) {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [detailFor, setDetailFor] = useState<AdminMemberDetail | null>(null);

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
    try {
      setDetailFor(await loadMemberDetail(id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '無法取得會員詳情');
    }
  };

  const toggleAdmin = async (m: AdminMember) => {
    setProcessingId(m.id);
    setActionError(null);
    try {
      await setMemberAdmin(m.id, !m.isAdmin);
      await list.reload();
    } catch (err) {
      // 錯誤原文直通：後端分得出 cannot_demote_self 與 last_admin，壓成
      // 「操作失敗」等於把那個區別丟掉，admin 不知道該找誰處理。
      setActionError(err instanceof Error ? err.message : '權限更新失敗');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSuspendToggle = async (member: AdminMember) => {
    setProcessingId(member.id);
    setActionError(null);
    try {
      await suspendMember(member.id, !member.suspended);
      await list.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    // 次分頁殼：證件審核併在「會員管理」底下，不新增 AdminDashboard 的第 6 個
    // 頂層 Tab（規格書 §13 註記：那是釘死的 5 欄 grid，硬加會壞版面）。
    <Tabs defaultValue="members" className="space-y-6">
      <TabsList>
        <TabsTrigger value="members">會員列表</TabsTrigger>
        <TabsTrigger value="id-reviews">證件審核</TabsTrigger>
      </TabsList>

      <TabsContent value="id-reviews">
        <IdReviewQueue loadReviews={loadIdReviews} submitReview={submitIdReview} />
      </TabsContent>

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

            <dl className="grid grid-cols-2 gap-3 py-4 text-sm">
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
          </SheetContent>
        </Sheet>
      )}

      <TabsContent value="members" className="space-y-6">
        {/* 統計卡片：讀伺服器算好的**全站** stats。改版前是
            `members.filter(...).length`——那個數字會隨分頁改變。 */}
        <section aria-label="會員統計" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-blue-600" />
                總會員數
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserX className="h-5 w-5 text-red-600" />
                暫停會員
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{stats.suspended}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-green-600" />
                管理員
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.admins}</div>
            </CardContent>
          </Card>
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
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>會員管理</CardTitle>
                <CardDescription>管理平台所有會員帳號</CardDescription>
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(searchInput.trim());
                }}
              >
                <Input
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
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`查看 ${member.name ?? member.email} 的詳情`}
                              onClick={() => openDetail(member.id)}
                            >
                              查看
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleAdmin(member)}
                              disabled={processingId === member.id}
                            >
                              {member.isAdmin ? '撤銷管理員' : '設為管理員'}
                            </Button>
                            <Button
                              size="sm"
                              variant={member.suspended ? 'default' : 'destructive'}
                              onClick={() => handleSuspendToggle(member)}
                              disabled={processingId === member.id}
                            >
                              {member.suspended ? '恢復' : '暫停'}
                            </Button>
                          </div>
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
