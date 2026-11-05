// @vitest-environment jsdom
// 真實 SDK 驗證 block class：帶 ph-no-capture 的容器（含 display:contents 的 PrivateRegion 形態）
// 底下的子樹不會出現在錄影資料裡；對照組（容器外的 id）必須出現，否則斷言會空過。
import { describe, expect, it } from 'vitest';
import { boot, fullText, sleep, waitUntil } from './analyticsPrivacyHarness';

describe('真實 SDK 外送內容', () => {
  it('帶 ph-no-capture 的欄位群組與 contents 容器，子樹不外送', async () => {
    const t = await boot(
      '/',
      `<div id="outside-probe"></div>
       <div class="space-y-2 ph-no-capture"><label>身分證</label><input id="inside-field-probe" value="A123456789"></div>
       <div class="contents ph-no-capture"><section id="inside-region-probe"><p>CARD-SECRET</p></section></div>`,
    );
    expect(await t.analytics.start()).toBe(true);
    t.analytics.trackPageview('/');
    t.interact();
    expect(await waitUntil(() => t.snapshots().length > 0, 10000)).toBe(true);
    await sleep(2500);

    const all = t.reqs.map(fullText).join('\n');
    expect(all).toContain('outside-probe'); // 對照組：容器外的非內容屬性有被錄到
    for (const s of ['inside-field-probe', 'inside-region-probe', 'CARD-SECRET', 'A123456789']) {
      expect(all, s).not.toContain(s);
    }
  }, 40000);
});
