// 刊登照片清理的前端契約：URL→path 解析（非本 bucket 一律忽略）、存檔前後 diff、
// 分批呼叫、best-effort 清理，以及「只有帶 not_found 標記的 404 才算已刪除」——
// 前端（Cloudflare）可能先於 Edge 上線，裸 404 是路由不存在，不能當成已刪。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('./apiClient', async (orig) => ({
  ...(await orig<typeof import('./apiClient')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  buildApiUrl: (p: string) => `https://api.test${p}`,
}));

import { ApiError } from './apiClient';
import {
  cleanupRemovedPhotos,
  deleteListing,
  deleteListingPhotos,
  LISTING_PHOTOS_BUCKET,
  photoUrlToPath,
  removedPaths,
  uploadListingPhoto,
} from './listingPhotosApi';

const UID = '11111111-2222-3333-4444-555555555555';
const BASE = `https://proj.supabase.co/storage/v1/object/public/${LISTING_PHOTOS_BUCKET}/`;
const pathOf = (n: string, ext = 'jpg') => `${UID}/${n}.${ext}`;
const urlOf = (n: string, ext = 'jpg') => `${BASE}${pathOf(n, ext)}`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  apiRequest.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('photoUrlToPath', () => {
  it('本 bucket 的 public URL → path', () => {
    expect(photoUrlToPath(urlOf('1700000000000_abc123'))).toBe(pathOf('1700000000000_abc123'));
    expect(photoUrlToPath(urlOf('1700000000000_abc123', 'webp'))).toBe(
      pathOf('1700000000000_abc123', 'webp'),
    );
  });

  it('其他 bucket／外部網址／路徑穿越／多層／非字串 → null', () => {
    const bad: unknown[] = [
      'https://proj.supabase.co/storage/v1/object/public/other-bucket/' +
        pathOf('1700000000000_abc123'),
      'https://example.com/a.jpg',
      `${BASE}${UID}/../x/1700000000000_abc123.jpg`,
      `${BASE}${UID}/sub/1700000000000_abc123.jpg`,
      `${BASE}${UID}/1700000000000_abc123.gif`,
      `${BASE}${UID}/1700000000000_abc123.jpg?t=1`,
      '',
      null,
      undefined,
      42,
    ];
    for (const u of bad) expect(photoUrlToPath(u), String(u)).toBeNull();
  });
});

describe('removedPaths', () => {
  it('存檔前有、存檔後沒有的合法 path；順序依 before，去重', () => {
    const a = urlOf('1_a');
    const b = urlOf('2_b');
    const c = urlOf('3_c');
    expect(removedPaths([a, b, c, b], [a, c])).toEqual([pathOf('2_b')]);
  });

  it('沒有變動 → 空陣列；怪項（非本 bucket）不進清單', () => {
    const a = urlOf('1_a');
    expect(removedPaths([a], [a])).toEqual([]);
    expect(removedPaths([a, 'https://example.com/x.jpg', ''], [])).toEqual([pathOf('1_a')]);
  });
});

describe('deleteListingPhotos', () => {
  it('空清單不發請求', async () => {
    await deleteListingPhotos([]);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('DELETE JSON { paths }；超過 10 筆分批', async () => {
    apiRequest.mockResolvedValue(json(200, { success: true, removed: 1, skipped: [] }));
    const paths = Array.from({ length: 11 }, (_, i) => pathOf(`${i}_a`));
    await deleteListingPhotos(paths);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    const [url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('https://api.test/listings/photos');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ paths: paths.slice(0, 10) });
    expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({ paths: paths.slice(10) });
  });

  it('後端非 2xx → throw ApiError（帶後端訊息與 status）', async () => {
    apiRequest.mockResolvedValue(
      json(403, { success: false, error: { code: 'forbidden', message: '無權刪除他人的照片' } }),
    );
    const err = await deleteListingPhotos([pathOf('1_a')]).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe('無權刪除他人的照片');
  });
});

describe('cleanupRemovedPhotos', () => {
  it('有被移除的檔 → 呼叫刪除', async () => {
    apiRequest.mockResolvedValue(json(200, { success: true, removed: 1, skipped: [] }));
    await cleanupRemovedPhotos([urlOf('1_a'), urlOf('2_b')], [urlOf('1_a')]);
    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ paths: [pathOf('2_b')] });
  });

  it('沒有被移除的檔 → 不發請求', async () => {
    await cleanupRemovedPhotos([urlOf('1_a')], [urlOf('1_a')]);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('失敗只 warn、不 throw（best-effort，不影響存檔成功）', async () => {
    apiRequest.mockRejectedValue(new ApiError('網絡請求失敗', undefined, 'NETWORK_ERROR'));
    await expect(cleanupRemovedPhotos([urlOf('1_a')], [])).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('deleteListing', () => {
  it('回 200 時視為已刪除並呼叫 DELETE /listings/:id', async () => {
    apiRequest.mockResolvedValue(json(200, { success: true }));
    await expect(deleteListing('abc')).resolves.toBe('deleted');
    const [url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('https://api.test/listings/abc');
    expect(init.method).toBe('DELETE');
  });

  it('404 且帶 not_found 標記 → already-deleted（重送冪等）', async () => {
    apiRequest.mockResolvedValue(
      json(404, { success: false, error: { code: 'not_found', message: '刊登不存在' } }),
    );
    await expect(deleteListing('abc')).resolves.toBe('already-deleted');
  });

  it('裸 404（Edge 尚未部署新路由）→ throw，不當成已刪除', async () => {
    apiRequest.mockResolvedValue(json(404, { error: 'Not Found' }));
    await expect(deleteListing('abc')).rejects.toMatchObject({ status: 404 });
  });

  it('404 但標記不是 not_found（例如非 UUID）→ throw', async () => {
    apiRequest.mockResolvedValue(
      json(404, { success: false, error: { code: 'invalid_id', message: '無效的刊登編號' } }),
    );
    await expect(deleteListing('abc')).rejects.toBeInstanceOf(ApiError);
  });

  it('500／網路錯誤 → throw', async () => {
    apiRequest.mockResolvedValue(
      json(500, { success: false, error: { code: 'delete_failed', message: '刪除失敗' } }),
    );
    await expect(deleteListing('abc')).rejects.toMatchObject({ status: 500, message: '刪除失敗' });
  });
});

describe('uploadListingPhoto', () => {
  const blob = () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' });

  it('以 multipart POST /listings/upload-photo，欄位 file 為 JPEG，回傳 photoUrl', async () => {
    apiRequest.mockResolvedValue(
      json(200, { success: true, photoUrl: 'https://cdn.test/u/1.jpg' }),
    );
    await expect(uploadListingPhoto(blob())).resolves.toBe('https://cdn.test/u/1.jpg');
    const [url, init] = apiRequest.mock.calls[0];
    expect(url).toBe('https://api.test/listings/upload-photo');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const file = (init.body as FormData).get('file') as File;
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toMatch(/\.jpg$/);
  });

  it('後端字串信封的錯誤訊息被讀出來（不是通用 fallback）', async () => {
    apiRequest.mockResolvedValue(json(400, { error: '檔案不得超過 5MB' }));
    const err = await uploadListingPhoto(blob()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('檔案不得超過 5MB');
    expect(err.status).toBe(400);
  });

  it('成功但沒有 photoUrl → throw（不回傳空字串）', async () => {
    apiRequest.mockResolvedValue(json(200, { success: true }));
    await expect(uploadListingPhoto(blob())).rejects.toBeInstanceOf(ApiError);
  });
});

describe('uploadListingPhoto 逾時', () => {
  const blob = () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
  afterEach(() => vi.useRealTimers());

  it('帶 AbortSignal 發請求；請求卡住超過 60 秒 → 逾時失敗，可重試', async () => {
    vi.useFakeTimers();
    apiRequest.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new ApiError('網絡請求失敗', undefined, 'NETWORK_ERROR')),
          );
        }),
    );
    const pending = uploadListingPhoto(blob()).catch((e) => e);
    expect(apiRequest.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(apiRequest.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    const err = await pending;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain('逾時');
  });

  it('正常完成後不留下計時器', async () => {
    vi.useFakeTimers();
    apiRequest.mockResolvedValue(
      json(200, { success: true, photoUrl: 'https://cdn.test/u/1.jpg' }),
    );
    await uploadListingPhoto(blob());
    expect(vi.getTimerCount()).toBe(0);
  });
});
