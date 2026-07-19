/**
 * 統一的 API 請求工具
 * 
 * 自動處理認證 token，提供一致的錯誤處理
 */

import { getAccessToken } from './auth';
import { getApiBaseUrl } from '../config';
import { createClient } from './supabase/client';
import { emitSessionExpired } from './authEvents';

/**
 * API 請求錯誤
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  isRetry = false
): Promise<Response> {
  // 1. 獲取 access token
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError('請先登入', 401, 'UNAUTHORIZED');
  }

  // 2. 合併 headers
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  // 3. 發送請求
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // 4. 處理認證錯誤：先嘗試 refresh session 一次再重試，避免因 token 剛好
    // 過期這種暫時性狀況就直接判定登入過期（refresh-and-retry-once）。
    if (response.status === 401) {
      if (!isRetry) {
        const supabase = createClient();
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && data.session) {
          return apiRequest(url, options, true);
        }
      }
      throw new ApiError('登入已過期，請重新登入', 401, 'UNAUTHORIZED');
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
      'NETWORK_ERROR'
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
export async function apiRequestJson<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await apiRequest(url, options);
    
    if (!response.ok) {
      let errorMessage = `請求失敗 (${response.status})`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch {
        // 無法解析錯誤訊息，使用預設訊息
      }
      
      throw new ApiError(errorMessage, response.status);
    }
    
    return response.json();
  } catch (err) {
    // ✅ P0 修復：統一處理 401 未授權
    if (err instanceof ApiError && err.status === 401) {
      console.log('🚫 API 401 Unauthorized - 清除 session 並跳轉登入頁');
      
      // 清除 Supabase session
      const supabase = createClient();
      await supabase.auth.signOut();
      
      // 清除 localStorage
      localStorage.removeItem('user');
      localStorage.removeItem('pendingSession');

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

/**
 * 構建後端 API URL
 * 
 * @param path - API 路徑（例如：'/rewards', '/tasks'）
 * @returns 完整的 API URL
 * 
 * @example
 * ```typescript
 * const url = buildApiUrl('/rewards');
 * // 返回: https://{projectId}.supabase.co/functions/v1/api/rewards
 * ```
 */
export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${cleanPath}`;
}