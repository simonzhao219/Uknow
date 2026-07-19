import { describe, it, expect, vi } from 'vitest';
import { dedupe } from './requestDedup';

// Characterization（Phase 1 護欄）：in-flight 去重合約，Phase 3 四個 hook
// 收斂到 useFetchData 後仍須維持相同語意。
describe('dedupe — module-scope in-flight 去重', () => {
  it('同一 key 飛行中：後續呼叫共用同一個 promise、fn 只執行一次', async () => {
    let resolveFn: () => void = () => {};
    const fn = vi.fn(() => new Promise<void>((r) => { resolveFn = r; }));

    const p1 = dedupe('k', fn);
    const p2 = dedupe('k', fn);

    expect(p1).toBe(p2);
    expect(fn).toHaveBeenCalledTimes(1);

    resolveFn();
    await p1;
  });

  it('不同 key 各自獨立飛行', async () => {
    const fnA = vi.fn(() => Promise.resolve());
    const fnB = vi.fn(() => Promise.resolve());
    await Promise.all([dedupe('a', fnA), dedupe('b', fnB)]);
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it('完成後釋放 key：後續呼叫會重新執行 fn', async () => {
    const fn = vi.fn(() => Promise.resolve());
    await dedupe('once', fn);
    await dedupe('once', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('fn reject 後仍釋放 key（不會卡住後續 revalidate）', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(dedupe('err', failing)).rejects.toThrow('boom');
    const ok = vi.fn(() => Promise.resolve());
    await dedupe('err', ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
