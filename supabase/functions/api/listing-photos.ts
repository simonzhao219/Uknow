// ============================================================
// 刊登照片的 Storage 清理（DELETE /listings/photos、DELETE /listings/:id）。
// 規劃：docs/plans/listing-photo-pipeline/plan.md §2.1。
//
// 依賴方向：本檔**不得 import ./index.ts**（同 referral-invite.ts 的理由）；
// 資料庫與 Storage 都以注入式 deps 傳入，純邏輯可在 *.unit.test.ts 秒級驗證。
// ============================================================

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
