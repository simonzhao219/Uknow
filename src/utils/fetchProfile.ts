// /profile 的唯一 fetch（T1 auth-state-trust，plan §2.4）。
//
// 模組單例：in-flight map 在模組內，bootstrap、AuthPage、OTP／邀請入口 import
// 同一個函式，同一個 user id 進行中的請求自然合併成一次。合併鍵是 user id
// 而非 token（同一人 token 換發不該多打一次）。登出或換 session 時呼叫
// clearInflight()，之後的請求不會合併到以已撤銷 token 在飛的舊請求。

import { buildApiUrl } from './apiClient';

export type ProfileFetchResult =
  | { kind: 'ok'; profile: any }
  | { kind: 'unauthorized'; status: number }
  | { kind: 'transient' };

export interface FetchProfileOptions {
  userId: string;
  /** 不合併到進行中的請求（refreshUser、開通輪詢：要的是「此刻」的資料）。 */
  force?: boolean;
  /** PR-A 一律不傳（E1）；PR-B 以 PROFILE_FETCH_TIMEOUT_MS 啟用。 */
  timeoutMs?: number;
}

/** 這三個狀態代表 session／帳號真的無效；其餘非 2xx 一律視為暫時性。 */
const UNAUTHORIZED_STATUSES = [401, 404, 410];

let inflight = new Map<string, Promise<ProfileFetchResult>>();

export function fetchProfile(
  token: string,
  opts: FetchProfileOptions,
): Promise<ProfileFetchResult> {
  if (opts.force) return request(token, opts.timeoutMs);

  const existing = inflight.get(opts.userId);
  if (existing) return existing;

  const map = inflight;
  const p = request(token, opts.timeoutMs).finally(() => {
    if (map.get(opts.userId) === p) map.delete(opts.userId);
  });
  map.set(opts.userId, p);
  return p;
}

export function clearInflight(): void {
  inflight = new Map();
}

async function request(token: string, timeoutMs: number | undefined): Promise<ProfileFetchResult> {
  const controller = timeoutMs === undefined ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(buildApiUrl('/profile'), {
      headers: { Authorization: `Bearer ${token}` },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) {
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
  opts?: { force?: boolean; timeoutMs?: number },
): Promise<ProfileFetchResult> {
  return fetchProfile(session.access_token, {
    userId: session.user?.id || `token:${session.access_token}`,
    ...opts,
  });
}
