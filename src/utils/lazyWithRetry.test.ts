import { describe, expect, it, vi } from 'vitest';
import { CHUNK_RELOADED_KEY, importWithRetry } from './lazyWithRetry';

/** 可控的 sessionStorage 替身——只需要 get/set/remove 三支。 */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

describe('importWithRetry', () => {
  it('loader 一次就成功時原樣回傳模組，不重試也不重載', async () => {
    const loader = vi.fn().mockResolvedValue({ AdminDashboard: 'ok' });
    const reload = vi.fn();

    const mod = await importWithRetry(loader, { reload, storage: fakeStorage() });

    expect(mod).toEqual({ AdminDashboard: 'ok' });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('首次失敗、重試成功時回傳模組且不重載整頁', async () => {
    // 暫時性網路失誤（行動網路切換、CDN 邊緣節點抖動）第二次就過了，
    // 不該用一次整頁重載去修一個自己會好的問題。
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ AdminDashboard: 'ok' });
    const reload = vi.fn();

    const mod = await importWithRetry(loader, { reload, storage: fakeStorage() });

    expect(mod).toEqual({ AdminDashboard: 'ok' });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('連兩次失敗時整頁重載一次，去換一份新的資產清單', async () => {
    // 這就是本次 bug 的形狀：新部署換掉了 chunk 的 hash，舊分頁手上的
    // index.html 指向的檔案已不存在。重載才拿得到新的檔名。
    const loader = vi.fn().mockRejectedValue(new Error('Importing a module script failed'));
    const reload = vi.fn();
    const storage = fakeStorage();

    await expect(importWithRetry(loader, { reload, storage })).rejects.toThrow();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOADED_KEY)).toBe('1');
  });

  it('已重載過仍失敗就不再重載，避免無限重載迴圈', async () => {
    // 重載沒解決問題（真的壞掉的部署）時，再重載一次只會把使用者
    // 關進迴圈。這時把錯誤往外拋，讓 ErrorBoundary 顯示可讀的後備畫面。
    const loader = vi.fn().mockRejectedValue(new Error('boom'));
    const reload = vi.fn();
    const storage = fakeStorage({ [CHUNK_RELOADED_KEY]: '1' });

    await expect(importWithRetry(loader, { reload, storage })).rejects.toThrow('boom');

    expect(reload).not.toHaveBeenCalled();
  });

  it('載入成功會清掉重載旗標，讓下一次部署仍能自癒', async () => {
    const loader = vi.fn().mockResolvedValue({ AdminDashboard: 'ok' });
    const storage = fakeStorage({ [CHUNK_RELOADED_KEY]: '1' });

    await importWithRetry(loader, { reload: vi.fn(), storage });

    expect(storage.getItem(CHUNK_RELOADED_KEY)).toBeNull();
  });

  it('沒有 storage 可用時一律不重載，寧可顯示錯誤也不冒迴圈風險', async () => {
    // 無痕模式／停用 storage 的瀏覽器：少了「已重載過」這個記號就沒有
    // 迴圈防線，此時放棄自癒是唯一安全的選擇。
    const loader = vi.fn().mockRejectedValue(new Error('boom'));
    const reload = vi.fn();

    await expect(importWithRetry(loader, { reload, storage: null })).rejects.toThrow('boom');

    expect(reload).not.toHaveBeenCalled();
  });
});
