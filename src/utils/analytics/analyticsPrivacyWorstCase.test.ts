// @vitest-environment jsdom
// 最壞情況：PostHog 專案端把 logs／conversations／console／network／canvas／熱圖／
// dead click／exception 全開、遮罩全關（見 harness 的遠端設定）。前端必須不受影響：
// console 內容不外送、不載入 logs／conversations 擴充、沒有對應端點的請求。
import { describe, expect, it } from 'vitest';
import { boot, fullText, sleep, waitUntil } from './analyticsPrivacyHarness';

describe('真實 SDK 外送內容', () => {
  it('遠端設定全開時 console 內容不外送，也不載入 logs 與 conversations', async () => {
    const t = await boot('/register?invite=TOKEN-IN-URL', '<div id="outside-probe"></div>');
    expect(await t.analytics.start()).toBe(true);
    t.analytics.trackPageview('/register');
    t.interact();
    // 遠端設定載入後（recorder 啟動前後）各印一次，涵蓋「啟動前緩衝」與「啟動後攔截」
    console.log('CONSOLE-SECRET-EMAIL a@b.com', { profile: 'CONSOLE-SECRET-PROFILE' });
    expect(await waitUntil(() => t.snapshots().length > 0, 10000)).toBe(true);
    console.warn('CONSOLE-SECRET-LATE');
    console.error(new Error('CONSOLE-SECRET-ERROR'));
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'EXC-SECRET', error: new Error('EXC-SECRET') }),
    );
    await sleep(4000);

    const all = t.reqs.map(fullText).join('\n');
    expect(all).toContain('outside-probe'); // 對照組：錄影本身有在運作
    for (const s of ['CONSOLE-SECRET', 'EXC-SECRET', 'TOKEN-IN-URL']) {
      expect(all, s).not.toContain(s);
    }
    expect(t.requested).not.toContain('logs');
    expect(t.requested).not.toContain('conversations');
    expect(
      t.reqs.filter((r) => /\/(logs|i\/v1\/logs|conversations)/.test(r.url)),
      '不得有 logs／conversations 端點的請求',
    ).toEqual([]);
  }, 40000);
});
