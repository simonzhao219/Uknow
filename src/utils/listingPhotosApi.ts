/**
 * 刊登照片的 Storage 清理（對應後端 DELETE /listings/photos、DELETE /listings/:id）。
 * 規劃：docs/plans/listing-photo-pipeline/plan.md §2.2。
 */

/** 刊登照片 bucket——與後端 listing-photos.ts 的 LISTING_PHOTOS_BUCKET 同一個字串。 */
export const LISTING_PHOTOS_BUCKET = 'make-5c6718b9-listings-photos';

/** 後端單次最多接受幾個 path（MAX_DELETE_PATHS）。 */
export const MAX_DELETE_PATHS = 10;

export function photoUrlToPath(_url: unknown): string | null {
  return '__stub__';
}

export function removedPaths(_before: string[], _after: string[]): string[] {
  return ['__stub__'];
}

export async function deleteListingPhotos(_paths: string[]): Promise<void> {
  return;
}

/** 存檔成功後的 best-effort 清理：失敗只 warn，不影響使用者流程。 */
export async function cleanupRemovedPhotos(_before: string[], _after: string[]): Promise<void> {
  return;
}

export async function deleteListing(_id: string): Promise<'deleted' | 'already-deleted'> {
  return 'deleted';
}
