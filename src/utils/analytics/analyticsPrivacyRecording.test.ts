// @vitest-environment jsdom
// 真實 SDK 外送驗證（一個案例一個檔：posthog-js 是外部套件，vi.resetModules 重置不了它，
// 同檔多案例會互相污染）。共用邏輯見 analyticsPrivacyHarness.ts。
import { describe, expect, it } from 'vitest';
import { boot, fullText, sleep, waitUntil } from './analyticsPrivacyHarness';

describe('真實 SDK 外送內容', () => {
  it('註冊頁錄影：邀請 token、屬性與文字都不出現在任何外送請求', async () => {
    const SECRETS = [
      'SECRET-INVITE',
      'frag-secret',
      'IMG-SECRET',
      'ALT-SECRET',
      'INPUT-SECRET',
      'PH-SECRET',
      'DATA-SECRET',
      'TITLE-SECRET',
      'TEXT-SECRET',
      '王小明',
      'MUT-SECRET',
    ];
    const t = await boot(
      '/register?invite=SECRET-INVITE#frag-secret',
      `<div id="home-probe"></div>
       <a href="/register?invite=SECRET-INVITE">加入</a>
       <img src="/p.png?sig=IMG-SECRET" alt="ALT-SECRET">
       <input id="x" value="INPUT-SECRET" placeholder="PH-SECRET">
       <p data-user="DATA-SECRET" title="TITLE-SECRET">王小明 TEXT-SECRET</p>`,
    );
    expect(await t.analytics.start()).toBe(true);
    t.analytics.trackPageview('/register');
    t.interact();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<a href="/x?token=MUT-SECRET">m</a><div id="mut-probe"></div>',
    );
    expect(await waitUntil(() => t.snapshots().length > 0, 10000), '應收到 snapshot').toBe(true);
    await sleep(3000);

    // 必須真的載入了 recorder，否則下面的「不出現」會空過
    expect(t.requested).toContain('lazy-recorder');
    const all = t.reqs.map(fullText).join('\n');
    expect(all).toContain('home-probe'); // 對照組：白名單屬性（id）有被錄到
    expect(all).toContain('mut-probe');
    for (const s of SECRETS) expect(all, s).not.toContain(s);
    // Meta 事件仍在，且 href 已去掉 query 與 hash
    expect(all).toContain(`"href":"${location.origin}/register"`);
  }, 40000);
});
