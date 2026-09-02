// @vitest-environment jsdom
//
// 「我的 QR」頁的組合契約。三個分頁各自的內容都有自己的測試（邀請卡繪圖、取碼
// 輪替、掃碼迴圈），這裡替身掉，只驗這一頁自己決定的事：**哪些分頁存在、開頁
// 停在哪一頁、切換之後記住什麼、返回鍵回到哪裡**。
//
// 證據等級是 e2e/README 的 B 級：分頁可用性與優先序的決策已由
// myQrTabPreference.test.ts（純函式）涵蓋，這裡驗的是「那個決策真的被接進元件」
// ——decision 有測 ≠ decision 被接上，那正是 B 級要求補的那一段。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MY_QR_TAB_KEY } from '../utils/myQrTabPreference';

// vi.hoisted 的內容會被提到所有 import 之前執行，所以 React 要在區塊內自己
// import——用檔案頂端那個 binding 會踩到 TDZ（同 MyQrEntry.test.tsx）。
const { UserCtx } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return { UserCtx: createContext<any>({ user: null }) };
});
vi.mock('../App', () => ({ UserContext: UserCtx }));

vi.mock('./referral/InviteFriendPanelContent', () => ({
  InviteFriendPanelContent: () => <div data-testid="invite-content" />,
}));
vi.mock('./referral/MemberVerifyQrTab', () => ({
  MemberVerifyQrTab: () => <div data-testid="verify-content" />,
}));
vi.mock('./referral/MemberVerifyScanner', () => ({
  MemberVerifyScanner: () => <div data-testid="scan-content" />,
}));

import { MyQrPage } from './MyQrPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** 離開 /dashboard/qr 之後停在哪：返回鍵的目的地只能這樣觀察。 */
function LandedAt() {
  return <div data-testid="landed-at">{useLocation().pathname}</div>;
}

const FULL_MEMBER = {
  name: '小明',
  isAdmin: false,
  accountStatus: 'active' as const,
  referralProgramJoined: true,
  referralCode: 'UK8K3M9Q2X',
};

function renderPage(user: any, opts: { search?: string; from?: string | null } = {}) {
  render(
    <UserCtx.Provider value={{ user }}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/dashboard/qr',
            search: opts.search ?? '',
            state: opts.from === undefined ? null : { from: opts.from },
          },
        ]}
      >
        <Routes>
          <Route path="/dashboard/qr" element={<MyQrPage />} />
          <Route path="*" element={<LandedAt />} />
        </Routes>
      </MemoryRouter>
    </UserCtx.Provider>,
  );
}

function tabNames() {
  return screen.queryAllByRole('tab').map((t) => t.textContent);
}

describe('MyQrPage', () => {
  describe('分頁組合（available.invite × canScan 四格）', () => {
    it('已加入推薦計畫且會籍有效時三個分頁都在，預設停在邀請好友', () => {
      renderPage(FULL_MEMBER);
      expect(tabNames()).toEqual(['邀請好友', '會員驗證碼', '掃描驗證']);
      expect(screen.getByTestId('invite-content')).toBeTruthy();
    });

    it('未加入推薦計畫時只有驗證碼與掃描，沒有邀請分頁', () => {
      renderPage({ ...FULL_MEMBER, referralProgramJoined: false, referralCode: null });
      expect(tabNames()).toEqual(['會員驗證碼', '掃描驗證']);
    });

    it('已加入但會籍失效時只有邀請與驗證碼，掃描分頁不存在', () => {
      // 掃描別人要求掃描者自己會籍有效（後端同一把尺），前端不先給假的入口。
      renderPage({ ...FULL_MEMBER, accountStatus: 'expired' });
      expect(tabNames()).toEqual(['邀請好友', '會員驗證碼']);
    });

    it('已加入但推薦碼尚未產生時不給邀請分頁（不印假碼的同一條規則）', () => {
      renderPage({ ...FULL_MEMBER, referralCode: null });
      expect(tabNames()).toEqual(['會員驗證碼', '掃描驗證']);
    });

    it('只剩驗證碼一個分頁時不畫分頁列（單一分頁的頁籤沒有意義）', () => {
      renderPage({
        ...FULL_MEMBER,
        referralProgramJoined: false,
        referralCode: null,
        accountStatus: 'expired',
      });
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      expect(screen.getByTestId('verify-content')).toBeTruthy();
    });

    it('管理員沒有會籍也掃得到（與路由守衛的 isAdmin 放行一致）', () => {
      renderPage({
        ...FULL_MEMBER,
        isAdmin: true,
        accountStatus: 'expired',
        referralProgramJoined: false,
        referralCode: null,
      });
      expect(tabNames()).toEqual(['會員驗證碼', '掃描驗證']);
    });
  });

  describe('開頁停在哪一頁', () => {
    it('URL 帶 ?tab=scan 時直接停在掃描分頁（管理後台捷徑的深連結）', () => {
      renderPage(FULL_MEMBER, { search: '?tab=scan' });
      expect(screen.getByTestId('scan-content')).toBeTruthy();
    });

    it('URL 指定的分頁不存在時靜默落回，不是空白畫面', () => {
      renderPage({ ...FULL_MEMBER, accountStatus: 'expired' }, { search: '?tab=scan' });
      expect(screen.getByTestId('invite-content')).toBeTruthy();
    });

    it('URL 指定勝過記住的偏好', () => {
      localStorage.setItem(MY_QR_TAB_KEY, 'invite');
      renderPage(FULL_MEMBER, { search: '?tab=verify' });
      expect(screen.getByTestId('verify-content')).toBeTruthy();
    });

    it('沒有 URL 指定時停在上次選過的分頁', () => {
      localStorage.setItem(MY_QR_TAB_KEY, 'verify');
      renderPage(FULL_MEMBER);
      expect(screen.getByTestId('verify-content')).toBeTruthy();
    });

    it('切換分頁後把選擇記起來，下次開頁才停得回去', () => {
      renderPage(FULL_MEMBER);
      // mouseDown 而非 click：Radix 的 TabsTrigger 聽的是 onMouseDown，
      // click 事件不含 mousedown，那一下根本進不到元件（同 AdminDashboard.test）。
      fireEvent.mouseDown(screen.getByTestId('scan-tab'));
      expect(localStorage.getItem(MY_QR_TAB_KEY)).toBe('scan');
    });
  });

  describe('返回鍵的目的地', () => {
    it('從推薦管理進來就回推薦管理，不把人丟回會員中心', () => {
      // 對話框時代關掉就留在原頁（推薦樹的展開與捲動位置都還在）；改成獨立頁
      // 之後若一律回 /dashboard，那份瀏覽情境就沒了。
      renderPage(FULL_MEMBER, { from: '/referrals' });
      fireEvent.click(screen.getByRole('button', { name: '返回上一頁' }));
      expect(screen.getByTestId('landed-at').textContent).toBe('/referrals');
    });

    it('從管理後台的捷徑進來就回管理後台', () => {
      renderPage(FULL_MEMBER, { from: '/admin' });
      fireEvent.click(screen.getByRole('button', { name: '返回上一頁' }));
      expect(screen.getByTestId('landed-at').textContent).toBe('/admin');
    });

    it('直接貼網址進來（沒有來源）時回會員中心', () => {
      renderPage(FULL_MEMBER);
      fireEvent.click(screen.getByRole('button', { name: '返回上一頁' }));
      expect(screen.getByTestId('landed-at').textContent).toBe('/dashboard');
    });

    it('來源不在白名單內時不採用，一樣回會員中心', () => {
      // state 是呼叫端塞的字串，不該讓它決定使用者被導去哪裡。
      renderPage(FULL_MEMBER, { from: 'https://evil.example/phish' });
      fireEvent.click(screen.getByRole('button', { name: '返回上一頁' }));
      expect(screen.getByTestId('landed-at').textContent).toBe('/dashboard');
    });
  });

  describe('版面與鍵盤', () => {
    it('副標在手機隱藏，第一屏留給 QR 與取景框', () => {
      renderPage(FULL_MEMBER);
      const subtitle = screen.getByText('邀請好友、出示驗證碼、掃描驗證');
      expect(subtitle.className).toContain('hidden');
      expect(subtitle.className).toContain('sm:block');
    });

    it('三個分頁時圖示在手機隱藏，讓最長的標籤放得下', () => {
      // 375px 下每格可放約 94px，「會員驗證碼」＋圖示＋間距約 92px——餘裕 2px
      // 不可靠。grid 的格子寬度鎖死，放不下是畫到隔壁格（ink overflow），
      // 一般溢版巡檢抓不到，所以寧可先讓圖示退場。
      renderPage(FULL_MEMBER);
      expect(
        screen.getByTestId('verify-tab').querySelector('svg')?.getAttribute('class'),
      ).toContain('sm:inline');
    });

    it('只有兩個分頁時圖示照常顯示（不必陪三分頁一起降級）', () => {
      renderPage({ ...FULL_MEMBER, accountStatus: 'expired' });
      expect(
        screen.getByTestId('verify-tab').querySelector('svg')?.getAttribute('class'),
      ).not.toContain('sm:inline');
    });

    it('鍵盤在分頁間移動焦點不會直接切換面板（相機不會被誤啟動）', () => {
      // Radix Tabs 預設 activationMode="automatic"：方向鍵移到哪就切到哪。
      // 疊上「切到掃描分頁就開相機」，只是想瀏覽分頁的鍵盤使用者會被原生
      // 權限對話框打斷。
      renderPage(FULL_MEMBER);
      const inviteTab = screen.getByTestId('invite-tab');
      inviteTab.focus();
      fireEvent.keyDown(inviteTab, { key: 'ArrowRight' });

      expect(screen.getByTestId('invite-content')).toBeTruthy();
      expect(screen.queryByTestId('verify-content')).toBeNull();
    });
  });
});
