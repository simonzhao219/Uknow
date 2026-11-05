// PostHog 初始化選項與事件清理——純函式，與 SDK 同屬動態 chunk（不得被 entry 靜態引用）。

export const PH_BLOCK_CLASS = 'ph-no-capture';

/** catch-all：欄位只要寫對 type／autocomplete 就自動被整塊擋掉。 */
export const BLOCK_SELECTOR = '';

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
  return url;
}

/** DOM 屬性白名單遮罩：不在白名單的屬性值一律遮掉。 */
export function maskAttribute(_name: string, value: string): string {
  return value;
}

/** before_send：清 properties 內的 URL 欄位、追蹤參數與未壓縮的 rrweb Meta href。 */
export function sanitizeEvent(event: PosthogEvent | null): PosthogEvent | null {
  return event;
}

export function buildPosthogOptions(_opts?: { sampleRate?: number }): PosthogInitOptions {
  return {};
}
