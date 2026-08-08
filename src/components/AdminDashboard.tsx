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

async function loadIdReviews(params: { limit: number; offset: number }) {
  const qs = new URLSearchParams({
    status: 'pending',
    limit: String(params.limit),
    offset: String(params.offset),
  });
  const res = await apiRequestJson<AdminIdReviewsResponse>(buildApiUrl(`/admin/id-reviews?${qs}`));
  return { reviews: res.data.reviews, total: res.data.total ?? res.data.reviews.length };
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
        {/* 會員驗證是獨立路由（相機需全螢幕，且下方 Tabs 是釘死的 5 欄）——
            入口放這裡，避免變成沒有站內連結可達的孤兒頁。 */}
        <Button asChild variant="outline">
          <Link to="/admin/verify">
            <ScanLine className="mr-1 h-4 w-4" />
            會員驗證
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="withdrawals" className="w-full">
        {/* 手機排成兩列 3+2，桌面維持五欄等寬。
            **四個 class 缺一不可**——TabsList 原語的 base 是
            `inline-flex h-9 w-fit ... flex overflow-x-auto`（ui/tabs.tsx:32）:
            少了無前綴的 `grid`，grid-cols-3 對 display:flex 容器毫無作用；
            少了 `w-full`，容器縮成 w-fit 的內容寬度、三欄等分不會發生；
            少了 `h-auto`，釘死的 h-9 放不下兩列。

            實測（375px、真瀏覽器）:main 內容寬 343px，扣 TabsList 的 p-[3px]
            後三欄 track 各 112.3px，再扣 TabsTrigger 的 px-2+border 共 18px，
            可放文字 94.3px；最長標籤「獎金提領管理」實測 84px——**餘裕
            10.3px**。五欄的 track 只有 67.4px、可放文字 49.4px，這就是先前
            退回橫向捲動的原因。

            餘裕不厚而且字型跨環境會變，所以 grid 的 ink overflow（標籤畫到
            隔壁格子、元素自己的 boundingClientRect 完全正常）另有真瀏覽器
            量測把關:e2e/test_admin_mobile_layout.py 的
            test_admin_tab_labels_do_not_ink_overflow。 */}
        <TabsList className="w-full grid grid-cols-3 md:grid-cols-5 h-auto">
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
