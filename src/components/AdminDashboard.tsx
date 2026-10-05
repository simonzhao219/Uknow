import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { WithdrawalManagement } from './admin/WithdrawalManagement';
import { MemberManagement } from './admin/MemberManagement';
import { SystemNotifications } from './admin/SystemNotifications';
import { SystemAlerts } from './admin/SystemAlerts';
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

// 分頁的兩個名字：畫面上的二字（四欄一列放得下），與完整的無障礙名稱。
const ADMIN_TABS = [
  { value: 'withdrawals', visible: '提領', name: '獎金提領管理' },
  { value: 'members', visible: '會員', name: '會員管理' },
  { value: 'announcements', visible: '公告', name: '系統公告' },
  { value: 'system-alerts', visible: '告警', name: '系統告警' },
] as const;

// 完整名稱整串放在一個 sr-only 節點、由 TabsTrigger 的 aria-labelledby 指過來，
// 而不是把缺的字拆成幾段 sr-only 補在二字前後：sr-only 是 position:absolute，
// Chromium 計算名稱時會把它當區塊、在前後插空白，「會員<sr-only>管理」念成
// 「會員 管理」，`get_by_role(name="會員管理")` 就找不到了（jsdom 不排版，
// vitest 抓不到，只有真瀏覽器的 e2e 會紅）。也不用 aria-label——名稱寫在屬性
// 裡，跟畫面上的字分屬兩處，改了一處另一處不會有任何東西提醒你；這裡兩個
// 名字並排在同一份資料裡。可見字一律是名稱的子字串（WCAG 2.5.3）。
function AdminTabLabel({ id, visible, name }: { id: string; visible: string; name: string }) {
  return (
    <>
      {visible}
      <span id={id} className="sr-only">
        {name}
      </span>
    </>
  );
}

export function AdminDashboard() {
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

      <Tabs defaultValue="withdrawals" className="w-full">
        {/* 手機與桌面都是四欄一列。
            **四個 class 缺一不可**——TabsList 原語的 base 是
            `inline-flex h-9 w-fit ... flex overflow-x-auto`（ui/tabs.tsx:32）:
            少了無前綴的 `grid`，grid-cols-4 對 display:flex 容器毫無作用；
            少了 `w-full`，容器縮成 w-fit 的內容寬度、四欄等分不會發生；
            少了 `h-auto`，釘死的 h-9 撐不出下面補的 44px。

            一列成立靠的是**可見標籤只有二字**。實測（375px）:四欄 track 各
            84.25px，扣 TabsTrigger 的 px-2+border 共 18px，可放文字約 66px；
            二字 `text-sm` 約 28px。原本的「獎金提領管理」要 84px，四欄放不下
            ——那是過去只能排成 3+2 兩列的原因。320px 下可放文字仍有約 52px。
            真瀏覽器量測把關:e2e/test_admin_mobile_layout.py 的一列、ink
            overflow 與 320px 三條。

            **無障礙名稱維持完整**（獎金提領管理／會員管理／系統公告／系統告警，
            見下方 AdminTabLabel）:e2e 與 journey 都以
            `get_by_role("tab", name=…)` 找分頁——journey 只在晉升 PR 上跑，
            名稱漂掉要到那時才紅。

            `h-auto` 的代價是格子高度完全由內容決定——原語的 `py-1` ＋
            `text-sm` 只撐得出 30px，低於 §1 的 44px。分頁列是這一頁最上層
            的導覽，按它的頻率高於卡片上的任何一顆按鈕，所以在這裡補回來。
            **只補在 admin、不動 `ui/tabs.tsx` 基底**:比照 checkbox 與
            CardOverflowMenu 的先例，改基底會連帶把會員中心、獎勵頁等所有
            分頁列各加 14px，那是範圍外的視覺變更。
            寫在 TabsList 而不是四顆 TabsTrigger 上:同一條規則貼四次，
            日後加第五個分頁時漏貼不會有任何東西提醒你。 */}
        <TabsList className="w-full grid grid-cols-4 h-auto pointer-coarse:[&>[role=tab]]:min-h-[44px]">
          {ADMIN_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              aria-labelledby={`admin-tab-${tab.value}`}
            >
              <AdminTabLabel id={`admin-tab-${tab.value}`} {...tab} />
            </TabsTrigger>
          ))}
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
      </Tabs>
    </div>
  );
}
