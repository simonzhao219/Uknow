// @vitest-environment jsdom
// 真實 SDK 外送驗證（一個案例一個檔：posthog-js 是外部套件，vi.resetModules 重置不了它，
// 同檔多案例會互相污染）。共用邏輯見 analyticsPrivacyHarness.ts。
import { describe, expect, it } from 'vitest';
import { boot, fullText, sleep, waitUntil } from './analyticsPrivacyHarness';

describe('真實 SDK 外送內容', () => {
  it('從首頁以 SPA 導入後台：同一 tick 內停止錄影，後台 DOM 不外送', async () => {
    const t = await boot('/', '<div id="home-probe"></div>');
    await t.analytics.start();
    t.analytics.trackPageview('/');
    t.interact();
    expect(await waitUntil(() => t.snapshots().length > 0, 10000)).toBe(true);

    // 模擬 React 先掛載後台 DOM、同一 tick 的 layout effect 再通知路由變更
    document.body.insertAdjacentHTML('beforeend', '<div id="admin-leak-probe"></div>');
    t.analytics.trackPageview('/admin');
    document.body.insertAdjacentHTML('beforeend', '<div id="admin-leak-probe-2"></div>');
    t.interact();
    await sleep(5000);

    const all = t.reqs.map(fullText).join('\n');
    expect(all).toContain('home-probe'); // 對照組：進入後台前確實有錄
    expect(all).not.toContain('admin-leak-probe');
  }, 40000);
});
