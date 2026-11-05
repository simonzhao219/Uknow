// @vitest-environment jsdom
// 走正式環境的請求壓縮（gzip）：前面的真實 SDK 測試為了好讀都關掉了壓縮，這支補上壓縮路徑。
// 對照組（容器外的 id）必須出現，證明解碼確實讀到了壓縮後的本文。
import { describe, expect, it } from 'vitest';
import { boot, fullText, sleep, waitUntil } from './analyticsPrivacyHarness';

describe('真實 SDK 外送內容', () => {
  it('請求壓縮開啟時，token、屬性與文字同樣不外送', async () => {
    const t = await boot(
      '/register?invite=SECRET-INVITE#frag-secret',
      `<div id="home-probe"></div>
       <a href="/register?invite=SECRET-INVITE">加入</a>
       <p data-user="DATA-SECRET" title="TITLE-SECRET">王小明 TEXT-SECRET</p>`,
      { compress: true },
    );
    expect(await t.analytics.start()).toBe(true);
    t.analytics.trackPageview('/register');
    t.interact();
    expect(await waitUntil(() => t.snapshots().length > 0, 10000)).toBe(true);
    await sleep(2500);

    // 壓縮的請求本文確實存在且被解開（否則下面的「不得出現」會空過）
    expect(t.reqs.some((r) => r.binary)).toBe(true);
    const all = t.reqs.map(fullText).join('\n');
    expect(all).toContain('home-probe');
    for (const s of [
      'SECRET-INVITE',
      'frag-secret',
      'DATA-SECRET',
      'TITLE-SECRET',
      'TEXT-SECRET',
      '王小明',
    ]) {
      expect(all, s).not.toContain(s);
    }
  }, 40000);
});
