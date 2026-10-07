// CSV 匯出的收集迴圈。匯出檔是拿去跟銀行轉出紀錄對帳的，W6「不給半份」：
// offset 分頁遇到他人變更或在途寫入提交而位移時，迴圈會靜默少列或重複——所以收完要
// 核對（K7），任一不符就整份不交出，由頁面回報「資料有變動，請重新匯出」。
//
//   * 每一頁回應自帶的 total 都要等於起始 total：起始值本身可能已過期，只比最後
//     筆數會漏掉「開始前就新增」的列；
//   * 收完的筆數要等於起始 total、id 不得重複；
//   * 每個 await 之後都檢查仍掛載——離開頁面就停止，不下載。
import { describe, expect, it, vi } from 'vitest';
import { collectExportRows } from './withdrawalExport';

interface Row {
  id: string;
}

const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));

/** 依 offset 回傳預先排好的頁。 */
function pagesBy(map: Record<number, { items: Row[]; total: number }>) {
  return vi.fn(async ({ offset }: { limit: number; offset: number }) => {
    const p = map[offset];
    if (!p) throw new Error(`沒有預期 offset ${offset} 的請求`);
    return p;
  });
}

describe('collectExportRows', () => {
  it('依實際回傳的筆數前進，收齊起始總數就停', async () => {
    const loadPage = pagesBy({
      0: { items: rows('a', 'b'), total: 3 },
      2: { items: rows('c'), total: 3 },
    });
    const result = await collectExportRows({
      total: 3,
      pageSize: 2,
      loadPage,
      isMounted: () => true,
    });
    expect(result).toEqual({ ok: true, rows: rows('a', 'b', 'c') });
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('每收一頁回報一次進度', async () => {
    const onProgress = vi.fn();
    const loadPage = pagesBy({
      0: { items: rows('a', 'b'), total: 3 },
      2: { items: rows('c'), total: 3 },
    });
    await collectExportRows({ total: 3, pageSize: 2, loadPage, isMounted: () => true, onProgress });
    expect(onProgress.mock.calls).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });

  it('任一頁的總數與起始值不同時視為資料有變動', async () => {
    const loadPage = pagesBy({
      0: { items: rows('a', 'b'), total: 3 },
      2: { items: rows('c', 'd'), total: 4 },
    });
    const result = await collectExportRows({
      total: 3,
      pageSize: 2,
      loadPage,
      isMounted: () => true,
    });
    expect(result).toEqual({ ok: false, reason: 'changed' });
  });

  it('收完的筆數少於起始總數時視為資料有變動，不交出半份', async () => {
    const loadPage = pagesBy({
      0: { items: rows('a', 'b'), total: 3 },
      2: { items: [], total: 3 },
    });
    const result = await collectExportRows({
      total: 3,
      pageSize: 2,
      loadPage,
      isMounted: () => true,
    });
    expect(result).toEqual({ ok: false, reason: 'changed' });
  });

  it('分頁位移造成 id 重複時視為資料有變動', async () => {
    const loadPage = pagesBy({
      0: { items: rows('a', 'b'), total: 3 },
      2: { items: rows('b'), total: 3 },
    });
    const result = await collectExportRows({
      total: 3,
      pageSize: 2,
      loadPage,
      isMounted: () => true,
    });
    expect(result).toEqual({ ok: false, reason: 'changed' });
  });

  it('最後一頁在途時離開頁面，不交出資料', async () => {
    let mounted = true;
    const loadPage = vi.fn(async ({ offset }: { limit: number; offset: number }) => {
      if (offset === 2) mounted = false;
      return offset === 0 ? { items: rows('a', 'b'), total: 3 } : { items: rows('c'), total: 3 };
    });
    const result = await collectExportRows({
      total: 3,
      pageSize: 2,
      loadPage,
      isMounted: () => mounted,
    });
    expect(result).toEqual({ ok: false, reason: 'aborted' });
  });

  it('離開頁面之後不再發下一頁的請求', async () => {
    let mounted = true;
    const loadPage = vi.fn(async () => {
      mounted = false;
      return { items: rows('a', 'b'), total: 3 };
    });
    await collectExportRows({ total: 3, pageSize: 2, loadPage, isMounted: () => mounted });
    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it('讀取失敗時把錯誤往上丟，由頁面說出原因', async () => {
    const loadPage = vi.fn(async () => {
      throw new Error('連線中斷');
    });
    await expect(
      collectExportRows({ total: 3, pageSize: 2, loadPage, isMounted: () => true }),
    ).rejects.toThrow('連線中斷');
  });
});
