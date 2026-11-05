// @vitest-environment jsdom
//
// 真實 posthog-js（假 key）在 jsdom 裡的外送驗證——這是 W4-37 / W5-38 的核心證據：
// 不看選項字面值，而是攔截 fetch／XHR／sendBeacon，檢查真的送出去的 payload。
// recorder 用 node_modules 內的 lazy-recorder.js 離線載入（取代 eu-assets 的外部腳本）；
// 遠端設定以 window._POSTHOG_REMOTE_CONFIG 預載。
import { readFileSync } from 'node:fs';
import { gunzipSync, inflateSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'phc_test_fake';
const RECORDER_JS = readFileSync('node_modules/posthog-js/dist/lazy-recorder.js', 'utf8');
// 測試專用：傳輸層改 fetch／不壓縮／不批次，並關掉 bot UA 過濾（jsdom 的 UA 會被擋）。
const TEST_TRANSPORT = {
  api_transport: 'fetch',
  disable_compression: true,
  request_batching: false,
  opt_out_useragent_filter: true,
};
const URL_KEYS = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$session_entry_url',
  '$session_entry_pathname',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_referrer',
];

interface Captured {
  url: string;
  body: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (cond()) return true;
    await sleep(100);
  }
  return cond();
}

function decodeSnapshot(sd: unknown): string {
  if (typeof sd !== 'string') return JSON.stringify(sd);
  const bytes = Buffer.from(sd, 'base64');
  for (const fn of [gunzipSync, inflateSync]) {
    try {
      return fn(bytes).toString('utf8');
    } catch {
      // 試下一種格式
    }
  }
  return sd;
}

/** 一個請求的完整文字（網址＋本文＋解壓後的 snapshot），給「不得出現」斷言用。 */
function fullText(r: Captured): string {
  let text = `${r.url}\n${r.body}`;
  try {
    const j = JSON.parse(r.body);
    if (j?.properties?.$snapshot_data !== undefined) {
      text += `\n${decodeSnapshot(j.properties.$snapshot_data)}`;
    }
  } catch {
    // 非 JSON 本文
  }
  return text;
}

function eventPropsOf(r: Captured): Array<Record<string, unknown>> {
  try {
    const j = JSON.parse(r.body);
    if (Array.isArray(j.batch))
      return j.batch.map((e: { properties: Record<string, unknown> }) => e.properties);
    if (j.properties) return [j.properties];
  } catch {
    // 非 JSON
  }
  return [];
}

async function boot(url: string, html: string) {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  const w = window as unknown as Record<string, unknown>;
  w.__PosthogExtensions__ = undefined;
  history.replaceState({}, '', url);
  document.body.innerHTML = html;

  const reqs: Captured[] = [];
  const record = (u: unknown, b: unknown) =>
    reqs.push({ url: String(u), body: typeof b === 'string' ? b : '[non-string]' });
  const stubFetch = async (u: unknown, init?: { body?: unknown }) => {
    record(u, init?.body);
    return new Response('{}', { status: 200 });
  };
  vi.stubGlobal('fetch', stubFetch);
  w.fetch = stubFetch;
  XMLHttpRequest.prototype.open = function (this: { __u?: string }, _m: string, u: string) {
    this.__u = u;
  } as unknown as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (this: { __u?: string }, b: unknown) {
    record(`XHR ${this.__u}`, b);
  } as unknown as typeof XMLHttpRequest.prototype.send;
  navigator.sendBeacon = (u: string | URL, b?: BodyInit | null) => {
    record(`BEACON ${u}`, b);
    return true;
  };
  w._POSTHOG_REMOTE_CONFIG = {
    [KEY]: {
      config: {
        token: KEY,
        supportedCompression: ['gzip'],
        hasFeatureFlags: true,
        sessionRecording: { endpoint: '/s/', recorderVersion: 'v2' },
        captureDeadClicks: false,
        autocapture_opt_out: true,
      },
      siteApps: [],
    },
  };

  const requested: string[] = [];
  const { createAnalytics } = await import('./analytics');
  const { createPosthogClient } = await import('./posthogClient');
  const analytics = createAnalytics({
    key: KEY,
    storage: localStorage,
    currentPathname: () => location.pathname,
    origin: () => location.origin,
    loadClient: async () => {
      const client = await createPosthogClient(TEST_TRANSPORT);
      // posthog-js 載入後才有 __PosthogExtensions__；把外部腳本載入改成讀本機檔。
      const ext = w.__PosthogExtensions__ as {
        loadExternalDependency: (ph: unknown, name: string, cb: (e?: unknown) => void) => void;
      };
      const original = ext.loadExternalDependency;
      ext.loadExternalDependency = (ph, name, cb) => {
        requested.push(name);
        if (name === 'lazy-recorder') {
          new Function(RECORDER_JS)();
          return cb();
        }
        return original(ph, name, cb);
      };
      return client;
    },
  });
  const interact = () => {
    for (const t of ['mousedown', 'mouseup', 'click', 'touchstart']) {
      document.body.dispatchEvent(new Event(t, { bubbles: true }));
    }
  };
  const snapshots = () => reqs.filter((r) => r.url.includes('/s/'));
  return { analytics, reqs, requested, interact, snapshots };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

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
