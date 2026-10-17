// @vitest-environment jsdom
//
// 「我的 QR」入口（會員中心與推薦管理的標題列右端）的行為契約：
//   - 顯示條件與「我的 QR」頁同一把尺（myQrTabsForUser）——驗證碼分頁恆存在，
//     所以未加入、已加入推薦計畫的人都看得到；
//   - 是連到 /dashboard/qr 的連結（可長按開新分頁、可預熱），並把來源記在 state，
//     返回鍵才回得了原頁；
//   - 手機純圖示、md 起圖示＋文字，可及名稱一律「我的 QR」。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// vi.hoisted 的內容會被提到所有 import 之前執行，所以 React 要在區塊內自己
// import——用檔案頂端那個 binding 會踩到 TDZ（同 BottomNav.test.tsx）。
const { UserCtx } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return { UserCtx: createContext<{ user: MyQrTabUser | null }>({ user: null }) };
});

vi.mock('../../App', () => ({ UserContext: UserCtx }));

import { MyQrButton } from './MyQrButton';
import type { MyQrTabUser } from '../../utils/myQrTabPreference';

afterEach(cleanup);

/** 點下之後停在哪、帶了什麼 state——連結的目的地只能這樣觀察。 */
function LandedAt() {
  const loc = useLocation();
  return (
    <div data-testid="landed-at">{`${loc.pathname}|${(loc.state as { from?: string } | null)?.from ?? ''}`}</div>
  );
}

function renderButton(user: MyQrTabUser, at = '/dashboard') {
  render(
    <UserCtx.Provider value={{ user }}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/dashboard" element={<MyQrButton />} />
          <Route path="/referrals" element={<MyQrButton />} />
          <Route path="/dashboard/qr" element={<LandedAt />} />
        </Routes>
      </MemoryRouter>
    </UserCtx.Provider>,
  );
}

describe('MyQrButton', () => {
  it('未加入與已加入推薦計畫都看得到「我的 QR」', () => {
    renderButton({ referralProgramJoined: false, referralCode: null, accountStatus: 'active' });
    expect(screen.getByRole('link', { name: '我的 QR' })).toBeTruthy();
    cleanup();

    renderButton({ referralProgramJoined: true, referralCode: '8048877', accountStatus: 'active' });
    expect(screen.getByRole('link', { name: '我的 QR' })).toBeTruthy();
  });

  it('是連到我的 QR 頁的連結，沿用 e2e 依賴的 testid', () => {
    renderButton({ referralProgramJoined: true, referralCode: '8048877' });
    const link = screen.getByTestId('my-qr-button');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/dashboard/qr');
  });

  it('從推薦管理點進去時把來源記在 state，返回鍵才回得了原頁', () => {
    renderButton({ referralProgramJoined: true, referralCode: '8048877' }, '/referrals');
    fireEvent.click(screen.getByRole('link', { name: '我的 QR' }));
    expect(screen.getByTestId('landed-at').textContent).toBe('/dashboard/qr|/referrals');
  });

  it('是白底框線的次要鈕，手機只留圖示、md 起才顯示文字', () => {
    renderButton({ referralProgramJoined: true, referralCode: '8048877' });
    const link = screen.getByRole('link', { name: '我的 QR' });
    expect(link.classList.contains('bg-card')).toBe(true);
    expect(link.classList.contains('bg-brand')).toBe(false);
    const label = screen.getByText('我的 QR');
    expect(label.classList.contains('hidden')).toBe(true);
    expect(label.classList.contains('md:inline')).toBe(true);
    // 觸控裝置上純圖示鈕仍要 44px 見方（§1）。
    expect(link.className).toContain('pointer-coarse:min-w-[44px]');
    expect(link.className).toContain('pointer-coarse:min-h-[44px]');
  });
});
