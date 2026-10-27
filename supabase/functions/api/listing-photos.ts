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

export function listingPhotoPathPattern(_userId: string): RegExp {
  return /$^/;
}

export function validateDeletePathsBody(_body: unknown, _userId: string): DeletePathsValidation {
  return { ok: false, status: 400, message: 'stub' };
}

export function photoUrlToOwnedPath(
  _url: unknown,
  _publicBase: string,
  _userId: string,
): string | null {
  return null;
}

export interface PhotoCleanupDeps {
  /** storage getPublicUrl(path) 的結果（與 upload-photo 回傳同一格式）。 */
  publicUrlOf: (path: string) => string;
  /** 回傳 listings.photos（全表、跨使用者）仍含有的 URL；查詢出錯必須 throw。 */
  findReferencedUrls: (urls: string[]) => Promise<string[]>;
  /** Storage remove；回傳實際被刪的 path；出錯必須 throw。 */
  removeObjects: (paths: string[]) => Promise<string[]>;
}

export async function removeUnreferencedPhotos(
  _deps: PhotoCleanupDeps,
  _paths: string[],
): Promise<{ removed: number; skipped: string[] }> {
  return { removed: -1, skipped: [] };
}
