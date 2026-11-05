// @vitest-environment jsdom
// 真實 SDK 外送驗證（一個案例一個檔：posthog-js 是外部套件，vi.resetModules 重置不了它，
// 同檔多案例會互相污染）。共用邏輯見 analyticsPrivacyHarness.ts。
import { describe, expect, it } from 'vitest';
import { boot, fullText, sleep } from './analyticsPrivacyHarness';

describe('真實 SDK 外送內容', () => {
  it('直接落地付款結果頁：不錄影、不送 snapshot，token 不外洩', async () => {
    const t = await boot(
      '/payment/result?TradeNo=PAY-SECRET',
      '<div id="pay-probe">CARD-SECRET</div>',
    );
    expect(await t.analytics.start()).toBe(true);
    t.analytics.trackPageview('/payment/result');
    t.interact();
    await sleep(4000);
    expect(t.snapshots()).toEqual([]);
    const all = t.reqs.map(fullText).join('\n');
    for (const s of ['PAY-SECRET', 'CARD-SECRET', 'pay-probe']) expect(all, s).not.toContain(s);
  }, 40000);
});
