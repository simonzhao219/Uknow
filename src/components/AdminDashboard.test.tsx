// @vitest-environment jsdom
//
// 平台管理殼層。這支守的是**分頁導覽本身**，不是任何一個分頁的內容
// （那些各自有測試）。階段 1 要把 TabsList 從「手機橫向捲動」改成「兩列
// grid」，而那是一次純 class 的改動——最容易的失敗模式是「改了 class，
// 但某個 TabsTrigger 在重排時被弄丟了」。
//
// ⚠️ **這支測不出版面**。jsdom 沒有排版引擎，`getBoundingClientRect` 一律回
// 0，所以「有沒有真的排成兩列」「標籤有沒有畫到隔壁格子」只有真瀏覽器
// 量得到（`e2e/test_admin_mobile_layout.py`）。在這裡斷言 class 字串是套套
// 邏輯——它斷言的是實作者剛打進去的那串字，不可能為了正確的理由失敗。
// 所以本檔刻意**不驗版面 class**，只驗「四個分頁都在、都切得動」這個結構事實，
// 以及分頁名稱的契約（下方 TABS 的註解）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NotificationProvider } from './notifications/NotificationContext';
import { stubMediaQuery } from '../test-utils/stubMediaQuery';

// AdminDashboard 掛載時 Radix 只渲染 active 的那個 TabsContent，但那一個
// （提領管理）會打 API。整個網路層替身掉，讓這支專心測導覽。
vi.mock('../utils/apiClient', () => ({
  apiRequestJson: vi.fn(async () => ({ data: { items: [], total: 0 } })),
  buildApiUrl: (p: string) => p,
}));

import { AdminDashboard } from './AdminDashboard';

// 每個分頁兩個名字：畫面上看得到的二字，與無障礙名稱（螢幕閱讀器念的、e2e
// 與 journey 用 `get_by_role("tab", name=…)` 找分頁靠的）。二字是為了讓四個
// 分頁在 375px 排成一列；完整名稱不跟著縮，是因為 journey 只在晉升 PR 上跑，
// 名稱漂掉要到那時才紅（規劃 admin-ia-refactor R1）。
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

  it('管理員設置分頁已移除——第一位管理員改走 API（規劃 Q1）', () => {
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
    return <div data-testid="landed-at">{`${loc.search}|${(loc.state as any)?.from ?? ''}`}</div>;
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
