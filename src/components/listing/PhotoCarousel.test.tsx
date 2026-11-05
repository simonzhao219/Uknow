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

  it('沒有照片時仍渲染一格 fallback 圖，不渲染圓點與計數', () => {
    render(<PhotoCarousel photos={[]} name="Cara" />);

    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// 輪播盡頭續滑（W5-21）：起手就在最後一張再往左＝下一篇，第一張再往右＝上一篇。
// 判定看「起點」的張數，不看結束時：倒數第二張滑到最後一張的同一下手勢不連跳換篇。
describe('PhotoCarousel 盡頭續滑', () => {
  const touch = (x: number, y = 300) => ({ clientX: x, clientY: y });

  function drag(
    scroller: HTMLElement,
    from: { x: number; y?: number },
    to: { x: number; y?: number },
  ) {
    fireEvent.touchStart(scroller, { touches: [touch(from.x, from.y)] });
    fireEvent.touchEnd(scroller, { changedTouches: [touch(to.x, to.y)] });
  }

  it('最後一張起手向左滑，觸發 next', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    const scroller = getScroller();
    swipeTo(scroller, 2);
    drag(scroller, { x: 250 }, { x: 120 });
    expect(onEdgeSwipe).toHaveBeenCalledWith('next');
    expect(onEdgeSwipe).toHaveBeenCalledTimes(1);
  });

  it('第一張起手向右滑，觸發 prev', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    drag(getScroller(), { x: 120 }, { x: 250 });
    expect(onEdgeSwipe).toHaveBeenCalledWith('prev');
  });

  it('第一張向左滑（是換下一張照片）不觸發', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    drag(getScroller(), { x: 250 }, { x: 120 });
    expect(onEdgeSwipe).not.toHaveBeenCalled();
  });

  it('最後一張向右滑（是換回上一張照片）不觸發', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    const scroller = getScroller();
    swipeTo(scroller, 2);
    drag(scroller, { x: 120 }, { x: 250 });
    expect(onEdgeSwipe).not.toHaveBeenCalled();
  });

  it('倒數第二張滑到最後一張的同一下手勢不觸發', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    const scroller = getScroller();
    swipeTo(scroller, 1);
    fireEvent.touchStart(scroller, { touches: [touch(250)] });
    swipeTo(scroller, 2); // 手指還沒放開，輪播已吸附到最後一張
    fireEvent.touchEnd(scroller, { changedTouches: [touch(120)] });
    expect(onEdgeSwipe).not.toHaveBeenCalled();
  });

  it('只有一張照片時兩個方向都算盡頭', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS.slice(0, 1)} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    const scroller = getScroller();
    drag(scroller, { x: 250 }, { x: 120 });
    drag(scroller, { x: 120 }, { x: 250 });
    expect(onEdgeSwipe.mock.calls).toEqual([['next'], ['prev']]);
  });

  it('斜向或垂直為主的滑動不觸發', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    const scroller = getScroller();
    swipeTo(scroller, 2);
    drag(scroller, { x: 250, y: 300 }, { x: 150, y: 420 });
    expect(onEdgeSwipe).not.toHaveBeenCalled();
  });

  it('多指觸控不觸發', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    const scroller = getScroller();
    swipeTo(scroller, 2);
    fireEvent.touchStart(scroller, { touches: [touch(250), touch(260)] });
    fireEvent.touchEnd(scroller, { changedTouches: [touch(120)] });
    expect(onEdgeSwipe).not.toHaveBeenCalled();
  });

  it('touchcancel 後不觸發', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    const scroller = getScroller();
    swipeTo(scroller, 2);
    fireEvent.touchStart(scroller, { touches: [touch(250)] });
    fireEvent.touchCancel(scroller);
    fireEvent.touchEnd(scroller, { changedTouches: [touch(120)] });
    expect(onEdgeSwipe).not.toHaveBeenCalled();
  });

  it('起點在螢幕邊緣 24px 內（系統返回手勢區）不觸發', () => {
    const onEdgeSwipe = vi.fn();
    render(<PhotoCarousel photos={PHOTOS} name="Cara" onEdgeSwipe={onEdgeSwipe} />);
    drag(getScroller(), { x: 10 }, { x: 150 });
    expect(onEdgeSwipe).not.toHaveBeenCalled();
  });

  it('沒傳 onEdgeSwipe 時盡頭滑動不出錯、輪播照舊', () => {
    render(<PhotoCarousel photos={PHOTOS} name="Cara" />);
    const scroller = getScroller();
    swipeTo(scroller, 2);
    expect(() => drag(scroller, { x: 250 }, { x: 120 })).not.toThrow();
    expect(screen.getByText('3/3')).toBeTruthy();
  });
});
