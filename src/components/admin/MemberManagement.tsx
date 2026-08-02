import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Users, UserX, Shield, Loader2, Search } from 'lucide-react';
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

      <TabsContent value="members" className="space-y-6">
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-blue-600" />
                總會員數
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{total}</div>
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
              <div className="text-3xl font-bold text-red-600">
                {members.filter((m) => m.suspended).length}
              </div>
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
              <div className="text-3xl font-bold text-green-600">
                {members.filter((m) => m.isAdmin).length}
              </div>
            </CardContent>
          </Card>
        </div>

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
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                {search ? '找不到符合條件的會員' : '尚無會員'}
              </p>
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
                          <Button
                            size="sm"
                            variant={member.suspended ? 'default' : 'destructive'}
                            onClick={() => handleSuspendToggle(member)}
                            disabled={processingId === member.id}
                          >
                            {member.suspended ? '恢復' : '暫停'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
