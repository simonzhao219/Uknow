// PostHog 初始化選項與事件清理——純函式，與 SDK 同屬動態 chunk（不得被 entry 靜態引用）。
//
// 設計依據：docs/plans/posthog-monitoring/plan.md §2（W4-35～37、W5-35～39）。
// 選項名稱已對 posthog-js@1.445.5 的型別定義核實。

import { PH_BLOCK_CLASS } from './privacy';

export { PH_BLOCK_CLASS };

/** catch-all：欄位只要寫對 type／autocomplete 就自動被整塊擋掉。 */
export const BLOCK_SELECTOR = [
  `.${PH_BLOCK_CLASS}`,
  'input[type="tel"]',
  'input[type="password"]',
  'input[autocomplete^="bday"]',
  'input[autocomplete="tel"]',
  'input[autocomplete^="tel-"]',
  'input[autocomplete^="cc-"]',
  '[data-sensitive]',
].join(', ');

export interface PosthogEvent {
  event?: string;
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PosthogInitOptions {
  [key: string]: unknown;
}

/** 去掉 query 與 hash（絕對與相對 URL 皆可）。 */
export function stripUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

// DOM 屬性白名單（W5-38）：只留不帶內容的結構／樣式屬性，其餘一律遮掉。
// compress_events 預設 true，FullSnapshot 進 before_send 前已被 gzip，所以 DOM 屬性
// 只剩這一層能擋（href/src/data-*/title/aria-label/alt/placeholder/value… 皆在白名單外）。
const KEPT_ATTRIBUTES = new Set([
  'class',
  'style',
  'type',
  'role',
  'id',
  'for',
  'width',
  'height',
  'viewbox',
  'd',
  'fill',
  'stroke',
  'stroke-width',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'transform',
  'xmlns',
  'colspan',
  'rowspan',
  'dir',
  'lang',
  'disabled',
  'hidden',
  'aria-hidden',
  'aria-expanded',
  'aria-disabled',
  'aria-pressed',
  // rrweb 重播用的內嵌樣式與尺寸／捲動位置（不含內容）；rr_dataURL／rr_src 仍遮罩。
  '_csstext',
  'rr_width',
  'rr_height',
  'rr_scrollleft',
  'rr_scrolltop',
  'rr_mediastate',
]);

export function maskAttribute(name: string, value: string): string {
  return KEPT_ATTRIBUTES.has(name.toLowerCase()) ? value : '***';
}

const URL_KEYS = new Set([
  '$current_url',
  '$pathname',
  '$referrer',
  '$referring_domain',
  '$session_entry_url',
  '$session_entry_pathname',
  '$session_entry_referrer',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_referrer',
  '$initial_referring_domain',
]);

const TRACKING_KEYS = new Set([
  'gad_source',
  'gclsrc',
  'mc_cid',
  'mc_eid',
  'gclid',
  'fbclid',
  'msclkid',
  'dclid',
  'ttclid',
  'twclid',
  'wbraid',
  'gbraid',
]);

function cleanBag(bag: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bag)) {
    // person／session property 的 $initial_utm_*、$session_entry_gclid 等同樣是追蹤參數。
    const base = k.replace(/^\$(?:initial|session_entry)_/, '');
    if (TRACKING_KEYS.has(base) || base.startsWith('utm_')) continue;
    if (URL_KEYS.has(k) && typeof v === 'string') out[k] = stripUrl(v);
    else out[k] = v;
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * before_send：清 properties 內的 URL 欄位、追蹤參數與未壓縮的 rrweb Meta href。
 * 壓縮後的 snapshot 字串看不到內容，不處理（DOM 屬性由 maskAttribute 擋）。
 */
export function sanitizeEvent(event: PosthogEvent | null): PosthogEvent | null {
  if (!event) return event;
  const props = cleanBag(event.properties ?? {});
  for (const nested of ['$set', '$set_once'] as const) {
    const v = props[nested];
    if (isRecord(v)) props[nested] = cleanBag(v);
  }
  const snap = props.$snapshot_data;
  if (Array.isArray(snap)) {
    props.$snapshot_data = snap.map((e) => {
      if (isRecord(e) && e.type === 4 && isRecord(e.data) && typeof e.data.href === 'string') {
        return { ...e, data: { ...e.data, href: stripUrl(e.data.href) } };
      }
      return e;
    });
  }
  // 輔助旗標：真正不收 IP／geo 的保證是 PostHog 專案設定「Discard client IP data」。
  props.$geoip_disable = true;
  const out: PosthogEvent = { ...event, properties: props };
  if (isRecord(event.$set)) out.$set = cleanBag(event.$set);
  if (isRecord(event.$set_once)) out.$set_once = cleanBag(event.$set_once);
  return out;
}

export function buildPosthogOptions(opts: { sampleRate?: number } = {}): PosthogInitOptions {
  return {
    api_host: 'https://eu.i.posthog.com',
    ui_host: 'https://eu.posthog.com',
    person_profiles: 'identified_only',
    persistence: 'localStorage',
    // 以下一律明確 false：posthog-js 對 undefined 會採 PostHog 專案端的遠端設定。
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    enable_recording_console_log: false,
    capture_performance: false,
    disable_surveys: true,
    disable_conversations: true,
    disable_product_tours: true,
    // 不自動收 campaign 參數（utm_*、gclid…）；sanitizeEvent 仍會清掉殘留的追蹤鍵。
    save_campaign_params: false,
    // 錄影元件只載入釘版本的路徑（/static/<版本>/lazy-recorder.js），不退回未釘版的最新檔：
    // 遮罩、console、network 的判斷邏輯都在 lazy-recorder 裡，寧可不錄也不要載到沒釘版的。
    strict_script_versioning: true,
    advanced_disable_feature_flags: true,
    disable_capture_url_hashes: true,
    mask_personal_data_properties: true,
    // 起點由 recordingAllowed(location.pathname) 決定，載入後才 startSessionRecording()。
    disable_session_recording: true,
    before_send: sanitizeEvent,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      blockClass: PH_BLOCK_CLASS,
      blockSelector: BLOCK_SELECTOR,
      maskAttributeFn: maskAttribute,
      recordHeaders: false,
      recordBody: false,
      captureCanvas: { recordCanvas: false },
      // SDK 內它同時是 replay URL 遮罩鉤子（Meta、$pageview、$url_changed）：
      // 回 null 會丟掉 Meta 事件弄壞 replay，所以改為剝 query／hash。
      maskCapturedNetworkRequestFn: (r: { name: string }) => ({ ...r, name: stripUrl(r.name) }),
      sampleRate: opts.sampleRate ?? 1,
    },
  };
}
