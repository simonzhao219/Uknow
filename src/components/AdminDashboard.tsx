import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { WithdrawalManagement } from './admin/WithdrawalManagement';
import { MemberManagement } from './admin/MemberManagement';
import { SystemNotifications } from './admin/SystemNotifications';
import { SystemAlerts } from './admin/SystemAlerts';
import { AdminSetup } from './admin/AdminSetup';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';
import type {
  AdminIdReviewsResponse,
  AdminMemberDetailResponse,
  AdminMembersResponse,
  AdminWithdrawalsResponse,
} from '@contract';
import type { WithdrawalQuery } from './admin/WithdrawalManagement';

// 取數／送出走這裡、畫面只吃 props——與 MemberManagement 餵 IdReviewQueue
// 的作法一致：元件測試才不用替身掉整個網路層。
async function loadWithdrawals(params: WithdrawalQuery) {
  const qs = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  if (params.status !== 'all') qs.set('status', params.status);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.search) qs.set('search', params.search);
  const res = await apiRequestJson<AdminWithdrawalsResponse>(
    buildApiUrl(`/admin/withdrawals?${qs}`),
  );
  return res.data;
}

async function updateWithdrawalStatus(
  id: string,
  status: 'awaiting_collection' | 'rejected' | 'completed',
  note?: string,
  bankRef?: string,
  transferredOn?: string,
) {
  await apiRequestJson(buildApiUrl(`/admin/withdrawals/${id}/status`), {
    method: 'POST',
    body: JSON.stringify({ status, note, bankRef, transferredOn }),
  });
}

async function batchMarkPaid(items: { id: string; bankRef?: string }[]) {
  const res = await apiRequestJson<{
    data: { succeeded: string[]; failed: { id: string; error: string }[] };
  }>(buildApiUrl('/admin/withdrawals/batch-mark-paid'), {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  return res.data;
}

async function loadMembers(params: { search?: string; limit: number; offset: number }) {
  const qs = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  if (params.search) qs.set('search', params.search);
  const res = await apiRequestJson<AdminMembersResponse>(buildApiUrl(`/admin/members?${qs}`));
  return res.data;
}

async function loadMemberDetail(id: string) {
  const res = await apiRequestJson<AdminMemberDetailResponse>(buildApiUrl(`/admin/members/${id}`));
  return res.data.member;
}

async function setMemberAdmin(id: string, isAdmin: boolean) {
  await apiRequestJson(buildApiUrl(`/admin/members/${id}/admin`), {
    method: 'POST',
    body: JSON.stringify({ isAdmin }),
  });
}

async function suspendMember(id: string, suspend: boolean) {
  await apiRequestJson(buildApiUrl(`/admin/members/${id}/suspend`), {
    method: 'POST',
    body: JSON.stringify({ suspend }),
  });
}

async function loadIdReviews() {
  const res = await apiRequestJson<AdminIdReviewsResponse>(
    buildApiUrl('/admin/id-reviews?status=pending'),
  );
  return res.data.reviews;
}

async function submitIdReview(userId: string, approve: boolean, reason?: string) {
  await apiRequestJson(buildApiUrl(`/admin/id-reviews/${userId}/review`), {
    method: 'POST',
    body: JSON.stringify({ approve, reason }),
  });
}

export function AdminDashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">平台管理</h1>
          <p className="text-muted-foreground">管理 Uknow 平台的所有功能</p>
        </div>
        {/* 掃碼核身是獨立路由（相機需全螢幕，且下方 Tabs 是釘死的 5 欄）——
            入口放這裡，避免變成沒有站內連結可達的孤兒頁。 */}
        <Button asChild variant="outline">
          <Link to="/admin/verify">
            <ScanLine className="mr-1 h-4 w-4" />
            掃碼核身
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="withdrawals" className="w-full">
        {/* grid-cols-5 的欄是 minmax(0,1fr)，會把五個中文標籤壓到比文字還窄
            （375px 下每格僅約 69px，最長的「獎金提領管理」需要約 100px）。
            桌面寬度夠、等寬排列好看，所以只在 md 以上維持 grid；手機交回
            TabsList 的 flex + 橫向捲動，標籤保持完整可讀。 */}
        <TabsList className="w-full md:grid md:grid-cols-5">
          <TabsTrigger value="withdrawals">獎金提領管理</TabsTrigger>
          <TabsTrigger value="members">會員管理</TabsTrigger>
          <TabsTrigger value="announcements">公告管理</TabsTrigger>
          <TabsTrigger value="system-alerts">系統告警</TabsTrigger>
          <TabsTrigger value="admin-setup">管理員設置</TabsTrigger>
        </TabsList>

        <TabsContent value="withdrawals">
          <WithdrawalManagement
            loadWithdrawals={loadWithdrawals}
            updateStatus={updateWithdrawalStatus}
            batchMarkPaid={batchMarkPaid}
          />
        </TabsContent>

        <TabsContent value="members">
          <MemberManagement
            loadMembers={loadMembers}
            loadMemberDetail={loadMemberDetail}
            setMemberAdmin={setMemberAdmin}
            suspendMember={suspendMember}
            loadIdReviews={loadIdReviews}
            submitIdReview={submitIdReview}
          />
        </TabsContent>

        <TabsContent value="announcements">
          <SystemNotifications />
        </TabsContent>

        <TabsContent value="system-alerts">
          <SystemAlerts />
        </TabsContent>

        <TabsContent value="admin-setup">
          <AdminSetup />
        </TabsContent>
      </Tabs>
    </div>
  );
}
