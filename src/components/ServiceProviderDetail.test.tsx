// @vitest-environment jsdom
//
// 服務者詳情頁是訪客（P1）唯一的關鍵路徑，而且常從 LINE 分享連結直接進來。
// 這裡釘住三態：骨架 → 資料、查無此刊登、暫時讀不到（給重試，不能說「找不到」），
// 以及「站內沒有上一頁時，返回回首頁」。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicListingRow } from '../types/listing';

type SingleResult = {
  data: PublicListingRow | null;
  error: { code: string; message: string } | null;
};

const { single, showToast } = vi.hoisted(() => ({
  single: vi.fn<() => Promise<SingleResult>>(),
  showToast: vi.fn(),
}));

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast }),
}));

import { ServiceProviderDetail } from './ServiceProviderDetail';

const LISTING_ID = '11111111-1111-1111-1111-111111111111';

const listing: PublicListingRow = {
  id: LISTING_ID,
  user_id: 'u1',
  name: 'Cara 美容師',
  category: '美容',
  city: '台北市',
  districts: ['大安區'],
  gender: '女',
  photos: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
  contacts: { line: 'cara_line' },
  description: '專業臉部保養與清潔',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

function deferred() {
  let resolve!: (r: SingleResult) => void;
  const promise = new Promise<SingleResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/" element={<p>首頁內容</p>} />
        <Route path="/from" element={<p>上一頁內容</p>} />
        <Route path="/service-providers/:id" element={<ServiceProviderDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const detailPath = `/service-providers/${LISTING_ID}`;

beforeEach(() => {
  single.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ServiceProviderDetail', () => {
  it('載入中顯示詳情骨架，資料到位後換成刊登內容', async () => {
    const pending = deferred();
    single.mockReturnValueOnce(pending.promise);
    renderAt([detailPath]);

    const skeleton = screen.getByRole('status', { name: '載入服務者詳情中' });
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('載入中...')).toBeNull();

    await act(async () => pending.resolve({ data: listing, error: null }));

    expect(screen.queryByRole('status', { name: '載入服務者詳情中' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Cara 美容師' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '服務介紹' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '聯絡方式' })).toBeTruthy();
  });

  it('查無此刊登（PGRST116）時顯示找不到與返回首頁', async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: '0 rows' } });
    renderAt([detailPath]);

    expect(await screen.findByRole('heading', { name: '找不到此服務者' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '返回首頁' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });

  it('id 不是合法 uuid（22P02，分享連結被截斷）時視為找不到', async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: '22P02', message: 'invalid uuid' } });
    renderAt(['/service-providers/1111-cut']);

    expect(await screen.findByRole('heading', { name: '找不到此服務者' })).toBeTruthy();
  });

  it('網路或伺服器失敗時顯示讀取失敗與重試，不說找不到', async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Failed to fetch' } });
    renderAt([detailPath]);

    expect(await screen.findByRole('heading', { name: '暫時無法載入服務者資料' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '找不到此服務者' })).toBeNull();
  });

  it('按重試只重發一次請求、不整頁重載，成功後顯示刊登', async () => {
    single
      .mockResolvedValueOnce({ data: null, error: { code: '503', message: 'unavailable' } })
      .mockResolvedValueOnce({ data: listing, error: null });
    renderAt([detailPath]);

    fireEvent.click(await screen.findByRole('button', { name: '重試' }));

    expect(await screen.findByRole('heading', { name: 'Cara 美容師' })).toBeTruthy();
    expect(single).toHaveBeenCalledTimes(2);
    // 重試期間回到骨架，不是停在錯誤框上
    expect(screen.queryByRole('heading', { name: '暫時無法載入服務者資料' })).toBeNull();
  });

  it('從分享連結直接進來（站內沒有上一頁）時，返回回首頁', async () => {
    single.mockResolvedValueOnce({ data: listing, error: null });
    renderAt([detailPath]);

    fireEvent.click(await screen.findByRole('button', { name: '返回' }));
    expect(screen.getByText('首頁內容')).toBeTruthy();
  });

  it('站內有上一頁時，返回回到上一頁', async () => {
    single.mockResolvedValueOnce({ data: listing, error: null });
    renderAt(['/from', detailPath]);

    fireEvent.click(await screen.findByRole('button', { name: '返回' }));
    expect(screen.getByText('上一頁內容')).toBeTruthy();
  });

  it('縮圖以 aria-pressed 標示目前顯示的照片，點選後切換', async () => {
    single.mockResolvedValueOnce({ data: listing, error: null });
    renderAt([detailPath]);

    const first = await screen.findByRole('button', { name: '縮圖 1' });
    const second = screen.getByRole('button', { name: '縮圖 2' });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(second);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('img', { name: 'Cara 美容師 - 圖片 2' })).toBeTruthy();
  });

  it('類別徽章是灰色分類標記，不是墨黑實心', async () => {
    single.mockResolvedValueOnce({ data: listing, error: null });
    renderAt([detailPath]);

    const badge = await screen.findByText('美容');
    expect(badge.classList.contains('bg-secondary')).toBe(true);
    expect(badge.classList.contains('bg-primary')).toBe(false);
  });
});
