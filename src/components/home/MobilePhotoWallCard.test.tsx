// @vitest-environment jsdom
//
// 3 欄照片牆磚的內容契約。使用者明確選擇「每格只疊 名稱 + 服務類別」，因此這裡
// 除了驗證這兩者與照片、連結，也「反向」釘住：不再顯示性別角標 / 地區 / 服務介紹，
// 避免日後有人手滑把桌面版的欄位又加回小磚上造成擁擠或溢出。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobilePhotoWallCard } from './MobilePhotoWallCard';

// vitest 未開 globals，需手動在測試間清 DOM，避免跨測試的殘留節點互相干擾。
afterEach(cleanup);

const provider = {
  id: 'a0000000-0000-0000-0000-000000000001',
  name: '測試服務者',
  category: '美髮',
  gender: '女',
  city: '台北市',
  districts: ['中山區'],
  description: '這是一段測試用的服務介紹。',
  photos: ['https://example.com/photo1.jpg'],
};

function renderCard(overrides: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <MobilePhotoWallCard serviceProvider={{ ...provider, ...overrides }} />
    </MemoryRouter>,
  );
}

describe('MobilePhotoWallCard', () => {
  it('整格是通往該服務者詳情頁的連結', () => {
    renderCard();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/service-providers/a0000000-0000-0000-0000-000000000001');
  });

  it('顯示照片（alt 為服務者名稱）、名稱與服務類別', () => {
    renderCard();
    expect(screen.getByRole('img', { name: '測試服務者' })).toBeTruthy();
    expect(screen.getByText('測試服務者')).toBeTruthy();
    expect(screen.getByText('美髮')).toBeTruthy();
  });

  it('刻意不顯示地區 / 服務介紹 / 性別（照片牆只保留名稱＋類別）', () => {
    renderCard();
    expect(screen.queryByText(/中山區/)).toBeNull();
    expect(screen.queryByText('這是一段測試用的服務介紹。')).toBeNull();
    // GenderBadge 以性別文字作為 aria-label；照片牆不渲染它
    expect(screen.queryByLabelText('女')).toBeNull();
  });

  it('長類別名稱仍以單行截斷呈現，不撐破磚塊', () => {
    renderCard({ category: '各項運動教練' });
    const tag = screen.getByText('各項運動教練');
    expect(tag.className).toContain('truncate');
  });
});
