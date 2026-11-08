// @vitest-environment jsdom
//
// 換篇手勢 chunk 載入失敗時的降級（W5-69 / #509 P2-c）：動態 import 拒絕不得讓整個詳情頁掉到
// 路由層錯誤頁；頁面與「‹ ›」按鈕照常，只是少了滑動與鍵盤（靜默降級，只寫 console.error）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CHUNK_RELOADED_KEY } from '../utils/lazyWithRetry';
import type { PublicListingRow } from '../types/listing';

const { singleFor } = vi.hoisted(() => ({
  singleFor: vi.fn<(id: string) => Promise<{ data: PublicListingRow | null; error: null }>>(),
}));

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: (_c: string, id: string) => ({ single: () => singleFor(id) }) }),
    }),
  }),
}));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));
// 讓動態 import 本身失敗（而不是把 importWithRetry 整個換掉），才看得到它的重載自癒有沒有被觸發。
vi.mock('./listing/BrowseGestures', () => {
  throw new Error('chunk 載入失敗');
});

import { ServiceProviderDetailRoute } from './ServiceProviderDetailRoute';
import {
  freezeBrowseContext,
  resetHomeListingsCache,
  setCachedListings,
} from '../utils/homeListingsCache';

const mk = (id: string, name: string): PublicListingRow => ({
  id,
  user_id: `u-${id}`,
  name,
  category: '美容',
  city: '台北市',
  districts: ['大安區'],
  gender: '女',
  photos: [`https://example.com/${id}.jpg`],
  contacts: { line: 'cara_line' },
  description: `${name}的介紹`,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});
const ROWS = [mk('a', 'AAA美容師'), mk('b', 'BBB美容師')];

beforeEach(() => {
  window.sessionStorage.removeItem(CHUNK_RELOADED_KEY);
  resetHomeListingsCache();
  singleFor.mockImplementation(async (id) => ({
    data: ROWS.find((r) => r.id === id) ?? null,
    error: null,
  }));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  setCachedListings(ROWS);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDetail() {
  const ctx = freezeBrowseContext(
    ROWS.map((r) => r.id),
    'a',
  );
  return render(
    <MemoryRouter
      initialEntries={[
        '/',
        { pathname: '/service-providers/a', state: { browseFrom: 'home', ctx } },
      ]}
      initialIndex={1}
    >
      <Routes>
        <Route path="/" element={<p>首頁內容</p>} />
        <Route path="/service-providers/:id" element={<ServiceProviderDetailRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ServiceProviderDetail 手勢 chunk 載入失敗', () => {
  it('詳情內容與換篇按鈕照常顯示，錯誤只寫 console.error，且不整頁重載', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDetail();
    await screen.findByRole('heading', { name: 'AAA美容師' });
    // 邊界接到錯誤時，importWithRetry 的重試與重載判斷都已走完。
    await waitFor(() => expect(error).toHaveBeenCalled());

    expect(screen.getByRole('heading', { name: 'AAA美容師' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '下一篇' })).toBeTruthy();
    // 要整頁重載時 importWithRetry 會先寫下這個記號；換篇脈絡只在記憶體，重載會讓「‹ n/N ›」整組消失。
    expect(window.sessionStorage.getItem(CHUNK_RELOADED_KEY)).toBeNull();
  });

  it('手勢不可用時仍能用按鈕換到下一篇', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDetail();
    await screen.findByRole('heading', { name: 'AAA美容師' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.click(screen.getByRole('button', { name: '下一篇' }));

    expect(await screen.findByRole('heading', { name: 'BBB美容師' })).toBeTruthy();
  });
});
