//
// 真實 posthog-js（假 key）在 jsdom 裡的外送驗證 harness（供 analyticsPrivacy*.test.ts 共用）——這是 W4-37 / W5-38 的核心證據：
// 不看選項字面值，而是攔截 fetch／XHR／sendBeacon，檢查真的送出去的 payload。
// recorder 用 node_modules 內的 lazy-recorder.js 離線載入（取代 eu-assets 的外部腳本）；
// 遠端設定以 window._POSTHOG_REMOTE_CONFIG 預載。
import { readFileSync } from 'node:fs';
import { gunzipSync, inflateSync } from 'node:zlib';
import { vi } from 'vitest';

export const KEY = 'phc_test_fake';
const RECORDER_JS = readFileSync('node_modules/posthog-js/dist/lazy-recorder.js', 'utf8');
// 測試專用：傳輸層改 fetch／不壓縮／不批次，並關掉 bot UA 過濾（jsdom 的 UA 會被擋）。
const TEST_TRANSPORT = {
  api_transport: 'fetch',
  disable_compression: true,
  request_batching: false,
  opt_out_useragent_filter: true,
};
export const URL_KEYS = [
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (cond()) return true;
    await sleep(100);
  }
  return cond();
}

/** SDK 的 compress_events 會把 FullSnapshot／Mutation 欄位 gzip 成 latin1 字串（開頭 0x1f 0x8b）。 */
function gunzipLatin1(str: string): string | null {
  if (str.charCodeAt(0) !== 0x1f || str.charCodeAt(1) !== 0x8b) return null;
  const bytes = Buffer.from(str, 'latin1');
  for (const fn of [gunzipSync, inflateSync]) {
    try {
      return fn(bytes).toString('utf8');
    } catch {
      // 試下一種格式
    }
  }
  return null;
}

/** 遞迴走過整份 JSON，把所有壓縮字串解開後附加成可搜尋的文字。 */
function collectDecoded(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    const text = gunzipLatin1(value);
    if (text !== null) {
      out.push(text);
      try {
        collectDecoded(JSON.parse(text), out);
      } catch {
        // 解壓後不是 JSON 也無妨，文字已收進 out
      }
    }
  } else if (Array.isArray(value)) {
    for (const v of value) collectDecoded(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectDecoded(v, out);
  }
}

/** 一個請求的完整文字（網址＋本文＋解壓後的 snapshot），給「不得出現」斷言用。 */
export function fullText(r: Captured): string {
  const parts = [r.url, r.body];
  try {
    collectDecoded(JSON.parse(r.body), parts);
  } catch {
    // 非 JSON 本文
  }
  return parts.join('\n');
}

export function eventPropsOf(r: Captured): Array<Record<string, unknown>> {
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

export async function boot(url: string, html: string) {
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
