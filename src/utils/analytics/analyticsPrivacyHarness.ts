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
// 正式環境預設用 XHR 傳輸（含請求壓縮）；這組不覆寫 api_transport、不關壓縮。
const COMPRESSED_TRANSPORT = {
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

export interface Captured {
  url: string;
  body: string;
  /** 原始本文不是字串（位元組或 Blob，例如 gzip 壓縮後的請求） */
  binary?: boolean;
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
  if (r.body.startsWith('[unreadable') || r.body === '[pending-blob]') {
    throw new Error(`無法讀取請求本文，不能證明沒有外洩：${r.url} ${r.body}`);
  }
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

/** 把請求本文轉成可搜尋的文字：字串、位元組（含 gzip）直接處理；Blob 非同步讀完後回填。 */
function bytesToText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  for (const fn of [gunzipSync, inflateSync]) {
    try {
      return fn(buf).toString('utf8');
    } catch {
      // 不是該壓縮格式，試下一種
    }
  }
  return buf.toString('utf8');
}

function recordBody(entry: Captured, b: unknown): void {
  if (typeof b === 'string') {
    entry.body = b;
  } else if (b === null || b === undefined) {
    entry.body = '';
  } else if (b instanceof ArrayBuffer) {
    entry.binary = true;
    entry.body = bytesToText(new Uint8Array(b));
  } else if (ArrayBuffer.isView(b)) {
    entry.binary = true;
    entry.body = bytesToText(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
  } else if (typeof Blob !== 'undefined' && b instanceof Blob) {
    entry.binary = true;
    entry.body = '[pending-blob]';
    const reader = new FileReader();
    reader.onload = () => {
      entry.body = bytesToText(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      entry.body = '[unreadable: blob]';
    };
    reader.readAsArrayBuffer(b);
  } else {
    // 讀不到內容就不能證明「沒有外洩」：標記起來，fullText 會讓測試直接失敗，不靜默假綠。
    entry.body = `[unreadable: ${Object.prototype.toString.call(b)}]`;
  }
}

export async function boot(url: string, html: string, opts: { compress?: boolean } = {}) {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  const w = window as unknown as Record<string, unknown>;
  w.__PosthogExtensions__ = undefined;
  history.replaceState({}, '', url);
  document.body.innerHTML = html;

  const reqs: Captured[] = [];
  const record = (u: unknown, b: unknown) => {
    const entry: Captured = { url: String(u), body: '' };
    recordBody(entry, b);
    reqs.push(entry);
  };
  const stubFetch = async (u: unknown, init?: { body?: unknown }) => {
    record(u, init?.body);
    return new Response('{}', { status: 200 });
  };
  vi.stubGlobal('fetch', stubFetch);
  w.fetch = stubFetch;
  XMLHttpRequest.prototype.open = function (this: { __u?: string }, _m: string, u: string) {
    this.__u = u;
  } as unknown as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.setRequestHeader =
    (() => {}) as typeof XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.send = function (this: { __u?: string }, b: unknown) {
    record(`XHR ${this.__u}`, b);
  } as unknown as typeof XMLHttpRequest.prototype.send;
  navigator.sendBeacon = (u: string | URL, b?: BodyInit | null) => {
    record(`BEACON ${u}`, b);
    return true;
  };
  // 最壞情況的專案端遠端設定：業主若在 PostHog 後台把這些全開，前端明確寫死的選項與
  // 擴充切分仍必須讓它們不生效（console／logs、conversations、network payload、canvas、
  // 熱圖、dead click、exception 自動捕捉、關閉遮罩）。
  w._POSTHOG_REMOTE_CONFIG = {
    [KEY]: {
      config: {
        token: KEY,
        supportedCompression: ['gzip', 'gzip-js'],
        hasFeatureFlags: true,
        sessionRecording: {
          endpoint: '/s/',
          recorderVersion: 'v2',
          consoleLogRecordingEnabled: true,
          networkPayloadCapture: {
            recordHeaders: true,
            recordBody: true,
            capturePerformance: true,
          },
          canvasRecording: { enabled: true, fps: '4', quality: '0.4' },
          masking: { maskAllInputs: false, maskTextSelector: '.never-matches' },
        },
        capturePerformance: true,
        logs: { captureConsoleLogs: true },
        conversations: { enabled: true, token: 'conv_token', widgetEnabled: true },
        heatmaps: true,
        captureDeadClicks: true,
        autocaptureExceptions: true,
        errorTracking: { autocaptureExceptions: true },
        productTours: true,
        surveys: true,
        autocapture_opt_out: false,
      },
      siteApps: [],
    },
  };

  const requested: string[] = [];
  let instance: unknown;
  const { createAnalytics } = await import('./analytics');
  const { createPosthogClient } = await import('./posthogClient');
  const analytics = createAnalytics({
    key: KEY,
    storage: localStorage,
    currentPathname: () => location.pathname,
    origin: () => location.origin,
    loadClient: async () => {
      // compress=true 走正式環境的請求壓縮（gzip），驗證壓縮路徑的內容同樣乾淨。
      const transport = {
        ...(opts.compress ? COMPRESSED_TRANSPORT : TEST_TRANSPORT),
        // client 實際使用的 SDK 實例（init 完成後由 SDK 回呼），供測試檢查擴充是否存在。
        loaded: (ph: unknown) => {
          instance = ph;
        },
      };
      const client = await createPosthogClient(transport);
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
  return { analytics, reqs, requested, interact, snapshots, getInstance: () => instance };
}
