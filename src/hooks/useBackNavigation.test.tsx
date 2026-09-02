// @vitest-environment jsdom
//
// 返回層級表的回歸釘。這支 hook 走的是**虛擬階層**而不是瀏覽器歷史，所以
// 「按返回會去哪」完全由 ROUTE_HIERARCHY 決定——漏一條就是靜默走錯路，
// 而在此之前它沒有任何測試。
//
// 「我的 QR」這條特別容易被誤刪：看起來像多餘的防禦性設定（父層 /dashboard
// 已經在表裡了），實際上不加的話前綴比對會先命中 '/dashboard': '/'，把人送回
// 首頁而不是會員中心。
import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useBackNavigation } from './useBackNavigation';

afterEach(cleanup);

function BackButton() {
  const handleBack = useBackNavigation();
  return (
    <button type="button" onClick={handleBack}>
      返回
    </button>
  );
}

function LandedAt() {
  return <div data-testid="landed-at">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<BackButton />} />
        <Route path="*" element={<LandedAt />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: '返回' }));
  return screen.getByTestId('landed-at').textContent;
}

describe('useBackNavigation', () => {
  it('從「我的 QR」回會員中心，不是回首頁', () => {
    expect(renderAt('/dashboard/qr')).toBe('/dashboard');
  });

  it('從會員中心回首頁', () => {
    expect(renderAt('/dashboard')).toBe('/');
  });

  it('第三層頁面回會員中心', () => {
    expect(renderAt('/referrals')).toBe('/dashboard');
  });

  it('沒有登記的路徑回首頁', () => {
    expect(renderAt('/unknown-page')).toBe('/');
  });
});
