import { describe, expect, it, vi } from 'vitest';
import { type AnalyticsClient, type AnalyticsDeps, createAnalytics } from './analytics';

function fakeClient() {
  const calls: Array<[string, ...unknown[]]> = [];
  const client: AnalyticsClient = {
    init: (key, options) => calls.push(['init', key, options]),
    capture: (event, props) => calls.push(['capture', event, props]),
    reset: (d) => calls.push(['reset', d]),
    startSessionRecording: (...args: unknown[]) => calls.push(['startRec', ...args]),
    stopSessionRecording: () => calls.push(['stopRec']),
  };
  return { client, calls };
}

function setup(overrides: Partial<AnalyticsDeps> = {}) {
  const { client, calls } = fakeClient();
  const removeItem = vi.fn();
  const loadClient = vi.fn(async () => client);
  const deps: AnalyticsDeps = {
    key: 'phc_real_key',
    loadClient,
    storage: { removeItem },
    currentPathname: () => '/',
    origin: () => 'https://uknow.com.tw',
    ...overrides,
  };
  return { analytics: createAnalytics(deps), calls, loadClient, removeItem };
}

describe('createAnalytics 停用態', () => {
  it('沒有 key 時 start 回 false 且不載入 SDK', async () => {
    const { analytics, loadClient } = setup({ key: undefined });
    expect(await analytics.start()).toBe(false);
    expect(loadClient).not.toHaveBeenCalled();
  });

  it('佔位 key 同樣不載入 SDK', async () => {
    const { analytics, loadClient } = setup({ key: 'phc_PLACEHOLDER_NOT_CONFIGURED' });
    expect(await analytics.start()).toBe(false);
    expect(loadClient).not.toHaveBeenCalled();
  });

  it('停用時 reset 與 pageview 都是 no-op，不載入也不碰 storage', async () => {
    const { analytics, loadClient, removeItem, calls } = setup({ key: undefined });
    analytics.reset();
    analytics.trackPageview('/rewards');
    await analytics.start();
    expect(loadClient).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe('createAnalytics 啟動', () => {
  it('啟用時載入 client，並以 key 與預設錄影關閉的選項 init', async () => {
    const { analytics, calls } = setup();
    expect(await analytics.start()).toBe(true);
    const init = calls.find((c) => c[0] === 'init') as [string, string, Record<string, unknown>];
    expect(init[1]).toBe('phc_real_key');
    expect(init[2].disable_session_recording).toBe(true);
    expect(typeof init[2].before_send).toBe('function');
  });

  it('重複 start 只載入一次', async () => {
    const { analytics, loadClient } = setup();
    await Promise.all([analytics.start(), analytics.start()]);
    await analytics.start();
    expect(loadClient).toHaveBeenCalledTimes(1);
  });

  it('SDK 載入失敗時 start 回 false 且不拋錯', async () => {
    const { analytics } = setup({
      loadClient: async () => {
        throw new Error('chunk load failed');
      },
    });
    await expect(analytics.start()).resolves.toBe(false);
  });

  it('sampleRate 參數傳進錄影選項', async () => {
    const { analytics, calls } = setup({ sampleRate: 0.2 });
    await analytics.start();
    const init = calls.find((c) => c[0] === 'init') as [string, string, Record<string, unknown>];
    expect((init[2].session_recording as Record<string, unknown>).sampleRate).toBe(0.2);
  });
});

describe('createAnalytics 錄影閘門', () => {
  it('一般頁面啟動後開始錄影（不帶參數，避免繞過抽樣）', async () => {
    const { analytics, calls } = setup({ currentPathname: () => '/' });
    await analytics.start();
    const starts = calls.filter((c) => c[0] === 'startRec');
    expect(starts).toEqual([['startRec']]);
  });

  it('直接落地付款頁或後台時不啟動錄影', async () => {
    for (const path of ['/payment/result', '/admin', '/admin/verify']) {
      const { analytics, calls } = setup({ currentPathname: () => path });
      await analytics.start();
      expect(
        calls.filter((c) => c[0] === 'startRec'),
        path,
      ).toEqual([]);
    }
  });

  it('路由進入禁錄頁時停止、離開時重新開始，重複同類不重複呼叫', async () => {
    const { analytics, calls } = setup({ currentPathname: () => '/' });
    await analytics.start();
    calls.length = 0;
    analytics.trackPageview('/payment/checkout');
    analytics.trackPageview('/payment/result');
    analytics.trackPageview('/rewards');
    analytics.trackPageview('/admin');
    const rec = calls.filter((c) => c[0] === 'startRec' || c[0] === 'stopRec').map((c) => c[0]);
    expect(rec).toEqual(['stopRec', 'startRec', 'stopRec']);
  });
});

describe('createAnalytics pageview', () => {
  it('載入前的 pageview 只緩存最後一筆，載入完成後補送一次且不含 query', async () => {
    const { analytics, calls } = setup({ currentPathname: () => '/' });
    analytics.trackPageview('/a');
    analytics.trackPageview('/service-providers/7');
    await analytics.start();
    const views = calls.filter((c) => c[0] === 'capture');
    expect(views).toEqual([
      ['capture', '$pageview', { $current_url: 'https://uknow.com.tw/service-providers/7' }],
    ]);
  });

  it('啟動後的 pageview 立即送出', async () => {
    const { analytics, calls } = setup();
    await analytics.start();
    calls.length = 0;
    analytics.trackPageview('/rewards');
    expect(calls).toContainEqual([
      'capture',
      '$pageview',
      { $current_url: 'https://uknow.com.tw/rewards' },
    ]);
  });
});

describe('createAnalytics reset', () => {
  it('SDK 已載入時 reset(true)，連 device id 一起重置', async () => {
    const { analytics, calls } = setup();
    await analytics.start();
    calls.length = 0;
    analytics.reset();
    expect(calls).toEqual([['reset', true]]);
  });

  it('SDK 尚未載入時移除 PostHog 的 localStorage 鍵，載入後立即 reset(true)', async () => {
    const { analytics, calls, removeItem, loadClient } = setup();
    analytics.reset();
    expect(removeItem).toHaveBeenCalledWith('ph_phc_real_key_posthog');
    expect(loadClient).not.toHaveBeenCalled();
    await analytics.start();
    const order = calls.map((c) => c[0]);
    expect(order.indexOf('reset')).toBeGreaterThan(order.indexOf('init'));
    expect(calls).toContainEqual(['reset', true]);
  });

  it('載入進行中收到 reset 也會在 init 後補做', async () => {
    let release: (c: AnalyticsClient) => void = () => {};
    const { client, calls } = fakeClient();
    const { analytics } = setup({
      loadClient: () =>
        new Promise<AnalyticsClient>((resolve) => {
          release = resolve;
        }),
    });
    const started = analytics.start();
    analytics.reset();
    release(client);
    await started;
    expect(calls).toContainEqual(['reset', true]);
  });
});
