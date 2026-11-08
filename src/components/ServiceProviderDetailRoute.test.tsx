// @vitest-environment jsdom
//
// 刊登詳情頁的「換篇」（W5-20～22、27、28）：從首頁點進來才有脈絡，才顯示「‹ n/N ›」；
// 換篇＝同一條歷史紀錄 replace 成新的 id，返回一次就回首頁；換篇時整個詳情元件重掛（key），
// 所以內容立刻是新那篇、不會殘留上一篇。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicListingRow } from '../types/listing';

type SingleResult = {
  data: PublicListingRow | null;
  error: { code: string; message: string } | null;
};

const { singleFor, showToast } = vi.hoisted(() => ({
  singleFor: vi.fn<(id: string) => Promise<SingleResult>>(),
  showToast: vi.fn(),
}));

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: (_c: string, id: string) => ({ single: () => singleFor(id) }) }),
    }),
  }),
}));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast }),
}));

import { ServiceProviderDetailRoute } from './ServiceProviderDetailRoute';
import {
  freezeBrowseContext,
  getLastViewedId,
  resetHomeListingsCache,
  setCachedListings,
} from '../utils/homeListingsCache';

const mk = (id: string, name: string, photos = 3): PublicListingRow => ({
  id,
  user_id: `u-${id}`,
  name,
  category: '美容',
  city: '台北市',
  districts: ['大安區'],
  gender: '女',
  photos: Array.from({ length: photos }, (_, i) => `https://example.com/${id}-${i}.jpg`),
  contacts: { line: 'cara_line' },
  description: `${name}的介紹`,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
});
const A = mk('a', 'AAA美容師');
const B = mk('b', 'BBB美容師');
const C = mk('c', 'CCC美容師');
const ROWS = [A, B, C];

function setup(currentId = 'b', opts: { state?: object | null; rows?: PublicListingRow[] } = {}) {
  const rows = opts.rows ?? ROWS;
  setCachedListings(rows);
  const ctx = freezeBrowseContext(
    rows.map((r) => r.id),
    currentId,
  );
  const state = opts.state === undefined ? { browseFrom: 'home', ctx } : opts.state;
  return render(
    <MemoryRouter
      initialEntries={['/', { pathname: `/service-providers/${currentId}`, state }]}
      initialIndex={1}
    >
      <Routes>
        <Route path="/" element={<p>首頁內容</p>} />
        <Route path="/service-providers/:id" element={<ServiceProviderDetailRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const nextButton = () => screen.getByRole('button', { name: '下一篇' });
const prevButton = () => screen.getByRole('button', { name: '上一篇' });
const heading = (name: string) => screen.queryByRole('heading', { name });

// 鍵盤／手勢由動態載入的元件接手：先預載模組，再讓 React 把 lazy 內容放上來。
async function settleLazy() {
  await act(async () => {
    await import('./listing/BrowseGestures');
  });
  await act(async () => {});
}

beforeEach(() => {
  resetHomeListingsCache();
  singleFor.mockReset();
  singleFor.mockImplementation(async (id) => ({
    data: ROWS.find((r) => r.id === id) ?? null,
    error: null,
  }));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 300 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ServiceProviderDetailRoute 脈絡有效性', () => {
  it('從首頁進來時顯示位置「2/3」、上一篇與下一篇', async () => {
    setup('b');
    expect(await screen.findByText('2/3')).toBeTruthy();
    expect(prevButton()).toBeTruthy();
    expect(nextButton()).toBeTruthy();
  });

  it('沒有首頁脈絡旗標（分享連結、推薦網絡進來）時不顯示換篇控制', async () => {
    setup('b', { state: null });
    await screen.findByRole('heading', { name: 'BBB美容師' });
    expect(screen.queryByRole('button', { name: '下一篇' })).toBeNull();
    expect(screen.queryByText('2/3')).toBeNull();
  });

  it('ctx 與目前凍結版本不同（舊條目）時不顯示換篇控制', async () => {
    setup('b', { state: { browseFrom: 'home', ctx: 'stale-ctx' } });
    await screen.findByRole('heading', { name: 'BBB美容師' });
    expect(screen.queryByRole('button', { name: '下一篇' })).toBeNull();
  });

  it('位置文字有一個 polite 播報區，內容是「第 2 篇，共 3 篇」', async () => {
    setup('b');
    const live = await screen.findByText('第 2 篇，共 3 篇');
    expect(live.closest('[aria-live="polite"]')).toBeTruthy();
  });
});

describe('ServiceProviderDetailRoute 按鈕換篇', () => {
  it('按下一篇導向下一筆，且是 replace：返回一次直接回首頁', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });

    fireEvent.click(nextButton());
    expect(await screen.findByRole('heading', { name: 'CCC美容師' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回上一頁' }));
    expect(await screen.findByText('首頁內容')).toBeTruthy();
  });

  it('換篇的第一個 render 就是新那篇，不殘留上一篇', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });
    singleFor.mockReturnValue(new Promise(() => {})); // 背景重驗永遠在途

    fireEvent.click(nextButton());

    expect(heading('CCC美容師')).toBeTruthy();
    expect(heading('BBB美容師')).toBeNull();
  });

  it('新那篇的背景重驗失敗時仍顯示新那篇，不退回舊內容也不跳錯誤框', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    singleFor.mockRejectedValue(new Error('網路失敗'));

    fireEvent.click(nextButton());
    await act(async () => {});

    expect(heading('CCC美容師')).toBeTruthy();
    expect(screen.queryByText('暫時無法載入服務者資料')).toBeNull();
  });

  it('換到已下架的刊登時顯示找不到，仍有換篇控制可繼續換', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });
    singleFor.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'none' } });
    setCachedListings([A, B]); // C 不在快取：模擬已下架

    fireEvent.click(nextButton());
    expect(await screen.findByText('找不到此服務者')).toBeTruthy();
    expect(screen.getByRole('button', { name: '上一篇' })).toBeTruthy();
  });

  it('第一篇的上一篇與最後一篇的下一篇是 aria-disabled，點了不換篇並播報', async () => {
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });
    expect(prevButton().getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(prevButton());
    expect(heading('AAA美容師')).toBeTruthy();
    expect(await screen.findByText(/已是第一篇/)).toBeTruthy();
  });

  it('按鈕換篇後焦點仍在同一顆鈕（連按下一篇不必重新 Tab）', async () => {
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });

    fireEvent.click(nextButton());
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(document.activeElement).toBe(nextButton());
  });

  it('換篇前後位置播報區是同一個 DOM 節點，只換文字', async () => {
    setup('a');
    const before = await screen.findByText('第 1 篇，共 3 篇');

    fireEvent.click(nextButton());
    const after = await screen.findByText('第 2 篇，共 3 篇');

    expect(after).toBe(before);
  });

  it('換篇會記下最後看的那一篇，給返回首頁定位用', async () => {
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });

    fireEvent.click(nextButton());
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(getLastViewedId()).toBe('b');
  });
});

describe('ServiceProviderDetailRoute 鍵盤', () => {
  it('按 → 換下一篇、← 換上一篇', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { name: 'CCC美容師' })).toBeTruthy();
    await settleLazy();

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(await screen.findByRole('heading', { name: 'BBB美容師' })).toBeTruthy();
  });

  it('焦點在輸入欄時按 → 不換篇', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: 'ArrowRight' });

    expect(heading('BBB美容師')).toBeTruthy();
  });

  it('焦點在輪播捲動容器時按 → 不換篇（是換照片）', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();
    const scroller = document.querySelector('[data-carousel-scroller]') as HTMLElement;

    fireEvent.keyDown(scroller, { key: 'ArrowRight' });

    expect(heading('BBB美容師')).toBeTruthy();
  });

  it('有開啟中的對話框時按 → 不換篇', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(heading('BBB美容師')).toBeTruthy();
  });

  it('沒有脈絡時按 → 不換篇', async () => {
    setup('b', { state: null });
    await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(heading('BBB美容師')).toBeTruthy();
  });
});

describe('ServiceProviderDetailRoute 滑動換篇', () => {
  const touch = (x: number, y = 300) => ({ clientX: x, clientY: y });
  const swipe = (el: Element, from: number, to: number, dy = 0) => {
    fireEvent.touchStart(el, { touches: [touch(from)] });
    fireEvent.touchEnd(el, { changedTouches: [touch(to, 300 + dy)] });
  };

  it('照片以外的區域往左滑換下一篇，焦點移到新頁標題並捲回頂端', async () => {
    setup('b');
    const title = await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();

    swipe(title, 250, 120);

    const next = await screen.findByRole('heading', { name: 'CCC美容師' });
    expect(document.activeElement).toBe(next);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('往右滑換上一篇', async () => {
    setup('b');
    const title = await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();

    swipe(title, 120, 250);

    expect(await screen.findByRole('heading', { name: 'AAA美容師' })).toBeTruthy();
  });

  it('垂直為主的滑動不換篇', async () => {
    setup('b');
    const title = await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();

    swipe(title, 250, 200, 140);

    expect(heading('BBB美容師')).toBeTruthy();
  });

  it('從照片區起手的滑動不由頁面處理（交給輪播）', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();
    const scroller = document.querySelector('[data-carousel-scroller]') as HTMLElement;

    swipe(scroller, 250, 120); // 第一張起手向左＝換照片，不是換篇

    expect(heading('BBB美容師')).toBeTruthy();
  });

  it('只有一張照片時，在照片上往左滑（盡頭續滑）換下一篇', async () => {
    const solo = mk('b', 'BBB美容師', 1);
    // 背景重驗也要回單張版，否則重驗後輪播變三張、起點不在盡頭
    singleFor.mockResolvedValue({ data: solo, error: null });
    setup('b', { rows: [A, solo, C] });
    await screen.findByRole('heading', { name: 'BBB美容師' });
    await settleLazy();
    const scroller = document.querySelector('[data-carousel-scroller]') as HTMLElement;

    swipe(scroller, 250, 120);

    expect(await screen.findByRole('heading', { name: 'CCC美容師' })).toBeTruthy();
  });

  it('最後一篇再往左滑不換篇並播報已是最後一篇', async () => {
    setup('c');
    const title = await screen.findByRole('heading', { name: 'CCC美容師' });
    await settleLazy();

    swipe(title, 250, 120);

    expect(heading('CCC美容師')).toBeTruthy();
    expect(await screen.findByText(/已是最後一篇/)).toBeTruthy();
  });
});

// 換篇動畫（W5-27、W6-20）：換篇後新內容由去向的對側滑入（Web Animations，固定位移 32px＋淡入）；
// 頭尾再換篇時內容區輕微回彈。偏好減少動態時兩者都不動，但頭尾仍有文字播報。
// jsdom 沒有 Element.animate，用 spy。動畫掛在固定 wrapper（data-browse-motion），頁首列不動。
describe('ServiceProviderDetailRoute 換篇動畫', () => {
  const animate = vi.fn();
  const content = () => document.querySelector('[data-browse-content]');
  const motion = () => document.querySelector('[data-browse-motion]');
  const stubReducedMotion = (reduced: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

  beforeEach(() => {
    animate.mockReset();
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    stubReducedMotion(false);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('往下一篇換篇後，新內容從右側滑入並淡入', async () => {
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });

    fireEvent.click(nextButton());
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0];
    expect(keyframes[0]).toMatchObject({ transform: 'translateX(32px)', opacity: 0 });
    expect(keyframes[1]).toMatchObject({ transform: 'translateX(0)', opacity: 1 });
    expect(options).toMatchObject({ duration: 220 });
    expect(animate.mock.instances[0]).toBe(motion());
  });

  it('往上一篇換篇後，新內容從左側滑入', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });

    fireEvent.click(prevButton());
    await screen.findByRole('heading', { name: 'AAA美容師' });

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0][0]).toMatchObject({ transform: 'translateX(-32px)' });
  });

  it('換篇的進場動畫在畫面繪製前（同一次 commit）就已啟動', async () => {
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });

    fireEvent.click(nextButton());

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('第一次從首頁進來（不是換篇）時不做進場動畫', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(motion()).not.toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('偏好減少動態時換篇不做進場動畫', async () => {
    stubReducedMotion(true);
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });

    fireEvent.click(nextButton());
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(motion()).not.toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('連續換篇時，上一段進場動畫被取消', async () => {
    const cancel = vi.fn();
    animate.mockImplementation(() => ({ cancel }));
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });

    fireEvent.click(nextButton());
    await screen.findByRole('heading', { name: 'BBB美容師' });
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(nextButton());
    await screen.findByRole('heading', { name: 'CCC美容師' });

    expect(animate).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('動畫掛在固定 wrapper，頁首列的換篇鈕不在其內', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(motion()?.contains(nextButton())).toBe(false);
    expect(motion()?.contains(content())).toBe(true);
  });

  it('骨架換成內容時 wrapper 是同一個節點且只進場一次', async () => {
    let release: (value: SingleResult) => void = () => {};
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });
    setCachedListings([A]);
    singleFor.mockImplementationOnce(
      () =>
        new Promise<SingleResult>((resolve) => {
          release = resolve;
        }),
    );

    fireEvent.click(nextButton());
    expect(screen.getByRole('status', { name: '載入服務者詳情中' })).toBeTruthy();
    const wrapperWhileLoading = motion();
    expect(wrapperWhileLoading).not.toBeNull();
    await act(async () => {
      release({ data: B, error: null });
    });
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(motion()).toBe(wrapperWhileLoading);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('找不到的刊登也在同一個 wrapper 內顯示', async () => {
    singleFor.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'none' } });
    setup('b', { state: null });
    await screen.findByRole('heading', { name: '找不到此服務者' });

    expect(motion()?.contains(screen.getByRole('heading', { name: '找不到此服務者' }))).toBe(true);
  });

  it('最後一篇再按下一篇，內容區向左輕推再回原位', async () => {
    setup('c');
    await screen.findByRole('heading', { name: 'CCC美容師' });

    fireEvent.click(nextButton());

    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes] = animate.mock.calls[0];
    expect(JSON.stringify(keyframes)).toContain('translateX(-24px)');
    expect(animate.mock.instances[0]).toBe(motion());
  });

  it('第一篇再按上一篇，內容區向右輕推再回原位', async () => {
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });

    fireEvent.click(prevButton());

    expect(animate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(animate.mock.calls[0][0])).toContain('translateX(24px)');
  });

  it('手勢在頭尾放開時回彈由手勢負責，換篇邏輯不再疊一段回彈', async () => {
    setup('c');
    const title = await screen.findByRole('heading', { name: 'CCC美容師' });
    await settleLazy();

    fireEvent.touchStart(title, { touches: [{ clientX: 250, clientY: 300 }] });
    fireEvent.touchEnd(title, { changedTouches: [{ clientX: 120, clientY: 300 }] });

    expect(await screen.findByText(/已是最後一篇/)).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
  });

  it('外層容器用 overflow-x-clip 擋住位移造成的橫向捲動', async () => {
    setup('b');
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(motion()?.parentElement?.className).toContain('overflow-x-clip');
  });

  it('偏好減少動態時頭尾不回彈，仍播報已是最後一篇', async () => {
    stubReducedMotion(true);
    setup('c');
    await screen.findByRole('heading', { name: 'CCC美容師' });

    fireEvent.click(nextButton());

    expect(animate).not.toHaveBeenCalled();
    expect(await screen.findByText(/已是最後一篇/)).toBeTruthy();
  });

  it('一般換篇（不在頭尾）只有進場動畫、沒有 24px 回彈', async () => {
    setup('a');
    await screen.findByRole('heading', { name: 'AAA美容師' });

    fireEvent.click(nextButton());
    await screen.findByRole('heading', { name: 'BBB美容師' });

    expect(animate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(animate.mock.calls[0][0])).not.toContain('24px');
  });
});
