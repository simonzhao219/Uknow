// @vitest-environment jsdom
//
// ImageIO 的瀏覽器實作：缺 API 時 supported() 為 false；解碼只在最長邊超過上限時才縮小（不放大）；
// 繪製時先鋪白底（透明 PNG 轉 JPEG 不變黑）再畫裁切範圍；編碼走 canvas.toBlob 的 JPEG。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserImageIO } from './browserImageIO';

const createImageBitmapMock = vi.fn();

class FakeImage {
  naturalWidth = 4000;
  naturalHeight = 3000;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  createImageBitmapMock.mockReset().mockResolvedValue({ width: 1, height: 1, close: vi.fn() });
  vi.stubGlobal('createImageBitmap', createImageBitmapMock);
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:x'),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });

describe('browserImageIO.supported', () => {
  it('createImageBitmap 與 canvas.toBlob 都在 → true', () => {
    expect(browserImageIO.supported()).toBe(true);
  });

  it('缺 createImageBitmap → false', () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(browserImageIO.supported()).toBe(false);
  });

  it('缺 canvas.toBlob → false', () => {
    const original = HTMLCanvasElement.prototype.toBlob;
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(browserImageIO.supported()).toBe(false);
    } finally {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('browserImageIO.decode', () => {
  it('最長邊超過上限 → 以套用 EXIF 方向的選項縮小解碼', async () => {
    const r = await browserImageIO.decode(file, 3200);
    expect(r.width).toBe(3200);
    expect(r.height).toBe(2400);
    const [, options] = createImageBitmapMock.mock.calls[0];
    expect(options).toMatchObject({
      imageOrientation: 'from-image',
      resizeWidth: 3200,
      resizeHeight: 2400,
    });
  });

  it('沒超過上限 → 不放大，用原尺寸', async () => {
    FakeImage.prototype.naturalWidth = 800;
    const small = class extends FakeImage {
      naturalWidth = 800;
      naturalHeight = 600;
    };
    vi.stubGlobal('Image', small);
    const r = await browserImageIO.decode(file, 3200);
    expect(r).toMatchObject({ width: 800, height: 600 });
    const [, options] = createImageBitmapMock.mock.calls[0];
    expect(options.resizeWidth).toBeUndefined();
    expect(options.imageOrientation).toBe('from-image');
  });

  it('createImageBitmap 失敗 → 往上拋（由 pipeline 分類）', async () => {
    createImageBitmapMock.mockRejectedValue(new DOMException('bad', 'InvalidStateError'));
    await expect(browserImageIO.decode(file, 3200)).rejects.toThrow();
  });

  it('讀不到圖片尺寸（Image onerror）→ 拋錯', async () => {
    const broken = class extends FakeImage {
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    };
    vi.stubGlobal('Image', broken);
    await expect(browserImageIO.decode(file, 3200)).rejects.toThrow();
  });
});

describe('browserImageIO.render／encode', () => {
  it('先鋪白底，再把裁切範圍畫成 edge×edge 的正方形', async () => {
    const calls: unknown[][] = [];
    const ctx = {
      fillStyle: '',
      imageSmoothingQuality: '',
      fillRect: (...a: unknown[]) => calls.push(['fillRect', ...a]),
      drawImage: (...a: unknown[]) => calls.push(['drawImage', ...a]),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const canvas = (await browserImageIO.render(
      { width: 3200, height: 2400, handle: 'bitmap' },
      { x: 400, y: 0, width: 2400, height: 2400 },
      1600,
    )) as HTMLCanvasElement;
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1600);
    expect(ctx.fillStyle).toBe('#ffffff');
    expect(calls[0]).toEqual(['fillRect', 0, 0, 1600, 1600]);
    expect(calls[1]).toEqual(['drawImage', 'bitmap', 400, 0, 2400, 2400, 0, 0, 1600, 1600]);
  });

  it('取不到 2D context → 拋錯（pipeline 轉成 unprocessable）', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(
      browserImageIO.render(
        { width: 10, height: 10, handle: 'b' },
        { x: 0, y: 0, width: 10, height: 10 },
        10,
      ),
    ).rejects.toThrow();
  });

  it('encode 以 JPEG 與指定品質呼叫 toBlob，回傳 blob（失敗為 null）', async () => {
    const toBlob = vi.fn((cb: (b: Blob | null) => void, type?: string, q?: number) => {
      void type;
      void q;
      cb(new Blob(['j']));
    });
    const canvas = { toBlob } as unknown as HTMLCanvasElement;
    const blob = await browserImageIO.encode(canvas, 0.82);
    expect(blob).toBeInstanceOf(Blob);
    expect(toBlob.mock.calls[0][1]).toBe('image/jpeg');
    expect(toBlob.mock.calls[0][2]).toBe(0.82);

    const failing = {
      toBlob: (cb: (b: Blob | null) => void) => cb(null),
    } as unknown as HTMLCanvasElement;
    expect(await browserImageIO.encode(failing, 0.5)).toBeNull();
  });
});

describe('browserImageIO.release', () => {
  it('關閉解碼後的 ImageBitmap 以釋放記憶體', () => {
    const close = vi.fn();
    browserImageIO.release?.({ width: 1, height: 1, handle: { close } });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('把手沒有 close（非 ImageBitmap）時不會拋錯', () => {
    expect(() => browserImageIO.release?.({ width: 1, height: 1, handle: 'x' })).not.toThrow();
  });
});
