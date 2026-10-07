// @vitest-environment jsdom
//
// 平台管理殼層。這支守的是**分頁導覽本身**，不是任何一個分頁的內容
// （那些各自有測試）。分頁列的版面是一次純 class 的事（四欄一列的 grid）——
// 最容易的失敗模式是「改了 class，但某個 TabsTrigger 在重排時被弄丟了」。
//
// ⚠️ **這支測不出版面**。jsdom 沒有排版引擎，`getBoundingClientRect` 一律回
// 0，所以「有沒有真的排成一列」「標籤有沒有畫到隔壁格子」只有真瀏覽器
// 量得到（`e2e/test_admin_mobile_layout.py`）。在這裡斷言 class 字串是套套
// 邏輯——它斷言的是實作者剛打進去的那串字，不可能為了正確的理由失敗。
// 所以本檔刻意**不驗版面 class**，只驗「四個分頁都在、都切得動」這個結構事實，
// 以及分頁名稱的契約（下方 TABS 的註解）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { AdminWithdrawalRecord } from '@contract';
import { NotificationProvider } from './notifications/NotificationContext';
import { stubMediaQuery } from '../test-utils/stubMediaQuery';

// AdminDashboard 掛載時 Radix 只渲染 active 的那個 TabsContent，但那一個
// （提領管理）會打 API。整個網路層替身掉，讓這支專心測導覽。
vi.mock('../utils/apiClient', () => ({
  // alerts:[] 給系統告警分頁——它對形狀不合的回應顯示錯誤態（不退回空清單）。
  apiRequestJson: vi.fn(async () => ({ data: { items: [], total: 0, alerts: [] } })),
  buildApiUrl: (p: string) => p,
}));

// AdminDashboard 讀 UserContext（以 user.id 為 key 掛分頁區，S5 階段 7）。替身沿用 repo 慣例
// （MyQrPage.test.tsx）：預設 context 帶 user.id，既有的 renderDashboard() 不必包 provider。
// vi.hoisted 的內容會被提到所有 import 之前執行，React 要在區塊內自己 import。
const { UserCtx } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<Record<string, unknown>>({
      user: { id: 'admin-1' },
      isLoggedIn: true,
      isAdmin: true,
      isLoadingUser: false,
    }),
  };
});
vi.mock('../App', () => ({ UserContext: UserCtx }));

import { apiRequestJson } from '../utils/apiClient';
import { AdminDashboard } from './AdminDashboard';
import { AdminRoute } from './AdminRoute';

// 每個分頁兩個名字：畫面上看得到的二字，與無障礙名稱（螢幕閱讀器念的、e2e
// 與 journey 用 `get_by_role("tab", name=…)` 找分頁靠的）。二字是為了讓四個
// 分頁在 375px 排成一列；完整名稱不跟著縮，是因為 journey 只在晉升 PR 上跑，
// 名稱漂掉要到那時才紅（寫法見 ui-ux-guidelines §9）。
const TABS = [
  { name: '獎金提領管理', visible: '提領' },
  { name: '會員管理', visible: '會員' },
  { name: '系統公告', visible: '公告' },
  { name: '系統告警', visible: '告警' },
];
const TAB_LABELS = TABS.map((t) => t.name);

// 看得到的字＝拿掉 sr-only 補字之後剩下的文字。
function visibleText(el: HTMLElement) {
  const clone = el.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll('.sr-only')) hidden.remove();
  return clone.textContent;
}

afterEach(cleanup);

beforeEach(() => {
  stubMediaQuery(true);
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
});

function renderDashboard() {
  // 切到公告／告警分頁會掛載讀 useNotification 的元件，
  // 少了 provider 會在切換的當下才炸——而那個紅燈與導覽本身無關。
  return render(
    <MemoryRouter>
      <NotificationProvider>
        <AdminDashboard />
      </NotificationProvider>
    </MemoryRouter>,
  );
}

describe('平台管理的分頁導覽', () => {
  it('四個分頁都以完整名稱找得到', () => {
    renderDashboard();
    for (const label of TAB_LABELS) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    }
  });

  it('畫面上只看得到二字標籤，其餘字只給螢幕閱讀器', () => {
    renderDashboard();
    for (const { name, visible } of TABS) {
      expect(visibleText(screen.getByRole('tab', { name }))).toBe(visible);
    }
  });

  it('管理員設置分頁已移除——第一位管理員改走 API（supabase-setup-checklist 步驟 7）', () => {
    renderDashboard();
    expect(screen.queryByRole('tab', { name: /管理員設置/ })).toBeNull();
  });

  it('四個分頁都切得動——切過去之後該分頁是 active', () => {
    renderDashboard();
    for (const label of TAB_LABELS) {
      const tab = screen.getByRole('tab', { name: label });
      fireEvent.mouseDown(tab);
      expect(tab.getAttribute('data-state')).toBe('active');
    }
  });

  it('沒有第五個分頁——§13 的四欄判準不得被悄悄擴充', () => {
    renderDashboard();
    expect(screen.getAllByRole('tab')).toHaveLength(TAB_LABELS.length);
  });
});

// 「會員驗證」捷徑改連到會員區的「我的 QR」頁（掃描已不是 admin 專屬功能）。
// 這顆按鈕的目的地從來沒有被任何測試守過——href 改錯不會有人發現，而 state
// 更不會反映在 href 上：漏帶 state.from 的症狀是掃完按返回落到會員中心，
// 管理員得再點一次才回得了後台。
describe('會員驗證捷徑', () => {
  function LandedAt() {
    const loc = useLocation();
    return (
      <div data-testid="landed-at">{`${loc.search}|${(loc.state as { from?: string } | null)?.from ?? ''}`}</div>
    );
  }

  it('點下去落在掃描分頁，並把來源記成管理後台', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <NotificationProvider>
          <Routes>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/dashboard/qr" element={<LandedAt />} />
          </Routes>
        </NotificationProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /會員驗證/ }));
    expect(screen.getByTestId('landed-at').textContent).toBe('?tab=scan|/admin');
  });
});

// --- S5 階段 7：以 user.id 為 key 的分頁區與記憶體快取 --------------------------------------
//
// 殼層的效果只有組起來才看得見：切走再切回不出骨架（快取在分頁區、不在分頁裡），離開
// /admin 或換人之後重新出骨架（store 隨分頁區卸載而清空、以 user.id 為 key 重掛）。本檔不在
// admin/ 內，不 import admin 模組（組裝邊界契約），以畫面與 API 呼叫觀察。
describe('平台管理的記憶體快取', () => {
  const api = vi.mocked(apiRequestJson);

  // 提領列帶未遮罩的身分證字號與銀行帳號——正是不准落地的那種資料。
  const ROW: AdminWithdrawalRecord = {
    id: 'w1',
    userId: 'u1',
    userName: '王小明',
    userPhone: '0912345678',
    idNumber: 'A123456789',
    amount: 1000,
    fee: 15,
    status: 'pending',
    bankCode: '822',
    bankAccount: '1234567890123',
    note: null,
    events: [],
    requestedAt: '2026-08-01T02:00:00Z',
    processedAt: null,
    completedAt: null,
    idCardFrontUrl: null,
    idCardBackUrl: null,
  };
  const WITHDRAWALS = {
    success: true,
    data: {
      withdrawals: [ROW],
      total: 1,
      limit: 50,
      offset: 0,
      stats: {
        pendingAmount: 1000,
        byStatus: { pending: 1, awaiting_collection: 0, completed: 0, rejected: 0 },
      },
    },
  };
  const OTHERS = {
    success: true,
    data: { items: [], members: [], announcements: [], alerts: [], reviews: [], total: 0 },
  };

  /** 提領的 GET 由 `withdrawals` 決定（預設回一列），其餘分頁回空。 */
  function serve(withdrawals: () => Promise<unknown> = async () => WITHDRAWALS) {
    api.mockImplementation(async (url: unknown) =>
      String(url).startsWith('/admin/withdrawals') ? withdrawals() : OTHERS,
    );
  }
  const held = () => serve(() => new Promise(() => {}));
  const withdrawalReads = () =>
    api.mock.calls.filter(([url]) => String(url).startsWith('/admin/withdrawals')).length;
  const rowShown = () => screen.queryByRole('row', { name: /王小明/ });
  const skeleton = () => screen.queryByRole('status', { name: '載入提領申請中' });
  const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }));

  type Session = { user: { id: string } | null; isLoggedIn: boolean; isAdmin: boolean };
  const ADMIN_1: Session = { user: { id: 'admin-1' }, isLoggedIn: true, isAdmin: true };
  const harness = {
    setSession: (_: Session) => {},
    navigate: (_: string) => {},
  };

  // 真的 AdminRoute：登出導去 /login、失去管理員導去 /dashboard——卸載走的是正式路徑。
  function Harness() {
    const [session, setSession] = useState(ADMIN_1);
    const navigate = useNavigate();
    harness.setSession = setSession;
    harness.navigate = navigate;
    return (
      <UserCtx.Provider value={{ ...session, isLoadingUser: false }}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route path="/login" element={<p>登入頁</p>} />
          <Route path="/dashboard" element={<p>會員中心</p>} />
        </Routes>
      </UserCtx.Provider>
    );
  }

  function renderAdminRoute() {
    return render(
      <MemoryRouter initialEntries={['/admin']}>
        <NotificationProvider>
          <Harness />
        </NotificationProvider>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    // 呼叫紀錄只算本條：同檔前面的導覽測試各讀過一次提領、沒有清。
    api.mockClear();
  });
  afterEach(() => {
    // 還原 vi.fn 的預設實作（前面的導覽測試靠它）。
    api.mockReset();
  });

  it('切走再切回提領不出骨架，照舊重讀一次', async () => {
    serve();
    renderAdminRoute();
    expect(await screen.findByRole('row', { name: /王小明/ })).toBeTruthy();

    openTab('系統公告');
    openTab('獎金提領管理');
    expect(skeleton()).toBeNull();
    expect(rowShown()).toBeTruthy();
    await waitFor(() => expect(withdrawalReads()).toBe(2));
  });

  async function leaveAndReturn(away: Session, landing: string) {
    serve();
    renderAdminRoute();
    await screen.findByRole('row', { name: /王小明/ });

    act(() => harness.setSession(away));
    expect(await screen.findByText(landing)).toBeTruthy();

    held();
    act(() => {
      harness.setSession(ADMIN_1);
      harness.navigate('/admin');
    });
    expect(skeleton()).toBeTruthy();
    expect(rowShown()).toBeNull();
  }

  it('登出被導走後再回來，提領重新出骨架', async () => {
    await leaveAndReturn({ user: null, isLoggedIn: false, isAdmin: false }, '登入頁');
  });

  it('失去管理員被導走後再回來，提領重新出骨架', async () => {
    await leaveAndReturn({ user: { id: 'admin-1' }, isLoggedIn: true, isAdmin: false }, '會員中心');
  });

  it('同一頁直接換成另一位管理員時，不顯示前一位讀到的資料', async () => {
    serve();
    renderAdminRoute();
    await screen.findByRole('row', { name: /王小明/ });

    held();
    act(() => harness.setSession({ user: { id: 'admin-2' }, isLoggedIn: true, isAdmin: true }));
    expect(rowShown()).toBeNull();
    expect(skeleton()).toBeTruthy();
  });

  it('user 為 null 時照常渲染四個分頁', () => {
    render(
      <MemoryRouter>
        <NotificationProvider>
          <UserCtx.Provider value={{ user: null, isLoggedIn: false, isAdmin: false }}>
            <AdminDashboard />
          </UserCtx.Provider>
        </NotificationProvider>
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(TAB_LABELS.length);
  });

  it('讀取、切分頁、切回、登出的全流程不呼叫 Storage 的 setItem', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      serve();
      const { unmount } = renderAdminRoute();
      await screen.findByRole('row', { name: /王小明/ });
      for (const name of ['會員管理', '系統公告', '系統告警', '獎金提領管理']) openTab(name);
      await waitFor(() => expect(withdrawalReads()).toBe(2));
      act(() => harness.setSession({ user: null, isLoggedIn: false, isAdmin: false }));
      await screen.findByText('登入頁');
      unmount();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });
});
