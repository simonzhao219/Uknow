// @vitest-environment jsdom
// 真實 SDK 外送驗證（一個案例一個檔：posthog-js 是外部套件，vi.resetModules 重置不了它，
// 同檔多案例會互相污染）。共用邏輯見 analyticsPrivacyHarness.ts。
import { describe, expect, it } from 'vitest';
import { boot, eventPropsOf, sleep, URL_KEYS, waitUntil } from './analyticsPrivacyHarness';

describe('真實 SDK 外送內容', () => {
  it('所有事件的網址欄位都沒有 query／hash，且附 $geoip_disable', async () => {
    const t = await boot('/register?invite=SECRET-INVITE#frag-secret', '<div id="p"></div>');
    await t.analytics.start();
    t.analytics.trackPageview('/register');
    t.interact();
    expect(await waitUntil(() => t.snapshots().length > 0, 10000)).toBe(true);
    await sleep(1500);

    const props = t.reqs
      .filter((r) => r.url.includes('/e/') || r.url.includes('/s/'))
      .flatMap(eventPropsOf);
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) {
      expect(p.$geoip_disable).toBe(true);
      for (const k of URL_KEYS) {
        const v = p[k];
        if (typeof v === 'string') expect(v, k).not.toMatch(/[?#]/);
      }
    }
    const pv = props.find((p) => p.$current_url);
    expect(pv?.$current_url).toBe(`${location.origin}/register`);
  }, 40000);
});
