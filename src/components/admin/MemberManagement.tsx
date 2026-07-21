import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Users, UserX, Shield, Loader2, Search } from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';
import type { AdminMember, AdminMembersResponse } from '@contract';

const ACCOUNT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:  { label: '有效會員', className: 'bg-green-100 text-green-800 border-green-300' },
  expired: { label: '已失效',   className: 'bg-gray-100 text-gray-800 border-gray-300' },
};

export function MemberManagement() {
  const { showSuccess, showToast } = useNotification();

  const [members, setMembers] = useState<AdminMember[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const result = await apiRequestJson<AdminMembersResponse>(
        buildApiUrl(`/admin/members${qs}`)
      );
      if (result.success) {
        setMembers(result.data.members);
        setTotal(result.data.total);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '無法取得會員列表', 'error');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSuspendToggle = async (member: AdminMember) => {
    setProcessingId(member.id);
    try {
      const result = await apiRequestJson<{ success: boolean; error?: { message: string } }>(
        buildApiUrl(`/admin/members/${member.id}/suspend`),
        { method: 'POST', body: JSON.stringify({ suspend: !member.suspended }) }
      );
      if (result.success) {
        showSuccess(
          member.suspended ? '已恢復會員' : '已停權會員',
          member.suspended
            ? `${member.name ?? member.email} 已恢復正常`
            : `${member.name ?? member.email} 已停權，其刊登將自動下架`
        );
        await fetchMembers();
      } else {
        showToast(result.error?.message ?? '操作失敗', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失敗', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
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
                  const acct = ACCOUNT_STATUS_BADGE[member.accountStatus] ?? ACCOUNT_STATUS_BADGE.expired;
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
    </div>
  );
}
