import type { PagedResult } from '../../hooks/usePagedList';

/**
 * CSV 匯出的收集迴圈。匯出檔是拿去跟銀行轉出紀錄對帳的——W6「不給半份」：
 *
 * - **依實際回傳筆數前進**，不是依要求的 limit：伺服器可以回得比要求的少，照固定步長跳
 *   會靜默跳過那幾筆。
 * - **完成核對（K7）**：offset 分頁遇到他人變更或在途寫入提交而位移時，迴圈會靜默少列或
 *   重複。所以每一頁回應自帶的 total 都要等於起始 total（起始值本身可能已過期，只比最後
 *   筆數會漏掉「開始前就新增」的列），收完的筆數要等於起始 total、id 不得重複；任一不符
 *   就整份不交出（`changed`），由頁面回報「匯出途中資料有變動，請重新匯出」。
 * - **離開就停**：每個 await 之後都檢查仍掛載，卸載就不再發下一頁、也不交出資料
 *   （`aborted`）——離開 /admin 之後不該冒出一份下載。
 *
 * 讀取失敗直接往上丟：`loadPage` 是 useAdminList 給的、帶 403 偵測的取數，403 會先清空
 * 快取再丟出來。
 */
export type ExportCollection<T> =
  | { ok: true; rows: T[] }
  | { ok: false; reason: 'changed' | 'aborted' };

export interface CollectOptions<T> {
  /** 起始的（確認過的）總筆數。 */
  total: number;
  pageSize: number;
  loadPage: (page: { limit: number; offset: number }) => Promise<PagedResult<T>>;
  isMounted: () => boolean;
  onProgress?: (collected: number, total: number) => void;
}

export async function collectExportRows<T extends { id: string }>({
  total,
  pageSize,
  loadPage,
  isMounted,
  onProgress,
}: CollectOptions<T>): Promise<ExportCollection<T>> {
  const rows: T[] = [];
  while (rows.length < total) {
    const page = await loadPage({ limit: pageSize, offset: rows.length });
    if (!isMounted()) return { ok: false, reason: 'aborted' };
    if (page.total !== total) return { ok: false, reason: 'changed' };
    const batch = page.items ?? [];
    if (batch.length === 0) break; // 回空頁就停，避免無限迴圈；少收的由下面的核對擋下
    rows.push(...batch);
    onProgress?.(rows.length, total);
  }
  const ids = new Set(rows.map((row) => row.id));
  if (rows.length !== total || ids.size !== rows.length) return { ok: false, reason: 'changed' };
  return { ok: true, rows };
}
