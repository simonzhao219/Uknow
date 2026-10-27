// @vitest-environment jsdom
//
// 刊登詳情頁的照片輪播（Instagram 式）：正方形、左右滑、圓點＋右上角計數。
// jsdom 沒有 layout 與 scrollTo：clientWidth 固定 300，scrollTo 換成 spy，
// 「滑動」用手動設 scrollLeft 再 dispatch scroll 模擬。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PhotoCarousel } from './PhotoCarousel';

const PHOTOS = [
  'https://example.com/1.jpg',
  'https://example.com/2.jpg',
  'https://example.com/3.jpg',
];
const WIDTH = 300;

const scrollTo = vi.fn();

beforeEach(() => {
  scrollTo.mockReset();
  Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: WIDTH });
  // 去抖用 rAF：測試裡同步執行
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function swipeTo(scroller: HTMLElement, index: number) {
  act(() => {
    scroller.scrollLeft = index * WIDTH;
    fireEvent.scroll(scroller);
  });
}

function getScroller() {
  const scroller = screen
    .getByRole('region', { name: 'Cara 的照片' })
    .querySelector('[data-carousel-scroller]');
  if (!(scroller instanceof HTMLElement)) throw new Error('找不到捲動容器');
  return scroller;
}

describe('PhotoCarousel', () => {
  it('三張時顯示計數「1/3」與三顆圓點，第一顆為 current', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^第 \d 張$/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: '第 1 張' }).getAttribute('aria-current')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: '第 2 張' }).getAttribute('aria-current')).toBeNull();
  });

  it('外層是名為「照片」的輪播區域，每張是「第 N 張，共 M 張」的投影片', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    const region = screen.getByRole('region', { name: 'Cara 的照片' });
    expect(region.getAttribute('aria-roledescription')).toBe('輪播');
    const slide = screen.getByRole('group', { name: '第 2 張，共 3 張' });
    expect(slide.getAttribute('aria-roledescription')).toBe('投影片');
  });

  it('點圓點時捲到對應張的 offset', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    fireEvent.click(screen.getByRole('button', { name: '第 3 張' }));

    expect(scrollTo).toHaveBeenCalledWith({ left: 2 * WIDTH, behavior: 'smooth' });
  });

  it('偏好減少動態時點圓點用 auto 捲動', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    fireEvent.click(screen.getByRole('button', { name: '第 2 張' }));

    expect(scrollTo).toHaveBeenCalledWith({ left: WIDTH, behavior: 'auto' });
  });

  it('滑動到第二張後計數與圓點跟著更新', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    swipeTo(getScroller(), 1);

    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByRole('button', { name: '第 2 張' }).getAttribute('aria-current')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: '第 1 張' }).getAttribute('aria-current')).toBeNull();
  });

  it('計數是 aria-live polite 的區域', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    expect(screen.getByText('1/3').getAttribute('aria-live')).toBe('polite');
  });

  it('桌機箭頭：首張時上一張不可按，點下一張捲到第二張', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    const prev = screen.getByRole('button', { name: '上一張' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '下一張' }));

    expect(scrollTo).toHaveBeenCalledWith({ left: WIDTH, behavior: 'smooth' });
  });

  it('滑到最後一張時下一張不可按（首尾停住不循環）', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    swipeTo(getScroller(), 2);

    expect((screen.getByRole('button', { name: '下一張' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: '上一張' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('只有一張時不渲染圓點、計數與箭頭', () => {
    render(<PhotoCarousel photos={[PHOTOS[0]]} name="Cara" />);

    expect(screen.queryByText('1/1')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Cara - 圖片 1' })).toBeTruthy();
  });

  it('圖片載入失敗時圓點名稱仍是「第 N 張」', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);

    for (const img of screen.getAllByRole('img')) fireEvent.error(img);

    expect(screen.getByRole('button', { name: '第 1 張' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Error loading image' })).toBeNull();
  });
});
