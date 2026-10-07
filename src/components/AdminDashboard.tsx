import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { Button } from './ui/button';
import { UserContext } from '../App';
import { AdminConsole, type AdminConsoleProps } from './admin/AdminConsole';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';
import type {
  AdminIdReviewsResponse,
  AdminMemberDetailResponse,
  AdminMembersResponse,
  AdminWithdrawalsResponse,
} from '@contract';
import type { WithdrawalQuery } from './admin/WithdrawalManagement';

// 取數／送出走這裡、畫面只吃 props——與 MemberManagement 餵 IdReviewQueue
// 的作法一致：元件測試才不用替身掉整個網路層。取數函式經 AdminConsole 往下傳；
// 後台的記憶體快取 store 由 AdminConsole 建立、以 props 注入（S5）。
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

// 模組常數：身分穩定，AdminConsole 往下傳時不會每次 render 都換新。
const WITHDRAWAL_API: AdminConsoleProps['withdrawals'] = {
  loadWithdrawals,
  updateStatus: updateWithdrawalStatus,
  batchMarkPaid,
};

const MEMBER_API: AdminConsoleProps['members'] = {
  loadMembers,
  loadMemberDetail,
  setMemberAdmin,
  suspendMember,
  loadIdReviews,
  submitIdReview,
};

export function AdminDashboard() {
  // 分頁區以使用者為 key：換成另一位管理員（同一頁直接 SIGNED_IN 不同 id）時整個重掛，快取與
  // 各分頁的 state 一併換新。AdminRoute 保證有 user；null 時以空字串當 key，不崩。
  const { user } = useContext(UserContext);
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">平台管理</h1>
          {/* 副標在手機隱藏:它沒有可操作的資訊，而第一屏的每一像素都該
              留給工作內容（見 e2e 的 first_screen_position 斷言）。 */}
          <p className="hidden sm:block text-muted-foreground">管理 Uknow 平台的所有功能</p>
        </div>
        {/* 掃描已不是 admin 專屬功能，入口搬到會員區的「我的 QR」頁；這顆捷徑
            保留，因為管理員平常就在後台工作，少走「會員中心 → 我的 QR → 掃描」
            三步。state.from 讓掃完按返回回得了這裡。 */}
        <Button asChild tone="secondary">
          <Link to="/dashboard/qr?tab=scan" state={{ from: '/admin' }}>
            <ScanLine className="mr-1 h-4 w-4" />
            會員驗證
          </Link>
        </Button>
      </div>

      <AdminConsole key={user?.id ?? ''} withdrawals={WITHDRAWAL_API} members={MEMBER_API} />
    </div>
  );
}
