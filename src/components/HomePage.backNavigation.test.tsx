// @vitest-environment jsdom
//
// 從詳情頁返回首頁（HomePage 卸載再掛載）時不得閃骨架、不得重排：
// 清單與定位結果活在元件之外，第二次掛載先用快取即時渲染，背景靜默重驗。
// 重新整理（模組重載）才允許走一遍載入骨架。
import { createContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PublicListingRow } from '../types/listing';

type ListResult = { data: PublicListingRow[] | null; error: null };

const { order } = vi.hoisted(() => ({ order: vi.fn<() => Promise<ListResult>>() }));

vi.mock('../App', () => ({
  UserContext: createContext({ isLoggedIn: false }),
}));
vi.mock('../hooks/useCustomCategories', () => ({
  useCustomCategories: () => ({ customCategories: [], loading: false }),
}));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ order }) }) }),
}));

const base: PublicListingRow = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: 'u1',
  name: '台北美髮師',
  category: '美髮',
  city: '台北市',
  districts: ['全區'],
  gender: '女',
  photos: ['https://example.com/1.jpg'],
  contacts: { line: 'alice' },
  description: '剪髮染髮',
  created_at: '2026-10-02T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
};
// 後端順序：台北（較新）在前；使用者在高雄 → 依距離應是高雄在前
const taipei = base;
const kaohsiung: PublicListingRow = {
  ...base,
  id: '22222222-2222-2222-2222-222222222222',
  name: '高雄美髮師',
  city: '高雄市',
  created_at: '2026-10-01T00:00:00Z',
};

const SKELETON = { name: '載入服務者資料中' };

async function mountHome() {
  const { HomePage } = await import('./HomePage');
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

function names(): string[] {
  const text = document.body.textContent ?? '';
  return [taipei.name, kaohsiung.name]
    .map((n) => ({ n, i: text.indexOf(n) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.n);
}

let geoCallbacks: Array<() => void> = [];

beforeEach(() => {
  vi.resetModules();
  order.mockReset();
  geoCallbacks = [];
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      // 定位永遠非同步回來，由測試決定何時放行
      getCurrentPosition: (ok: (p: unknown) => void) => {
        geoCallbacks.push(() => ok({ coords: { latitude: 22.6273, longitude: 120.3014 } }));
      },
    },
  });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
});

describe('HomePage 返回', () => {
  it('第二次掛載時不出現載入骨架，清單即時渲染', async () => {
    order.mockResolvedValueOnce({ data: [taipei, kaohsiung], error: null });
    const first = await mountHome();
    await screen.findByText(/找到 2 位服務者/);
    first.unmount();

    order.mockReturnValueOnce(new Promise(() => {})); // 背景重驗永遠在途
    await mountHome();

    expect(screen.queryByRole('status', SKELETON)).toBeNull();
    expect(screen.getByText(/找到 2 位服務者/)).toBeTruthy();
  });

  it('第二次掛載首次渲染就是定位後的順序，不再二次重排', async () => {
    order.mockResolvedValueOnce({ data: [taipei, kaohsiung], error: null });
    const first = await mountHome();
    await screen.findByText(/找到 2 位服務者/);
    await act(async () => {
      for (const cb of geoCallbacks) cb();
    });
    expect(names()[0]).toBe(kaohsiung.name);
    first.unmount();

    order.mockReturnValueOnce(new Promise(() => {}));
    await mountHome();

    // 定位這次還沒回來：首次渲染的順序必須已經是高雄在前
    expect(names()[0]).toBe(kaohsiung.name);
  });

  it('背景重驗成功後用新清單取代快取', async () => {
    order.mockResolvedValueOnce({ data: [taipei], error: null });
    const first = await mountHome();
    await screen.findByText(/找到 1 位服務者/);
    first.unmount();

    order.mockResolvedValueOnce({ data: [taipei, kaohsiung], error: null });
    await mountHome();
    expect(screen.queryByRole('status', SKELETON)).toBeNull();
    expect(await screen.findByText(/找到 2 位服務者/)).toBeTruthy();
  });

  it('返回時還原離開前的捲動位置', async () => {
    order.mockResolvedValueOnce({ data: [taipei, kaohsiung], error: null });
    const first = await mountHome();
    await screen.findByText(/找到 2 位服務者/);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
    first.unmount();

    order.mockReturnValueOnce(new Promise(() => {}));
    await mountHome();

    expect(window.scrollTo).toHaveBeenCalledWith(0, 640);
  });
  it('返回時還原搜尋字詞與結果', async () => {
    order.mockResolvedValueOnce({ data: [taipei, kaohsiung], error: null });
    const first = await mountHome();
    await screen.findByText(/找到 2 位服務者/);
    const input = document.getElementById('service-search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '高雄' } });
    expect(await screen.findByText(/找到 1 位服務者/)).toBeTruthy();
    first.unmount();

    order.mockReturnValueOnce(new Promise(() => {}));
    await mountHome();

    expect((document.getElementById('service-search') as HTMLInputElement).value).toBe('高雄');
    expect(screen.getByText(/找到 1 位服務者/)).toBeTruthy();
    expect(names()).toEqual([kaohsiung.name]);
  });

  it('返回時還原類別篩選', async () => {
    const hair = taipei;
    const nail: PublicListingRow = { ...kaohsiung, category: '美甲' };
    order.mockResolvedValueOnce({ data: [hair, nail], error: null });
    const first = await mountHome();
    await screen.findByText(/找到 2 位服務者/);
    fireEvent.click(screen.getByRole('button', { name: /服務類別/ }));
    fireEvent.click(await screen.findByRole('button', { name: '美甲' }));
    expect(await screen.findByText(/找到 1 位服務者/)).toBeTruthy();
    first.unmount();

    order.mockReturnValueOnce(new Promise(() => {}));
    await mountHome();

    expect(screen.getByText(/找到 1 位服務者/)).toBeTruthy();
    expect(names()).toEqual([nail.name]);
  });

  it('重新整理（模組重載）後篩選回到預設', async () => {
    order.mockResolvedValueOnce({ data: [taipei, kaohsiung], error: null });
    const first = await mountHome();
    await screen.findByText(/找到 2 位服務者/);
    fireEvent.change(document.getElementById('service-search') as HTMLInputElement, {
      target: { value: '高雄' },
    });
    first.unmount();

    vi.resetModules();
    order.mockResolvedValueOnce({ data: [taipei, kaohsiung], error: null });
    await mountHome();
    expect(await screen.findByText(/找到 2 位服務者/)).toBeTruthy();
    expect((document.getElementById('service-search') as HTMLInputElement).value).toBe('');
  });
});
