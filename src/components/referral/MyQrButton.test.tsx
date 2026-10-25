// @vitest-environment jsdom
//
// 「我的 QR」入口（會員中心與推薦管理的標題列右端）的行為契約：
//   - 不讀會員資料、不另做顯示判斷：兩頁與 /dashboard/qr 在同一道
//     RequireMembershipRoute 後面，進得了頁就看得到；
//   - 是連到 /dashboard/qr 的連結（可長按開新分頁、可預熱），並把來源記在 state，
//     返回鍵才回得了原頁；
//   - 手機純圖示、md 起圖示＋文字，可及名稱一律「我的 QR」。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { findForbiddenWord } from '@recruitment-copy';
import { MyQrButton } from './MyQrButton';

afterEach(cleanup);

/** 點下之後停在哪、帶了什麼 state——連結的目的地只能這樣觀察。 */
function LandedAt() {
  const loc = useLocation();
  return (
    <div data-testid="landed-at">{`${loc.pathname}|${(loc.state as { from?: string } | null)?.from ?? ''}`}</div>
  );
}

function renderButton(at = '/dashboard') {
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/dashboard" element={<MyQrButton />} />
        <Route path="/referrals" element={<MyQrButton />} />
        <Route path="/dashboard/qr" element={<LandedAt />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MyQrButton', () => {
  it('是連到我的 QR 頁的連結，沿用 e2e 依賴的 testid', () => {
    renderButton();
    const link = screen.getByTestId('my-qr-button');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/dashboard/qr');
  });

  it('從推薦管理點進去時把來源記在 state，返回鍵才回得了原頁', () => {
    renderButton('/referrals');
    fireEvent.click(screen.getByRole('link', { name: '我的 QR' }));
    expect(screen.getByTestId('landed-at').textContent).toBe('/dashboard/qr|/referrals');
  });

  it('是白底框線的次要鈕，手機只留圖示、md 起才顯示文字', () => {
    renderButton();
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

  it('入口的文字與屬性都不含招募禁用字樣', () => {
    renderButton();
    // innerHTML 連 aria-label、title 一起看：讀屏念得到的也是使用者看得到的文案。
    expect(findForbiddenWord(document.body.innerHTML)).toBeUndefined();
  });
});
