// @vitest-environment jsdom
//
// 服務者詳情頁是訪客（P1）唯一的關鍵路徑，而且常從 LINE 分享連結直接進來。
// 這裡釘住三態：骨架 → 資料、查無此刊登、暫時讀不到（給重試，不能說「找不到」），
// 以及「站內沒有上一頁時，返回回首頁」。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
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

// 測試要在同一個元件實例上換 id（模擬在途切換），從路由樹裡把 navigate 拿出來。
let navigateTo: (to: string) => void = () => {};
function CaptureNavigate() {
  navigateTo = useNavigate();
  return null;
}

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <CaptureNavigate />
      <Routes>
        <Route path="/" element={<p>首頁內容</p>} />
        <Route path="/from" element={<p>上一頁內容</p>} />
        <Route path="/service-providers/:id" element={<ServiceProviderDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const detailPath = `/service-providers/${LISTING_ID}`;

// 失敗路徑會刻意 console.error；只在那幾條測試裡靜音，快樂路徑的 React 警告照常浮出來。
function silenceExpectedError() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

beforeEach(() => {
  single.mockReset();
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
    silenceExpectedError();
    single.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Failed to fetch' } });
    renderAt([detailPath]);

    expect(await screen.findByRole('heading', { name: '暫時無法載入服務者資料' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '找不到此服務者' })).toBeNull();
  });

  it('按重試只重發一次請求、不整頁重載，成功後顯示刊登', async () => {
    silenceExpectedError();
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

    fireEvent.click(await screen.findByRole('button', { name: '回首頁' }));
    expect(screen.getByText('首頁內容')).toBeTruthy();
  });

  it('站內有上一頁時，返回回到上一頁', async () => {
    single.mockResolvedValueOnce({ data: listing, error: null });
    renderAt(['/from', detailPath]);

    fireEvent.click(await screen.findByRole('button', { name: '返回上一頁' }));
    expect(screen.getByText('上一頁內容')).toBeTruthy();
  });

  it('回應沒有資料也沒有錯誤碼時當讀取失敗，不說找不到', async () => {
    silenceExpectedError();
    single.mockResolvedValueOnce({ data: null, error: null });
    renderAt([detailPath]);

    expect(await screen.findByRole('heading', { name: '暫時無法載入服務者資料' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '找不到此服務者' })).toBeNull();
  });

  it('id 在途切換時，前一筆的晚到回應不會蓋掉後一筆', async () => {
    const first = deferred();
    const second = deferred();
    single.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderAt([detailPath]);

    act(() => navigateTo('/service-providers/22222222-2222-2222-2222-222222222222'));
    await act(async () => second.resolve({ data: { ...listing, name: '後一筆' }, error: null }));
    await act(async () => first.resolve({ data: listing, error: null }));

    expect(screen.getByRole('heading', { name: '後一筆' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Cara 美容師' })).toBeNull();
  });

  // ui-ux-guidelines §9 焦點後備落點：錯誤框換成骨架時「重試」卸載，焦點不能掉到 body。
  it('首次載入不搶焦點', async () => {
    single.mockResolvedValueOnce({ data: listing, error: null });
    renderAt([detailPath]);

    await screen.findByRole('heading', { name: 'Cara 美容師' });
    expect(document.activeElement).toBe(document.body);
  });

  it('按重試後焦點交給骨架，再次失敗時落在錯誤框', async () => {
    silenceExpectedError();
    const retry = deferred();
    single
      .mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' } })
      .mockReturnValueOnce(retry.promise);
    renderAt([detailPath]);

    const button = await screen.findByRole('button', { name: '重試' });
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(screen.getByRole('status', { name: '載入服務者詳情中' }));

    await act(async () => retry.resolve({ data: null, error: { code: '500', message: 'boom' } }));
    const errorTitle = screen.getByRole('heading', { name: '暫時無法載入服務者資料' });
    expect(document.activeElement?.contains(errorTitle)).toBe(true);
  });

  it('按重試成功後焦點落在刊登名稱標題', async () => {
    silenceExpectedError();
    single
      .mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' } })
      .mockResolvedValueOnce({ data: listing, error: null });
    renderAt([detailPath]);

    const button = await screen.findByRole('button', { name: '重試' });
    button.focus();
    fireEvent.click(button);

    const heading = await screen.findByRole('heading', { name: 'Cara 美容師' });
    expect(document.activeElement).toBe(heading);
  });

  it('渲染三張照片的輪播，第一張為 current，沒有縮圖列', async () => {
    single.mockResolvedValueOnce({ data: listing, error: null });
    renderAt([detailPath]);

    expect(await screen.findByRole('region', { name: 'Cara 美容師 的照片' })).toBeTruthy();
    expect(screen.getAllByRole('group', { name: /^第 \d 張，共 3 張$/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: '第 1 張' }).getAttribute('aria-current')).toBe(
      'true',
    );
    expect(screen.queryByRole('button', { name: /縮圖/ })).toBeNull();
  });

  it('類別徽章是灰色分類標記，不是墨黑實心', async () => {
    single.mockResolvedValueOnce({ data: listing, error: null });
    renderAt([detailPath]);

    const badge = await screen.findByText('美容');
    expect(badge.classList.contains('bg-secondary')).toBe(true);
    expect(badge.classList.contains('bg-primary')).toBe(false);
  });
});
