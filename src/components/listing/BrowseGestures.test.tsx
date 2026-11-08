// @vitest-environment jsdom
//
// 換篇手勢的「跟手」（W6-20）：水平拖曳時固定 wrapper 跟著手指位移，放開達門檻才換篇，
// 否則彈回；邊緣、互動元素、輪播、橫向捲動祖先、選字、減少動態都不啟動跟手。
// jsdom 沒有完整的 Touch／TouchEvent，事件以 Event 加手動掛 touches／changedTouches 構造。
import { createRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BrowseGestures from './BrowseGestures';

const VW = 400;

type Props = { hasPrev?: boolean; hasNext?: boolean };

function mount({ hasPrev = true, hasNext = true }: Props = {}) {
  const onNavigate = vi.fn();
  const containerRef = createRef<HTMLDivElement>();
  const dragTargetRef = createRef<HTMLDivElement>();
  const view = render(
    <div ref={containerRef} data-testid="container">
      <button type="button" data-testid="btn">
        鈕
      </button>
      <div data-carousel-scroller="" data-testid="carousel">
        輪播
      </div>
      <div data-testid="hscroll" style={{ overflowX: 'auto' }}>
        <span data-testid="inside-hscroll">橫向捲動區</span>
      </div>
      <div ref={dragTargetRef} data-testid="target">
        <p data-testid="text">內容</p>
      </div>
      <BrowseGestures
        containerRef={containerRef}
        dragTargetRef={dragTargetRef}
        onNavigate={onNavigate}
        hasPrev={hasPrev}
        hasNext={hasNext}
      />
    </div>,
  );
  const hscroll = view.getByTestId('hscroll');
  Object.defineProperty(hscroll, 'scrollWidth', { value: 800, configurable: true });
  Object.defineProperty(hscroll, 'clientWidth', { value: 300, configurable: true });
  return {
    onNavigate,
    container: view.getByTestId('container'),
    target: view.getByTestId('target'),
    text: view.getByTestId('text'),
    view,
  };
}

function touch(el: Element, type: string, x: number, y: number, count = 1) {
  const point = { clientX: x, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable: true });
  const list = type === 'touchend' || type === 'touchcancel' ? [] : Array(count).fill(point);
  Object.defineProperty(event, 'touches', { value: list });
  Object.defineProperty(event, 'changedTouches', { value: [point] });
  act(() => {
    el.dispatchEvent(event);
  });
}

const drag = (el: Element, from: [number, number], to: [number, number], end = true) => {
  touch(el, 'touchstart', ...from);
  touch(el, 'touchmove', from[0] + (to[0] - from[0]) / 2, from[1] + (to[1] - from[1]) / 2);
  touch(el, 'touchmove', ...to);
  if (end) touch(el, 'touchend', ...to);
};

function stubMedia(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vi.stubGlobal('innerWidth', VW);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  stubMedia(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BrowseGestures 跟手', () => {
  it('水平拖曳時目標元素隨手指位移（半阻尼）', () => {
    const { text, target } = mount();
    drag(text, [200, 300], [140, 302], false);
    expect(target.style.transform).toBe('translateX(-30px)');
  });

  it('垂直為主的拖曳不位移', () => {
    const { text, target } = mount();
    drag(text, [200, 300], [204, 340], false);
    expect(target.style.transform).toBe('');
  });

  it('放開達門檻時換篇，位移保留到元件卸載', () => {
    const { text, target, onNavigate } = mount();
    drag(text, [200, 300], [110, 302]);
    expect(onNavigate).toHaveBeenCalledWith('next', 'swipe');
    expect(target.style.transform).not.toBe('');
  });

  it('向右放開達門檻時換上一篇', () => {
    const { text, onNavigate } = mount();
    drag(text, [200, 300], [290, 302]);
    expect(onNavigate).toHaveBeenCalledWith('prev', 'swipe');
  });

  it('放開未達門檻時彈回並清掉位移，不換篇', () => {
    const { text, target, onNavigate } = mount();
    drag(text, [200, 300], [170, 301]);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(target.style.transform).toBe('');
  });

  it('去向沒有鄰居時阻尼加重，放開仍通知換篇（由呼叫端播報頭尾）但位移清掉', () => {
    const { text, target, onNavigate } = mount({ hasNext: false });
    drag(text, [200, 300], [140, 302], false);
    expect(target.style.transform).toBe('translateX(-15px)');
    touch(text, 'touchend', 110, 302);
    expect(onNavigate).toHaveBeenCalledWith('next', 'swipe');
    expect(target.style.transform).toBe('');
  });
});

describe('BrowseGestures 中斷與清理', () => {
  it('touchcancel 後位移歸零', () => {
    const { text, target } = mount();
    drag(text, [200, 300], [140, 302], false);
    touch(text, 'touchcancel', 140, 302);
    expect(target.style.transform).toBe('');
  });

  it('頁面進背景（visibilitychange hidden）時位移歸零', () => {
    const { text, target } = mount();
    drag(text, [200, 300], [140, 302], false);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(target.style.transform).toBe('');
  });

  it('卸載時取消待寫入的 requestAnimationFrame 並清掉位移', () => {
    const raf = vi.fn(() => 7);
    vi.stubGlobal('requestAnimationFrame', raf);
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const { text, target, view } = mount();
    drag(text, [200, 300], [140, 302], false);
    expect(raf).toHaveBeenCalled();
    view.unmount();
    expect(cancel).toHaveBeenCalledWith(7);
    expect(target.style.transform).toBe('');
  });

  it('touchstart 時取消目標元素上進行中的動畫', () => {
    const { text, target } = mount();
    const cancel = vi.fn();
    (target as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [{ cancel }];
    touch(text, 'touchstart', 200, 300);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('容器上的 touchmove 監聽器為 passive（不攔截原生捲動）', () => {
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const { container } = mount();
    const calls = add.mock.calls
      .map((args, i) => ({ args, self: add.mock.contexts[i] }))
      .filter(({ args, self }) => args[0] === 'touchmove' && self === container);
    expect(calls.length).toBe(1);
    expect(calls[0].args[2]).toMatchObject({ passive: true });
  });
});

describe('BrowseGestures 不啟動跟手的起點', () => {
  it('邊緣保護區起手時不位移也不換篇', () => {
    const { text, target, onNavigate } = mount();
    drag(text, [10, 300], [110, 302]);
    expect(target.style.transform).toBe('');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('起點在按鈕上時不位移也不換篇', () => {
    const { view, target, onNavigate } = mount();
    drag(view.getByTestId('btn'), [200, 300], [110, 302]);
    expect(target.style.transform).toBe('');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('起點在照片輪播內時不位移也不換篇', () => {
    const { view, target, onNavigate } = mount();
    drag(view.getByTestId('carousel'), [200, 300], [110, 302]);
    expect(target.style.transform).toBe('');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('起點在橫向可捲動祖先內時不位移也不換篇', () => {
    const { view, target, onNavigate } = mount();
    drag(view.getByTestId('inside-hscroll'), [200, 300], [110, 302]);
    expect(target.style.transform).toBe('');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('多指觸控時不位移', () => {
    const { text, target } = mount();
    touch(text, 'touchstart', 200, 300, 2);
    touch(text, 'touchmove', 140, 302, 2);
    expect(target.style.transform).toBe('');
  });

  it('有選取文字時不位移也不換篇', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      toString: () => '選取的字',
    } as unknown as Selection);
    const { text, target, onNavigate } = mount();
    drag(text, [200, 300], [110, 302]);
    expect(target.style.transform).toBe('');
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('BrowseGestures 減少動態', () => {
  it('偏好減少動態時全程不寫位移，但放開達門檻仍換篇', () => {
    stubMedia(true);
    const { text, target, onNavigate } = mount();
    drag(text, [200, 300], [140, 302], false);
    expect(target.style.transform).toBe('');
    touch(text, 'touchend', 110, 302);
    expect(onNavigate).toHaveBeenCalledWith('next', 'swipe');
  });
});
