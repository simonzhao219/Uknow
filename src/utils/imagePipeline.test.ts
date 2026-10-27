import { describe, expect, it, vi } from 'vitest';
import { MAX_PHOTO_SIZE, MAX_PHOTO_SOURCE_SIZE, PHOTO_MAX_EDGE } from './constants';
import {
  classifyDecodeError,
  exportPhoto,
  type ImageIO,
  loadPhoto,
  type LoadedPhoto,
} from './imagePipeline';

const fileOf = (bytes: number, type = 'image/jpeg') =>
  ({ size: bytes, type, name: 'p.jpg' }) as unknown as File;

function fakeIO(over: Partial<ImageIO> = {}) {
  const calls = { decode: [] as number[], render: [] as unknown[][], encode: [] as number[] };
  const io: ImageIO = {
    supported: () => true,
    decode: (_file, maxEdge) => {
      calls.decode.push(maxEdge);
      return Promise.resolve({ width: 3200, height: 2400, handle: 'bitmap' });
    },
    render: (image, crop, edge) => {
      calls.render.push([image, crop, edge]);
      return Promise.resolve('canvas');
    },
    encode: (_canvas, quality) => {
      calls.encode.push(quality);
      return Promise.resolve(new Blob([new Uint8Array(100 * 1024)]));
    },
    ...over,
  };
  return { io, calls };
}

const photo = (size = 1_000_000): LoadedPhoto => ({
  image: { width: 3200, height: 2400, handle: 'bitmap' },
  file: fileOf(size),
});
const CROP = { x: 400, y: 0, width: 2400, height: 2400 };
const SOURCE = { width: 4000, height: 3000 };
const blobOf = (bytes: number) => new Blob([new Uint8Array(bytes)]);

describe('classifyDecodeError', () => {
  it('記憶體不足類錯誤分成 out_of_memory', () => {
    expect(classifyDecodeError(new RangeError('Array buffer allocation failed'))).toBe(
      'out_of_memory',
    );
    expect(classifyDecodeError(new Error('Out of memory'))).toBe('out_of_memory');
  });

  it('其他錯誤（格式無法讀取）分成 unreadable', () => {
    expect(classifyDecodeError(new DOMException('bad image', 'InvalidStateError'))).toBe(
      'unreadable',
    );
    expect(classifyDecodeError('boom')).toBe('unreadable');
  });
});

describe('loadPhoto', () => {
  it('瀏覽器缺少必要能力 → unsupported，不嘗試解碼', async () => {
    const { io, calls } = fakeIO({ supported: () => false });
    expect(await loadPhoto(io, fileOf(1000))).toEqual({ ok: false, error: 'unsupported' });
    expect(calls.decode).toEqual([]);
  });

  it('原檔超過 20MB → source_too_large，不嘗試解碼', async () => {
    const { io, calls } = fakeIO();
    const r = await loadPhoto(io, fileOf(MAX_PHOTO_SOURCE_SIZE + 1));
    expect(r).toEqual({ ok: false, error: 'source_too_large' });
    expect(calls.decode).toEqual([]);
  });

  it('原檔恰好 20MB 仍可處理（5–20MB 不被擋）', async () => {
    const { io } = fakeIO();
    expect((await loadPhoto(io, fileOf(MAX_PHOTO_SOURCE_SIZE))).ok).toBe(true);
  });

  it('解碼成功 → 帶回解碼後尺寸，並以限邊解碼', async () => {
    const { io, calls } = fakeIO();
    const r = await loadPhoto(io, fileOf(6 * 1024 * 1024));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.image).toMatchObject({ width: 3200, height: 2400 });
    expect(calls.decode.length).toBe(1);
    expect(calls.decode[0]).toBeGreaterThanOrEqual(PHOTO_MAX_EDGE);
  });

  it('解碼丟出記憶體錯誤 → out_of_memory；其他錯誤 → unreadable', async () => {
    const oom = fakeIO({ decode: () => Promise.reject(new RangeError('allocation failed')) });
    expect(await loadPhoto(oom.io, fileOf(1000))).toEqual({ ok: false, error: 'out_of_memory' });
    const bad = fakeIO({ decode: () => Promise.reject(new Error('cannot decode')) });
    expect(await loadPhoto(bad.io, fileOf(1000))).toEqual({ ok: false, error: 'unreadable' });
  });
});

describe('exportPhoto', () => {
  it('第一階品質就 ≤ 600KB → 只編一次，回該 blob', async () => {
    const { io, calls } = fakeIO();
    const r = await exportPhoto(io, photo(), CROP, SOURCE);
    expect(r.ok).toBe(true);
    expect(calls.encode).toEqual([0.82]);
  });

  it('把以原圖像素量的裁切框換算到解碼尺寸，輸出邊長不超過上限', async () => {
    const { io, calls } = fakeIO();
    await exportPhoto(io, photo(), { x: 500, y: 0, width: 3000, height: 3000 }, SOURCE);
    const [, crop, edge] = calls.render[0];
    expect(crop).toEqual({ x: 400, y: 0, width: 2400, height: 2400 });
    expect(edge).toBe(PHOTO_MAX_EDGE);
  });

  it('品質階梯由高到低重編，直到 ≤ 600KB 為止', async () => {
    const sizes: Record<number, number> = {
      0.82: 900 * 1024,
      0.72: 700 * 1024,
      0.62: 500 * 1024,
      0.5: 300 * 1024,
    };
    const { io, calls } = fakeIO({
      encode: (_c, q) => Promise.resolve(blobOf(sizes[q])),
    });
    const r = await exportPhoto(io, photo(), CROP, SOURCE);
    expect(calls.encode).toEqual([0.82, 0.72, 0.62]);
    expect(r.ok && r.value.quality).toBe(0.62);
  });

  it('階梯走完仍 > 600KB 但 ≤ 5MB → 取最低品質那份照收', async () => {
    const { io, calls } = fakeIO({ encode: () => Promise.resolve(blobOf(2 * 1024 * 1024)) });
    const r = await exportPhoto(io, photo(), CROP, SOURCE);
    expect(calls.encode).toEqual([0.82, 0.72, 0.62, 0.5]);
    expect(r.ok && r.value.quality).toBe(0.5);
  });

  it('階梯走完仍 > 5MB → unprocessable（不退回原檔）', async () => {
    const { io } = fakeIO({ encode: () => Promise.resolve(blobOf(MAX_PHOTO_SIZE + 1)) });
    expect(await exportPhoto(io, photo(), CROP, SOURCE)).toEqual({
      ok: false,
      error: 'unprocessable',
    });
  });

  it('編碼回 null → unprocessable，不退回原檔', async () => {
    const { io } = fakeIO({ encode: () => Promise.resolve(null) });
    expect(await exportPhoto(io, photo(), CROP, SOURCE)).toEqual({
      ok: false,
      error: 'unprocessable',
    });
  });

  it('繪製或編碼丟出例外 → unprocessable', async () => {
    const a = fakeIO({ render: () => Promise.reject(new Error('canvas')) });
    expect(await exportPhoto(a.io, photo(), CROP, SOURCE)).toEqual({
      ok: false,
      error: 'unprocessable',
    });
    const b = fakeIO({ encode: () => Promise.reject(new Error('encode')) });
    expect(await exportPhoto(b.io, photo(), CROP, SOURCE)).toEqual({
      ok: false,
      error: 'unprocessable',
    });
  });

  it('原檔超過 5MB 才標示 downscaled（顯示「已自動縮小」）', async () => {
    const { io } = fakeIO();
    const big = await exportPhoto(io, photo(MAX_PHOTO_SIZE + 1), CROP, SOURCE);
    const small = await exportPhoto(io, photo(MAX_PHOTO_SIZE), CROP, SOURCE);
    expect(big.ok && big.value.downscaled).toBe(true);
    expect(small.ok && small.value.downscaled).toBe(false);
  });

  it('不會呼叫與原檔有關的任何上傳路徑（只輸出 render／encode 的結果）', async () => {
    const encode = vi.fn(() => Promise.resolve(blobOf(1000)));
    const { io } = fakeIO({ encode });
    const r = await exportPhoto(io, photo(), CROP, SOURCE);
    expect(r.ok && r.value.blob.size).toBe(1000);
  });
});
