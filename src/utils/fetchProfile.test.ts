import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { clearInflight, fetchProfile, fetchProfileForSession } from './fetchProfile';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** 可手動決定何時 resolve 的 fetch。 */
function deferredFetch() {
  const pending: Array<(r: Response) => void> = [];
  const mock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        pending.push(resolve);
      }),
  );
  return { mock, resolveNext: (r: Response) => pending.shift()?.(r) };
}

describe('fetchProfile', () => {
  beforeEach(() => clearInflight());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('200 回 ok 並帶 profile，以 Bearer token 打 /profile', async () => {
    const mock = vi.fn(async () => json(200, { id: 'u1', name: '王' }));
    vi.stubGlobal('fetch', mock);
    await expect(fetchProfile('tok', { userId: 'u1' })).resolves.toEqual({
      kind: 'ok',
      profile: { id: 'u1', name: '王' },
    });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/profile$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it.each([401, 404, 410])('%i 回 unauthorized 並帶狀態碼', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(status)),
    );
    await expect(fetchProfile('tok', { userId: 'u1' })).resolves.toEqual({
      kind: 'unauthorized',
      status,
    });
  });

  it.each([500, 502, 503, 403])('%i 回 transient', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(status)),
    );
    await expect(fetchProfile('tok', { userId: 'u1' })).resolves.toEqual({ kind: 'transient' });
  });

  it('斷網（fetch 擲例外）回 transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(fetchProfile('tok', { userId: 'u1' })).resolves.toEqual({ kind: 'transient' });
  });

  it('200 但內容非 JSON 回 transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200 })),
    );
    await expect(fetchProfile('tok', { userId: 'u1' })).resolves.toEqual({ kind: 'transient' });
  });

  it('同 user id 進行中的請求合併成一次', async () => {
    const d = deferredFetch();
    vi.stubGlobal('fetch', d.mock);
    const a = fetchProfile('tok-a', { userId: 'u1' });
    const b = fetchProfile('tok-b', { userId: 'u1' });
    expect(d.mock).toHaveBeenCalledTimes(1);
    d.resolveNext(json(200, { id: 'u1' }));
    await expect(a).resolves.toEqual({ kind: 'ok', profile: { id: 'u1' } });
    await expect(b).resolves.toEqual({ kind: 'ok', profile: { id: 'u1' } });
  });

  it('不同 user id 不合併', async () => {
    const mock = vi.fn(async () => json(200, {}));
    vi.stubGlobal('fetch', mock);
    await Promise.all([fetchProfile('t', { userId: 'u1' }), fetchProfile('t', { userId: 'u2' })]);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('完成後再次呼叫會重新發請求（只合併進行中的）', async () => {
    const mock = vi.fn(async () => json(200, {}));
    vi.stubGlobal('fetch', mock);
    await fetchProfile('t', { userId: 'u1' });
    await fetchProfile('t', { userId: 'u1' });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('force 不合併到進行中的請求', async () => {
    const d = deferredFetch();
    vi.stubGlobal('fetch', d.mock);
    const a = fetchProfile('t', { userId: 'u1' });
    const b = fetchProfile('t', { userId: 'u1', force: true });
    expect(d.mock).toHaveBeenCalledTimes(2);
    d.resolveNext(json(200, { n: 1 }));
    d.resolveNext(json(200, { n: 2 }));
    await expect(a).resolves.toEqual({ kind: 'ok', profile: { n: 1 } });
    await expect(b).resolves.toEqual({ kind: 'ok', profile: { n: 2 } });
  });

  it('clearInflight 後同 user id 的新請求不合併到舊的', async () => {
    const d = deferredFetch();
    vi.stubGlobal('fetch', d.mock);
    const old = fetchProfile('revoked', { userId: 'u1' });
    clearInflight();
    const fresh = fetchProfile('new', { userId: 'u1' });
    expect(d.mock).toHaveBeenCalledTimes(2);
    d.resolveNext(json(401));
    d.resolveNext(json(200, { id: 'u1' }));
    await expect(old).resolves.toEqual({ kind: 'unauthorized', status: 401 });
    await expect(fresh).resolves.toEqual({ kind: 'ok', profile: { id: 'u1' } });
  });

  it('未傳 timeoutMs 時不逾時', async () => {
    vi.useFakeTimers();
    const d = deferredFetch();
    vi.stubGlobal('fetch', d.mock);
    const p = fetchProfile('t', { userId: 'u1' });
    await vi.advanceTimersByTimeAsync(60_000);
    d.resolveNext(json(200, { late: true }));
    await expect(p).resolves.toEqual({ kind: 'ok', profile: { late: true } });
  });

  it('傳 timeoutMs 時逾時回 transient', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const p = fetchProfile('t', { userId: 'u1', timeoutMs: 8_000 });
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(p).resolves.toEqual({ kind: 'transient' });
  });
});

describe('fetchProfileForSession', () => {
  beforeEach(() => clearInflight());
  afterEach(() => vi.unstubAllGlobals());

  it('以 session 的 user id 為合併鍵，與啟動判定的同一請求合併', async () => {
    const d = deferredFetch();
    vi.stubGlobal('fetch', d.mock);
    const boot = fetchProfile('tok', { userId: 'u1' });
    const page = fetchProfileForSession({ access_token: 'tok2', user: { id: 'u1' } });
    expect(d.mock).toHaveBeenCalledTimes(1);
    d.resolveNext(json(200, { id: 'u1' }));
    await expect(page).resolves.toEqual(await boot);
  });

  it('session 沒有 user id 時以 token 為鍵，不與其他人的請求合併', async () => {
    const mock = vi.fn(async () => json(200, {}));
    vi.stubGlobal('fetch', mock);
    await Promise.all([
      fetchProfile('tok', { userId: 'u1' }),
      fetchProfileForSession({ access_token: 'tok' }),
    ]);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('force 時不合併', async () => {
    const d = deferredFetch();
    vi.stubGlobal('fetch', d.mock);
    void fetchProfile('tok', { userId: 'u1' });
    void fetchProfileForSession({ access_token: 'tok', user: { id: 'u1' } }, { force: true });
    expect(d.mock).toHaveBeenCalledTimes(2);
  });
});
