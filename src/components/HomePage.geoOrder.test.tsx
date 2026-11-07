// @vitest-environment jsdom
//
// 冷載入時已授權定位 → 首次顯示等座標（最多 1.5 秒）；座標晚到則動畫重排（W5-25、W5-29）。
import { createContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PublicListingRow } from '../types/listing';

const { order } = vi.hoisted(() => ({
  order: vi.fn<() => Promise<{ data: PublicListingRow[]; error: null }>>(),
}));

vi.mock('../App', () => ({ UserContext: createContext({ isLoggedIn: false }) }));
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
const taipei = base;
const kaohsiung: PublicListingRow = {
  ...base,
  id: '22222222-2222-2222-2222-222222222222',
  name: '高雄美髮師',
  city: '高雄市',
  created_at: '2026-10-01T00:00:00Z',
};
const SKELETON = { name: '載入服務者資料中' };

let geoCallbacks: Array<() => void> = [];
const animate = vi.fn();
const scrollBy = vi.fn();
let permission: 'granted' | 'prompt' | 'denied' | 'absent' = 'granted';
let reduced = false;

function names(): string[] {
  const text = document.body.textContent ?? '';
  return [taipei.name, kaohsiung.name]
    .map((n) => ({ n, i: text.indexOf(n) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.n);
}

async function mountHome() {
  const { HomePage } = await import('./HomePage');
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const grantLocation = () =>
  act(async () => {
    for (const cb of geoCallbacks) cb();
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  order.mockReset();
  order.mockResolvedValue({ data: [taipei, kaohsiung], error: null });
  geoCallbacks = [];
  permission = 'granted';
  reduced = false;
  animate.mockReset();
  animate.mockReturnValue({ finished: new Promise(() => {}), cancel: vi.fn() });
  scrollBy.mockReset();
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    get: () =>
      permission === 'absent' ? undefined : { query: () => Promise.resolve({ state: permission }) },
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (p: unknown) => void) => {
        geoCallbacks.push(() => ok({ coords: { latitude: 22.6273, longitude: 120.3014 } }));
      },
    },
  });
  // jsdom 沒有版面：卡片依在父層的順序排成直排，讓 FLIP 量得到位移
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (!this.hasAttribute('data-listing-id')) return original.call(this);
    const idx = Array.from(this.parentElement?.children ?? []).indexOf(this);
    return {
      top: idx * 100,
      left: 0,
      width: 100,
      height: 90,
      right: 100,
      bottom: idx * 100 + 90,
      x: 0,
      y: idx * 100,
      toJSON() {},
    };
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HomePage 冷載入的定位等待', () => {
  it('已授權時清單等座標回來才首次顯示，且已是距離順序、不播動畫', async () => {
    await mountHome();
    await flush();
    expect(screen.getByRole('status', SKELETON)).toBeTruthy();
    expect(names()).toEqual([]);

    await grantLocation();
    expect(screen.queryByRole('status', SKELETON)).toBeNull();
    expect(names()[0]).toBe(kaohsiung.name);
    expect(animate).not.toHaveBeenCalled();
  });

  it('等滿 1.5 秒仍無座標時先以最新順序顯示', async () => {
    await mountHome();
    await flush();
    await advance(1400);
    expect(names()).toEqual([]);
    await advance(100);
    expect(names()[0]).toBe(taipei.name);
  });

  it('未授權（prompt）時不等待，清單立即以最新順序顯示', async () => {
    permission = 'prompt';
    await mountHome();
    await flush();
    expect(names()[0]).toBe(taipei.name);
  });

  it('瀏覽器沒有 permissions API 時不等待', async () => {
    permission = 'absent';
    await mountHome();
    await flush();
    expect(names()[0]).toBe(taipei.name);
  });

  it('座標表載入失敗時不等待，靜默沿用最新順序', async () => {
    vi.doMock('../utils/districtCentroids', () => {
      throw new Error('chunk load failed');
    });
    await mountHome();
    await flush();
    expect(names()[0]).toBe(taipei.name);
    await grantLocation();
    expect(names()[0]).toBe(taipei.name);
    vi.doUnmock('../utils/districtCentroids');
  });
});

describe('HomePage 座標晚到的動畫重排', () => {
  async function showLatestThenGrant() {
    await mountHome();
    await flush();
    await advance(1500);
    expect(names()[0]).toBe(taipei.name);
  }

  it('座標晚到時改為距離順序並播放 FLIP 動畫', async () => {
    await showLatestThenGrant();
    await grantLocation();
    expect(names()[0]).toBe(kaohsiung.name);
    expect(animate).toHaveBeenCalled();
  });

  it('偏好減少動態時直接換順序、不播動畫', async () => {
    reduced = true;
    await showLatestThenGrant();
    await grantLocation();
    expect(names()[0]).toBe(kaohsiung.name);
    expect(animate).not.toHaveBeenCalled();
  });

  it('動畫期間清單忽略點擊，播完或逾時 300ms 後恢復', async () => {
    await showLatestThenGrant();
    await grantLocation();
    const list = () => document.querySelector('[data-listing-list]');
    expect(list()?.getAttribute('data-reordering')).toBe('true');
    await advance(300);
    expect(list()?.getAttribute('data-reordering')).toBeNull();
  });

  it('已捲動時以第一張可見卡為錨點補償 scrollY', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 300 });
    await showLatestThenGrant();
    await grantLocation();
    // 台北原在第 0 位、重排後在第 1 位（下移 100px）→ 視窗要跟著捲 100px
    expect(scrollBy).toHaveBeenCalledWith(0, 100);
  });

  it('捲動位置為 0 時不調整 scrollY', async () => {
    await showLatestThenGrant();
    await grantLocation();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
