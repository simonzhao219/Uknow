// @vitest-environment jsdom
//
// 首頁 → 詳情的「換篇脈絡」：點卡片當下凍結畫面上的順序（W5-26），詳情頁換篇只看這份凍結值；
// 返回時換過篇才捲到最後看的那張卡，沒換篇維持原捲動位置（W5-28）。
import { createContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { PublicListingRow } from '../types/listing';

type ListResult = { data: PublicListingRow[] | null; error: null };
const { order } = vi.hoisted(() => ({ order: vi.fn<() => Promise<ListResult>>() }));

vi.mock('../App', () => ({ UserContext: createContext({ isLoggedIn: false }) }));
vi.mock('../hooks/useCustomCategories', () => ({
  useCustomCategories: () => ({ customCategories: [], loading: false }),
}));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ order }) }) }),
}));

const mk = (id: string, name: string, city: string, createdAt: string): PublicListingRow => ({
  id,
  user_id: `u-${id}`,
  name,
  category: '美髮',
  city,
  districts: ['全區'],
  gender: '女',
  photos: ['https://example.com/1.jpg'],
  contacts: { line: 'alice' },
  description: '剪髮染髮',
  created_at: createdAt,
  updated_at: createdAt,
});
// 後端順序（新到舊）：台北、台中、高雄；使用者在高雄 → 由近到遠為 高雄、台中、台北
const taipei = mk('t-1', '台北美髮師', '台北市', '2026-10-03T00:00:00Z');
const taichung = mk('c-1', '台中美髮師', '台中市', '2026-10-02T00:00:00Z');
const kaohsiung = mk('k-1', '高雄美髮師', '高雄市', '2026-10-01T00:00:00Z');
const ALL = [taipei, taichung, kaohsiung];

function DetailProbe() {
  const navigate = useNavigate();
  const { state } = useLocation();
  return (
    <div>
      <output data-testid="detail-state">{JSON.stringify(state)}</output>
      <button type="button" onClick={() => navigate(-1)}>
        返回
      </button>
    </div>
  );
}

async function mountHome() {
  const { HomePage } = await import('./HomePage');
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/service-providers/:id" element={<DetailProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const cardLink = (id: string) => {
  const link = document.querySelector(`a[href="/service-providers/${id}"]`);
  if (!link) throw new Error(`找不到卡片連結 ${id}`);
  return link;
};

let geoCallbacks: Array<() => void> = [];
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.resetModules();
  order.mockReset();
  localStorage.clear();
  geoCallbacks = [];
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (p: unknown) => void) => {
        geoCallbacks.push(() => ok({ coords: { latitude: 22.6273, longitude: 120.3014 } }));
      },
    },
  });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView =
    scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});
afterEach(() => cleanup());

describe('HomePage 換篇脈絡：點擊時凍結', () => {
  it('點卡片時帶 browseFrom 旗標與 ctx，凍結的順序就是畫面上的順序', async () => {
    order.mockResolvedValueOnce({ data: ALL, error: null });
    await mountHome();
    await screen.findByText(/找到 3 位服務者/);
    await act(async () => {
      for (const cb of geoCallbacks) cb();
    });
    const cache = await import('../utils/homeListingsCache');

    fireEvent.click(cardLink(taichung.id));

    const state = JSON.parse(screen.getByTestId('detail-state').textContent ?? 'null');
    const frozen = cache.getBrowseContext();
    expect(state).toEqual({ browseFrom: 'home', ctx: frozen?.version });
    expect(frozen?.ids).toEqual([kaohsiung.id, taichung.id, taipei.id]);
    expect(frozen?.entryId).toBe(taichung.id);
  });

  it('搜尋後只凍結篩選結果，不含被濾掉的刊登', async () => {
    order.mockResolvedValueOnce({ data: ALL, error: null });
    await mountHome();
    await screen.findByText(/找到 3 位服務者/);
    fireEvent.change(document.getElementById('service-search') as HTMLInputElement, {
      target: { value: '台' },
    });
    await screen.findByText(/找到 2 位服務者/);
    const cache = await import('../utils/homeListingsCache');

    fireEvent.click(cardLink(taipei.id));

    expect(cache.getBrowseContext()?.ids).toEqual([taipei.id, taichung.id]);
  });

  it('座標在點擊之後才回來，不影響已凍結的順序', async () => {
    order.mockResolvedValueOnce({ data: ALL, error: null });
    await mountHome();
    await screen.findByText(/找到 3 位服務者/);
    const cache = await import('../utils/homeListingsCache');

    fireEvent.click(cardLink(taipei.id));
    await act(async () => {
      for (const cb of geoCallbacks) cb();
    });

    expect(cache.getBrowseContext()?.ids).toEqual([taipei.id, taichung.id, kaohsiung.id]);
  });

  it('按住 Ctrl 點卡片（開新分頁）不凍結也不攔截', async () => {
    order.mockResolvedValueOnce({ data: ALL, error: null });
    await mountHome();
    await screen.findByText(/找到 3 位服務者/);
    const cache = await import('../utils/homeListingsCache');

    fireEvent.click(cardLink(taipei.id), { ctrlKey: true });

    expect(cache.getBrowseContext()).toBeNull();
    expect(screen.queryByTestId('detail-state')).toBeNull();
  });
});

describe('HomePage 卡片的 data-listing-id', () => {
  it('照片牆（手機）與桌機卡片都帶刊登 id', async () => {
    order.mockResolvedValueOnce({ data: ALL, error: null });
    await mountHome();
    await screen.findByText(/找到 3 位服務者/);
    expect(document.querySelectorAll(`[data-listing-id="${taipei.id}"]`)).toHaveLength(2);
  });

  it('詳細卡（手機）與桌機卡片都帶刊登 id', async () => {
    localStorage.setItem('uknow:pref:home-view-mode', 'detailed');
    order.mockResolvedValueOnce({ data: ALL, error: null });
    await mountHome();
    await screen.findByText(/找到 3 位服務者/);
    expect(document.querySelectorAll(`[data-listing-id="${taipei.id}"]`)).toHaveLength(2);
  });
});

describe('HomePage 返回定位', () => {
  async function openThenBack(lastViewed: string | null, entryId = taipei.id) {
    order.mockResolvedValueOnce({ data: ALL, error: null });
    await mountHome();
    await screen.findByText(/找到 3 位服務者/);
    const cache = await import('../utils/homeListingsCache');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
    fireEvent.click(cardLink(entryId));
    cache.setLastViewedId(lastViewed);
    (window.scrollTo as ReturnType<typeof vi.fn>).mockClear();
    order.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    await screen.findByText(/找到 3 位服務者/);
  }

  it('換過篇再返回時，把最後看的那張卡捲到畫面中央', async () => {
    await openThenBack(kaohsiung.id);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
    const target = scrollIntoView.mock.instances[0] as HTMLElement;
    expect(target.getAttribute('data-listing-id')).toBe(kaohsiung.id);
    expect(window.scrollTo).not.toHaveBeenCalledWith(0, 640);
  });

  it('沒換過篇再返回時，維持離開前的捲動位置', async () => {
    await openThenBack(null);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 640);
  });

  it('最後看的那張就是點進去的那張時，維持離開前的捲動位置', async () => {
    await openThenBack(taipei.id, taipei.id);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 640);
  });

  it('最後看的那張已不在清單內時，退回離開前的捲動位置', async () => {
    await openThenBack('gone-id');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 640);
  });
});
