// ============================================================
// 刊登照片的 Storage 清理（DELETE /listings/photos、DELETE /listings/:id）。
// 規劃：docs/plans/listing-photo-pipeline/plan.md §2.1。
//
// 依賴方向：本檔**不得 import ./index.ts**（同 referral-invite.ts 的理由）；
// 資料庫與 Storage 都以注入式 deps 傳入，純邏輯可在 *.unit.test.ts 秒級驗證。
// ============================================================

import type { Context } from 'npm:hono@4';

/** 刊登照片 bucket 的單一事實來源（upload-photo 與清理共用，勿再複製字串）。 */
export const LISTING_PHOTOS_BUCKET = 'make-5c6718b9-listings-photos';

/** DELETE /listings/photos 單次最多幾個 path。 */
export const MAX_DELETE_PATHS = 10;

export type DeletePathsValidation =
  | { ok: true; paths: string[] }
  | { ok: false; status: 400 | 403; message: string };

/** upload-photo 產生的 path 形狀（不含 uid 前綴）：`<時間戳>_<小寫英數>.<副檔名>`。 */
const FILE_PART = String.raw`\d+_[a-z0-9]+\.(?:jpg|png|webp)`;
/** 任何使用者前綴（UUID）——用來區分「他人的合法 path」（403）與「根本不合格式」（400）。 */
const ANY_OWNER_PATTERN = new RegExp(
  String.raw`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/${FILE_PART}$`,
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 只收 `<userId>/<時間戳>_<英數>.<jpg|png|webp>`；userId 取自 token，不信 client。 */
export function listingPhotoPathPattern(userId: string): RegExp {
  return new RegExp(`^${escapeRegExp(userId)}/${FILE_PART}$`);
}

/**
 * 驗證 DELETE /listings/photos 的 body。任一筆不合整批拒絕（不部分刪）：
 * 非物件／非陣列／空／非字串／重複／超量／格式不合 → 400；格式合法但屬他人前綴 → 403。
 */
export function validateDeletePathsBody(body: unknown, userId: string): DeletePathsValidation {
  const paths = (body as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(paths) || paths.length === 0) {
    return { ok: false, status: 400, message: '請提供要刪除的照片路徑' };
  }
  if (paths.length > MAX_DELETE_PATHS) {
    return { ok: false, status: 400, message: `單次最多刪除 ${MAX_DELETE_PATHS} 張` };
  }
  if (!paths.every((p) => typeof p === 'string')) {
    return { ok: false, status: 400, message: '照片路徑格式錯誤' };
  }
  if (new Set(paths).size !== paths.length) {
    return { ok: false, status: 400, message: '照片路徑不得重複' };
  }
  const own = listingPhotoPathPattern(userId);
  let foreign = false;
  for (const p of paths as string[]) {
    if (own.test(p)) continue;
    if (ANY_OWNER_PATTERN.test(p)) foreign = true;
    else return { ok: false, status: 400, message: '照片路徑格式錯誤' };
  }
  if (foreign) return { ok: false, status: 403, message: '無權刪除他人的照片' };
  return { ok: true, paths: paths as string[] };
}

/**
 * 把 listings.photos 內的 public URL 解析回 path；只接受「以本 bucket publicUrl base 開頭」
 * 且解析後符合刊登者自己前綴的格式——RLS 允許使用者把 photos 寫成任意字串，
 * 不自驗的話可借 service_role 刪他人的檔。不符者回 null（呼叫端 warn 並忽略）。
 */
export function photoUrlToOwnedPath(
  url: unknown,
  publicBase: string,
  userId: string,
): string | null {
  if (typeof url !== 'string' || !url.startsWith(publicBase)) return null;
  const path = url.slice(publicBase.length);
  return listingPhotoPathPattern(userId).test(path) ? path : null;
}

export interface PhotoCleanupDeps {
  /** storage getPublicUrl(path) 的結果（與 upload-photo 回傳同一格式）。 */
  publicUrlOf: (path: string) => string;
  /** 回傳 listings.photos（全表、跨使用者）仍含有的 URL；查詢出錯必須 throw。 */
  findReferencedUrls: (urls: string[]) => Promise<string[]>;
  /** Storage remove；回傳實際被刪的 path；出錯必須 throw。 */
  removeObjects: (paths: string[]) => Promise<string[]>;
}

/**
 * 刪掉「沒有任何刊登仍引用」的照片。引用檢查跨使用者全表（以 deps.publicUrlOf 重組 URL，
 * 與 upload-photo 回傳同一格式）、一次批次查詢；查詢出錯 throw 且一檔不刪（fail-closed）。
 * `removed` 取 Storage 實際回傳數（不存在的檔不算、重送冪等）。
 */
export async function removeUnreferencedPhotos(
  deps: PhotoCleanupDeps,
  paths: string[],
): Promise<{ removed: number; skipped: string[] }> {
  if (paths.length === 0) return { removed: 0, skipped: [] };
  const referenced = new Set(await deps.findReferencedUrls(paths.map(deps.publicUrlOf)));
  const skipped = paths.filter((p) => referenced.has(deps.publicUrlOf(p)));
  const toRemove = paths.filter((p) => !referenced.has(deps.publicUrlOf(p)));
  if (toRemove.length === 0) return { removed: 0, skipped };
  const removedPaths = await deps.removeObjects(toRemove);
  return { removed: removedPaths.length, skipped };
}

// ============================================================
// 路由處理函式（依賴注入；index.ts 組一次 deps 並註冊路由）
// ============================================================
/** 兩個端點各自的限流（fail-open；放大風險由單次 10 筆與前綴約束托底）。 */
export const LISTING_PHOTOS_DELETE_RATE = { max: 20, windowSeconds: 60 };
export const LISTING_DELETE_RATE = { max: 20, windowSeconds: 60 };

export interface ListingPhotoHandlerDeps {
  requireAuth: (c: Context) => Promise<{ id: string } | null>;
  rateLimit: (key: string, max: number, windowSeconds: number) => Promise<boolean>;
  cleanup: PhotoCleanupDeps;
  /** 刪除該使用者的該筆刊登並回傳被刪列的 photos；不存在或非本人回 null；DB 錯誤必須 throw。 */
  deleteListingRow: (id: string, userId: string) => Promise<{ photos: string[] } | null>;
  warn: (message: string, ...detail: unknown[]) => void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 錯誤形狀 `{ success:false, error:{ code, message } }`：前端依 code 分流
// （extractApiErrorCode；`not_found` 才被視為「已刪除」，裸 404 不是）。
function fail(
  c: Context,
  status: 400 | 401 | 403 | 404 | 429 | 500,
  code: string,
  message: string,
) {
  return c.json({ success: false, error: { code, message } }, status);
}

export function createListingPhotoHandlers(deps: ListingPhotoHandlerDeps) {
  /** 逐一把 photos URL 解析成刊登者自己的 path，不符者忽略並 warn，再走引用檢查清理。 */
  async function cleanupListingPhotos(userId: string, photoUrls: string[]): Promise<void> {
    const base = deps.cleanup.publicUrlOf('');
    const paths: string[] = [];
    for (const url of photoUrls) {
      const path = photoUrlToOwnedPath(url, base, userId);
      if (path) paths.push(path);
      else deps.warn('[listing-photos] 忽略非本人／非本 bucket 的照片 URL', url);
    }
    await removeUnreferencedPhotos(deps.cleanup, [...new Set(paths)]);
  }

  return {
    deletePhotos: async (c: Context) => {
      const user = await deps.requireAuth(c);
      if (!user) return fail(c, 401, 'unauthorized', '未授權');
      const { max, windowSeconds } = LISTING_PHOTOS_DELETE_RATE;
      if (!(await deps.rateLimit(`listing-photos-del:${user.id}`, max, windowSeconds))) {
        return fail(c, 429, 'rate_limited', '操作太頻繁，請稍後再試');
      }
      const body = await c.req.json().catch(() => null);
      const v = validateDeletePathsBody(body, user.id);
      if (!v.ok) {
        return fail(c, v.status, v.status === 403 ? 'forbidden' : 'invalid_request', v.message);
      }
      try {
        const result = await removeUnreferencedPhotos(deps.cleanup, v.paths);
        return c.json({ success: true, ...result });
      } catch (err) {
        console.error('[listing-photos] 清理失敗', err);
        return fail(c, 500, 'cleanup_failed', '照片清理失敗');
      }
    },

    deleteListing: async (c: Context) => {
      const user = await deps.requireAuth(c);
      if (!user) return fail(c, 401, 'unauthorized', '未授權');
      const { max, windowSeconds } = LISTING_DELETE_RATE;
      if (!(await deps.rateLimit(`listing-del:${user.id}`, max, windowSeconds))) {
        return fail(c, 429, 'rate_limited', '操作太頻繁，請稍後再試');
      }
      const id = c.req.param('id') ?? '';
      // 非 UUID 回「無標記」的 404：前端只把帶 not_found 的 404 當作已刪除。
      if (!UUID_PATTERN.test(id)) return fail(c, 404, 'invalid_id', '無效的刊登編號');
      let row: { photos: string[] } | null;
      try {
        row = await deps.deleteListingRow(id, user.id);
      } catch (err) {
        console.error('[listing-photos] 刪除刊登失敗', err);
        return fail(c, 500, 'delete_failed', '刪除失敗');
      }
      if (!row) return fail(c, 404, 'not_found', '刊登不存在');
      // 列已刪：Storage 清理失敗只 warn，不可使刪除回報失敗。
      try {
        await cleanupListingPhotos(user.id, row.photos ?? []);
      } catch (err) {
        deps.warn('[listing-photos] 刪刊登後 Storage 清理失敗（列已刪）', err);
      }
      return c.json({ success: true });
    },
  };
}
