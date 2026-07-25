// @vitest-environment jsdom
//
// 簽名板的行為契約，重點在「觸控時不能讓頁面跟著捲動」。
//
// 背景：使用者在 iPhone 上簽名時，整個版面會被拖著上下滑（iOS Safari 的文件層
// 橡皮筋回彈），Android Chrome 卻重現不出來。原因是原本用 React 的 onTouchMove
// 呼叫 preventDefault —— React 18 把 touchstart/touchmove 委派到 root 且註冊成
// passive，preventDefault 直接被忽略；Android 光靠 CSS touch-action: none 就擋住
// 了，iOS 則沒有。所以這裡把「原生監聽器 + passive: false + preventDefault」
// 當成契約鎖起來，避免日後有人改回 React props 而讓 bug 悄悄回歸。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SignaturePad } from './SignaturePad';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom 沒有 canvas 2D 實作，getContext 預設回 null；補一個夠用的假 ctx。 */
function stubCanvasContext() {
  const ctx = {
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,zz');
  // jsdom 的 getBoundingClientRect 一律回 0，畫布尺寸校正會提早 return，
  // 給一個真實的矩形讓座標換算與解析度設定跑得完整。
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 300,
    bottom: 160,
    width: 300,
    height: 160,
    toJSON: () => ({}),
  } as DOMRect);
  return ctx;
}

/** 直接建構原生 TouchEvent，才能觀察 preventDefault 是否真的生效。 */
function dispatchTouch(target: Element, type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y }],
  });
  // 這是原生 dispatch，React 不會自動包 act()，touchend 觸發的 setState
  // 就不會被 flush（畫面上看不到「已完成簽名」），所以手動包起來。
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function getCanvas() {
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('找不到簽名畫布');
  return canvas;
}

describe('SignaturePad', () => {
  it('touchstart / touchmove 以非 passive 監聽器註冊（否則 iOS 上擋不住捲動）', () => {
    stubCanvasContext();
    const addEventListener = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
    render(<SignaturePad onSignatureChange={() => {}} />);

    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      const call = addEventListener.mock.calls.find(([name]) => name === type);
      expect(call, `${type} 應以原生監聽器註冊`).toBeTruthy();
      expect(call?.[2], `${type} 必須是 passive: false`).toMatchObject({ passive: false });
    }
  });

  it('觸控移動會 preventDefault，頁面因此不會被拖動', () => {
    stubCanvasContext();
    render(<SignaturePad onSignatureChange={() => {}} />);
    const canvas = getCanvas();

    dispatchTouch(canvas, 'touchstart', 10, 10);
    const move = dispatchTouch(canvas, 'touchmove', 40, 60);
    expect(move.defaultPrevented).toBe(true);
  });

  it('即使沒在畫（沒先 touchstart）也會擋掉捲動', () => {
    stubCanvasContext();
    render(<SignaturePad onSignatureChange={() => {}} />);

    const move = dispatchTouch(getCanvas(), 'touchmove', 40, 60);
    expect(move.defaultPrevented).toBe(true);
  });

  it('觸控畫完一筆會回報簽名資料並顯示已完成', () => {
    const ctx = stubCanvasContext();
    const onSignatureChange = vi.fn();
    render(<SignaturePad onSignatureChange={onSignatureChange} />);
    const canvas = getCanvas();

    dispatchTouch(canvas, 'touchstart', 10, 10);
    dispatchTouch(canvas, 'touchmove', 40, 60);
    dispatchTouch(canvas, 'touchend', 40, 60);

    expect(ctx.lineTo).toHaveBeenCalledWith(40, 60);
    expect(onSignatureChange).toHaveBeenCalledWith('data:image/png;base64,zz');
    expect(screen.getByText('已完成簽名')).toBeTruthy();
  });

  it('disabled 時觸控不會畫下任何筆跡', () => {
    const ctx = stubCanvasContext();
    const onSignatureChange = vi.fn();
    render(<SignaturePad onSignatureChange={onSignatureChange} disabled />);
    const canvas = getCanvas();

    dispatchTouch(canvas, 'touchstart', 10, 10);
    dispatchTouch(canvas, 'touchmove', 40, 60);
    dispatchTouch(canvas, 'touchend', 40, 60);

    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(onSignatureChange).not.toHaveBeenCalled();
  });

  it('清除簽名會清空畫布並回報 null', () => {
    const ctx = stubCanvasContext();
    const onSignatureChange = vi.fn();
    render(<SignaturePad onSignatureChange={onSignatureChange} />);
    const canvas = getCanvas();

    dispatchTouch(canvas, 'touchstart', 10, 10);
    dispatchTouch(canvas, 'touchmove', 40, 60);
    dispatchTouch(canvas, 'touchend', 40, 60);

    fireEvent.click(screen.getByRole('button', { name: /清除簽名/ }));

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 300, 160);
    expect(onSignatureChange).toHaveBeenLastCalledWith(null);
  });

  it('依 devicePixelRatio 設定畫布解析度（原本寫死 2x，iPhone 3x 會糊）', () => {
    const ctx = stubCanvasContext();
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });

    render(<SignaturePad onSignatureChange={() => {}} />);
    const canvas = getCanvas();

    expect(canvas.width).toBe(900);
    expect(canvas.height).toBe(480);
    expect(ctx.setTransform).toHaveBeenCalledWith(3, 0, 0, 3, 0, 0);

    Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true });
  });
});
