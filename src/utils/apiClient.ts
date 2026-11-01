/**
 * 統一的 API 請求工具
 *
 * 自動處理認證 token，提供一致的錯誤處理
 */

import { getAccessToken } from './auth';
import { createClient } from './supabase/client';
import { emitSessionExpired } from './authEvents';
import { isRetryableAuthError } from './authErrors';
import { endInvalidSession } from './endInvalidSession';
import { fetchProfileForSession, PROFILE_RETRY_TIMEOUT_MS } from './fetchProfile';

/**
 * API 請求錯誤
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 兩層確認判定 session 無效（只有這個碼會讓 apiRequestJson 本機登出）。 */
const SESSION_INVALID = 'SESSION_INVALID';
/** apiRequest 內部用：重打仍 401（不外流，交給第一層呼叫做 /profile 確認）。 */
const RETRY_STILL_401 = 'RETRY_STILL_401';

const authUnavailable = () => new ApiError('連線不穩，請稍後再試', 503, 'AUTH_UNAVAILABLE');
const sessionInvalid = () => new ApiError('登入已過期，請重新登入', 401, SESSION_INVALID);

/** 第二層：refresh 成功卻仍 401，用 /profile 分辨是 session 無效還是端點自己的 401。 */
async function confirmSession(session: {
  access_token: string;
  user?: { id?: string } | null;
}): Promise<ApiError> {
  const r = await fetchProfileForSession(session, {
    force: true,
    timeoutMs: PROFILE_RETRY_TIMEOUT_MS,
  });
  if (r.kind === 'transient') return authUnavailable();
  if (r.kind === 'unauthorized') return sessionInvalid();
  return new ApiError('請求未授權', 401, 'UNAUTHORIZED');
}

/**
 * 發送 API 請求（自動附加認證 token）
 *
 * @param url - API 端點 URL
 * @param options - fetch 選項
 * @returns Promise<Response>
 * @throws {ApiError} 如果請求失敗
 *
 * @example
 * ```typescript
 * try {
 *   const response = await apiRequest('/api/user/profile', {
 *     method: 'PUT',
 *     body: JSON.stringify(data)
 *   });
 *   const result = await response.json();
 * } catch (error) {
 *   if (error instanceof ApiError && error.status === 401) {
 *     showToast('登入已過期，請重新登入', 'error');
 *     navigate('/login');
 *   }
 * }
 * ```
 */
export async function apiRequest(
  url: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<Response> {
  // 1. 獲取 access token
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError('請先登入', 401, 'UNAUTHORIZED');
  }

  // 2. 合併 headers
  // FormData（multipart）不可預設 JSON Content-Type：要讓瀏覽器自己帶 boundary，
  // 否則後端 formData() 解析失敗。呼叫端傳入的 headers 仍可覆寫。
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  // 3. 發送請求
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 4. 處理認證錯誤（T1-B §2.7 兩層確認）：401 不直接判 session 無效。
    //   (1) refreshSession：Auth 回不來（網路層、5xx、429）→ AUTH_UNAVAILABLE，不登出；
    //       Auth 明確拒絕（4xx）或沒有 session → SESSION_INVALID。
    //   (2) refresh 成功、重打仍 401 → 用新 session 問 /profile（唯一分得出暫時性與無效的端點）：
    //       暫時讀不到 → AUTH_UNAVAILABLE；401／410 → SESSION_INVALID；正常 → 是端點自己的 401（UNAUTHORIZED）。
    // 只有 SESSION_INVALID 會讓 apiRequestJson 本機登出。
    if (response.status === 401) {
      if (isRetry) throw new ApiError('請求未授權', 401, RETRY_STILL_401);
      const supabase = createClient();
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        throw isRetryableAuthError(refreshError) ? authUnavailable() : sessionInvalid();
      }
      if (!data.session) throw sessionInvalid();
      try {
        return await apiRequest(url, options, true);
      } catch (err) {
        if (err instanceof ApiError && err.code === RETRY_STILL_401) {
          throw await confirmSession(data.session);
        }
        throw err;
      }
    }

    return response;
  } catch (error) {
    // 如果是網絡錯誤或其他錯誤
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      error instanceof Error ? error.message : '網絡請求失敗',
      undefined,
      'NETWORK_ERROR',
    );
  }
}

/**
 * 發送 API 請求並自動解析 JSON 回應
 *
 * ✅ P0 修復：統一處理 401 未授權
 * - 自動清除 session 和 localStorage
 * - 跳轉到登入頁
 *
 * @param url - API 端點 URL
 * @param options - fetch 選項
 * @returns Promise<T> 解析後的 JSON 資料
 * @throws {ApiError} 如果請求失敗
 *
 * @example
 * ```typescript
 * const data = await apiRequestJson<RewardsData>(
 *   `https://${projectId}.supabase.co/functions/v1/api/rewards`
 * );
 * console.log('Available rewards:', data.availableRewards);
 * ```
 */
/**
 * 從後端錯誤回應中取出人類可讀的訊息。
 *
 * 後端有兩種錯誤信封並存（index.ts 中字串形 69 處、物件形 38 處）：
 *   { error: '已有有效訂閱，請到期後再續約' }   ← 字串形
 *   { error: { message: '...' } }               ← 物件形
 * 只解析物件形會讓字串形的具體原因退化成「請求失敗 (400)」——
 * 續訂、付款準備這些金流節點的錯誤訊息就這樣遺失。兩種都要接。
 */
export function extractApiErrorMessage(errorData: unknown, fallback: string): string {
  if (errorData && typeof errorData === 'object') {
    const { error, message } = errorData as { error?: unknown; message?: unknown };
    if (typeof error === 'string' && error) return error;
    if (error && typeof error === 'object') {
      const nested = (error as { message?: unknown }).message;
      if (typeof nested === 'string' && nested) return nested;
    }
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * 把後端錯誤信封組成 ApiError（訊息＋狀態＋**錯誤碼**）。
 *
 * 抽成純函式而不是寫在 apiRequestJson 裡，是為了讓「碼有沒有被帶出來」這件事
 * 可以在 node 測試裡直接驗——包在 fetch 流程裡就得連 supabase client 一起替身，
 * 那種測試通常不會被寫，於是這條線就沒有人守。
 */
export function apiErrorFromBody(errorData: unknown, status: number): ApiError {
  return new ApiError(
    extractApiErrorMessage(errorData, `請求失敗 (${status})`),
    status,
    extractApiErrorCode(errorData),
  );
}

/** 取物件形信封的錯誤碼（`{ error: { code } }`）；沒有或不是字串一律 undefined。 */
export function extractApiErrorCode(errorData: unknown): string | undefined {
  if (errorData && typeof errorData === 'object') {
    const { error } = errorData as { error?: unknown };
    if (error && typeof error === 'object') {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string' && code) return code;
    }
  }
  return undefined;
}

export async function apiRequestJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await apiRequest(url, options);

    if (!response.ok) {
      let apiError = apiErrorFromBody(null, response.status);

      try {
        apiError = apiErrorFromBody(await response.json(), response.status);
      } catch {
        // 無法解析錯誤訊息，使用預設訊息
      }

      throw apiError;
    }

    return response.json();
  } catch (err) {
    // ✅ P0 修復：統一處理 401 未授權
    if (err instanceof ApiError && err.code === SESSION_INVALID) {
      console.log('🚫 API 401 Unauthorized - 清除 session 並跳轉登入頁');

      // 兩層確認後 session 確實無效：本機登出（W4-13，不撤銷其他裝置）＋清首繪提示與帳號本機鍵。
      await endInvalidSession({ auth: createClient().auth });

      // 通知上層（App.tsx）以 SPA 導頁方式跳轉到登入頁，避免 window.location.href
      // 造成整頁重新載入的閃爍。
      emitSessionExpired();

      // 重新拋出錯誤（讓呼叫方可以顯示提示）
      throw new ApiError('登入已過期，請重新登入', 401, 'UNAUTHORIZED');
    }

    // 其他錯誤直接拋出
    throw err;
  }
}

// 網址組裝已搬到零依賴的 apiUrl.ts（T1-B）；這裡轉出，既有 import 不變。
export { buildApiUrl } from './apiUrl';
