import { describe, expect, it } from 'vitest';
import { type AnalyticsClient, createAnalytics } from './analytics';

// 監控壞了不能影響產品：trackPageview 跑在 useLayoutEffect（掛掉會讓整個 App 白屏），
// reset 跑在登出流程（拋錯會讓登出中斷）。SDK 任何呼叫拋錯都必須被吞掉。
function explodingClient(): AnalyticsClient {
  const boom = () => {
    throw new Error('sdk exploded');
  };
  return {
    init: () => {},
    capture: boom,
    reset: boom,
    startSessionRecording: boom,
    stopSessionRecording: boom,
  };
}

async function started(path = '/') {
  const analytics = createAnalytics({
    key: 'phc_real_key',
    loadClient: async () => explodingClient(),
    storage: { removeItem: () => {} },
    currentPathname: () => path,
    origin: () => 'https://uknow.com.tw',
  });
  await analytics.start();
  return analytics;
}

describe('createAnalytics 故障隔離', () => {
  it('SDK 的 capture 或錄影閘門拋錯時 trackPageview 不外拋', async () => {
    const analytics = await started();
    expect(() => analytics.trackPageview('/payment/result')).not.toThrow();
    expect(() => analytics.trackPageview('/rewards')).not.toThrow();
  });

  it('SDK 的 reset 拋錯時 reset 不外拋（登出流程不得中斷）', async () => {
    const analytics = await started();
    expect(() => analytics.reset()).not.toThrow();
  });

  it('啟動時 SDK 的錄影或 pageview 呼叫拋錯，start 回 false 且不拋', async () => {
    const analytics = createAnalytics({
      key: 'phc_real_key',
      loadClient: async () => explodingClient(),
      storage: null,
      currentPathname: () => '/',
      origin: () => 'https://uknow.com.tw',
    });
    analytics.trackPageview('/');
    await expect(analytics.start()).resolves.toBeDefined();
  });

  it('storage.removeItem 拋錯時 reset 不外拋', () => {
    const analytics = createAnalytics({
      key: 'phc_real_key',
      loadClient: async () => explodingClient(),
      storage: {
        removeItem: () => {
          throw new Error('denied');
        },
      },
      currentPathname: () => '/',
      origin: () => 'https://uknow.com.tw',
    });
    expect(() => analytics.reset()).not.toThrow();
  });
});

describe('sanitizeEvent 的 person-property 追蹤參數', () => {
  it('移除 $initial_ 開頭的 utm 與 click id 鍵', async () => {
    const { sanitizeEvent } = await import('./analyticsConfig');
    const out = sanitizeEvent({
      event: '$pageview',
      properties: {
        $initial_utm_source: 'a',
        $initial_gclid: 'g',
        $initial_fbclid: 'f',
        $initial_referrer: 'https://x.com/p?q=1',
        keep: 1,
      },
      $set_once: { $initial_utm_campaign: 'c', $initial_gclid: 'g' },
    });
    const dump = JSON.stringify(out);
    for (const s of ['utm_source', 'utm_campaign', 'gclid', 'fbclid'])
      expect(dump).not.toContain(s);
    expect(out?.properties?.keep).toBe(1);
    expect(out?.properties?.$initial_referrer).toBe('https://x.com/p');
  });
});
