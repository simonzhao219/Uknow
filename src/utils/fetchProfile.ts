// /profile 的唯一 fetch（T1 auth-state-trust，plan §2.4；T1-B auth-transient-resilience §2.2）。
//
// 模組單例：in-flight map 在模組內，bootstrap、AuthPage、OTP／邀請入口 import
// 同一個函式，同一個 user id 進行中的請求自然合併成一次。合併鍵是 user id
// 而非 token（同一人 token 換發不該多打一次）。登出或換 session 時呼叫
// clearInflight()，之後的請求不會合併到以已撤銷 token 在飛的舊請求。

import { buildApiUrl } from './apiUrl';

export type ProfileFetchResult =
  | { kind: 'ok'; profile: any }
  | { kind: 'unauthorized'; status: number }
  | { kind: 'transient' }
  /** 404：session 有效但 profiles 零列（帳號資料異常，W4-11）——不是無效 session。 */
  | { kind: 'missing' };

/** 冷啟動 /profile 的逾時（D6；上線後依量測調整）。逾時歸 transient。 */
export const PROFILE_FETCH_TIMEOUT_MS = 8_000;
/** 自動／手動重試的逾時：第二次不再等滿 8 秒，冷啟動最壞約 14 秒進 degraded。 */
export const PROFILE_RETRY_TIMEOUT_MS = 5_000;

export interface FetchProfileOptions {
  userId: string;
  /** 不合併到進行中的請求（refreshUser、開通輪詢：要的是「此刻」的資料）。 */
  force?: boolean;
  /**
   * 不設預設值：由需要的呼叫端明確傳入（bootstrap 冷啟動／重試、AuthPage、OTP 入口、
   * 結帳頁冷載入）。設全域預設會改變輪詢與 refreshUser 的既有行為。
   */
  timeoutMs?: number;
  /**
   * 逾時後的重試：網址帶 `?retry=1`（後端跳過 heal／repair——第一個請求可能仍在跑）。
   * 不合併到進行中的請求，但**登記**為該 uid 的在飛請求，之後的一般呼叫合併到它，
   * 不會再並行一條會觸發 heal／repair 的請求。
   */
  retry?: boolean;
}

/** 401／410：session 或帳號真的無效。其餘非 2xx（除 404）一律視為暫時性。 */
const UNAUTHORIZED_STATUSES = [401, 410];

let inflight = new Map<string, Promise<ProfileFetchResult>>();

export function fetchProfile(
  token: string,
  opts: FetchProfileOptions,
): Promise<ProfileFetchResult> {
  if (opts.force) return request(token, opts);

  if (!opts.retry) {
    const existing = inflight.get(opts.userId);
    if (existing) return existing;
  }

  const map = inflight;
  const p = request(token, opts).finally(() => {
    if (map.get(opts.userId) === p) map.delete(opts.userId);
  });
  map.set(opts.userId, p);
  return p;
}

export function clearInflight(): void {
  inflight = new Map();
}

async function request(token: string, opts: FetchProfileOptions): Promise<ProfileFetchResult> {
  const { timeoutMs, retry } = opts;
  const controller = timeoutMs === undefined ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const url = buildApiUrl('/profile') + (retry ? '?retry=1' : '');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) {
      if (response.status === 404) return { kind: 'missing' };
      return UNAUTHORIZED_STATUSES.includes(response.status)
        ? { kind: 'unauthorized', status: response.status }
        : { kind: 'transient' };
    }
    return { kind: 'ok', profile: await response.json() };
  } catch {
    // 斷網、逾時（AbortError）、內容非 JSON。
    return { kind: 'transient' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 拿 session 直接讀 /profile（頁面、OTP／邀請入口用）。合併鍵是 session 的 user id，
 * 與 App 啟動判定的同一請求合併；session 沒帶 user id 時退回以 token 為鍵（不會誤併到別人）。
 */
export function fetchProfileForSession(
  session: { access_token: string; user?: { id?: string } | null },
  opts?: { force?: boolean; timeoutMs?: number; retry?: boolean },
): Promise<ProfileFetchResult> {
  return fetchProfile(session.access_token, {
    userId: session.user?.id || `token:${session.access_token}`,
    ...opts,
  });
}
