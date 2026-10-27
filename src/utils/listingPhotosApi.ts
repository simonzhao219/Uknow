import {
  ApiError,
  apiErrorFromBody,
  apiRequest,
  buildApiUrl,
  extractApiErrorCode,
} from './apiClient';

/**
 * 刊登照片的 Storage 清理（對應後端 DELETE /listings/photos、DELETE /listings/:id）。
 * 規格：規格書 §11、§14。
 */

/** 刊登照片 bucket——與後端 listing-photos.ts 的 LISTING_PHOTOS_BUCKET 同一個字串。 */
export const LISTING_PHOTOS_BUCKET = 'make-5c6718b9-listings-photos';

/** 後端單次最多接受幾個 path（MAX_DELETE_PATHS）。 */
export const MAX_DELETE_PATHS = 10;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** 本 bucket 的 public URL，且 path 為 `<uid>/<時間戳>_<英數>.<jpg|png|webp>`（upload-photo 的產物）。 */
const PHOTO_URL_PATTERN = new RegExp(
  `^https?://[^/]+/storage/v1/object/public/${LISTING_PHOTOS_BUCKET}/(${UUID}/\\d+_[a-z0-9]+\\.(?:jpg|png|webp))$`,
);

/** 把 listings.photos 內的 URL 解析成 Storage path；非本 bucket／格式不合一律 null（忽略）。 */
export function photoUrlToPath(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  return PHOTO_URL_PATTERN.exec(url)?.[1] ?? null;
}

/** 存檔前有、存檔後沒有的合法 path（依 before 的順序、去重）。 */
export function removedPaths(before: string[], after: string[]): string[] {
  const kept = new Set(after.map(photoUrlToPath));
  const removed: string[] = [];
  for (const url of before) {
    const path = photoUrlToPath(url);
    if (path && !kept.has(path) && !removed.includes(path)) removed.push(path);
  }
  return removed;
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

export async function deleteListingPhotos(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += MAX_DELETE_PATHS) {
    const res = await apiRequest(buildApiUrl('/listings/photos'), {
      method: 'DELETE',
      body: JSON.stringify({ paths: paths.slice(i, i + MAX_DELETE_PATHS) }),
    });
    if (!res.ok) throw apiErrorFromBody(await readJson(res), res.status);
  }
}

/** 存檔成功後的 best-effort 清理：失敗只 warn，不影響使用者流程。 */
export async function cleanupRemovedPhotos(before: string[], after: string[]): Promise<void> {
  try {
    await deleteListingPhotos(removedPaths(before, after));
  } catch (error) {
    console.warn('[listingPhotos] 清理已移除的照片失敗（孤兒檔留待維運補清）', error);
  }
}

/**
 * 刪除刊登（後端刪列並清 Storage）。只有帶 `not_found` 標記的 404 才視為「已刪除」——
 * 前端可能先於 Edge 上線，裸 404 是路由不存在，不能當成已刪。
 */
export async function deleteListing(id: string): Promise<'deleted' | 'already-deleted'> {
  const res = await apiRequest(buildApiUrl(`/listings/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  if (res.ok) return 'deleted';
  const body = await readJson(res);
  if (res.status === 404 && extractApiErrorCode(body) === 'not_found') return 'already-deleted';
  throw apiErrorFromBody(body, res.status);
}

/** 單張上傳的逾時（弱網／LINE 內建瀏覽器掛起時，讓該格進 failed 以便重試或移除）。 */
export const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * 上傳一張已處理好的 JPEG（走 apiClient：附 token、401 refresh）；回傳 public URL。
 * 逾時後伺服器端可能其實已成功（重試會多一個檔成孤兒，見規格書 §14）。
 */
export async function uploadListingPhoto(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('file', new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await apiRequest(buildApiUrl('/listings/upload-photo'), {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const body = await readJson(res);
    if (!res.ok) throw apiErrorFromBody(body, res.status);
    const photoUrl = (body as { photoUrl?: unknown } | null)?.photoUrl;
    if (typeof photoUrl !== 'string' || !photoUrl) {
      throw new ApiError('上傳失敗：伺服器沒有回傳照片網址', res.status);
    }
    return photoUrl;
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError('上傳逾時，請重試', undefined, 'TIMEOUT');
    // fetch 例外的原文是瀏覽器的英文（Failed to fetch／Load failed），不直接顯示給使用者。
    if (error instanceof ApiError && error.code === 'NETWORK_ERROR') {
      throw new ApiError('網路不穩，上傳沒有成功，請重試', undefined, 'NETWORK_ERROR');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
