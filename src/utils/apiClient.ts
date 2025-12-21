/**
 * 統一的 API 請求工具
 * 
 * 自動處理認證 token，提供一致的錯誤處理
 */

import { getAccessToken } from './auth';
import { projectId } from './supabase/info';

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
  options: RequestInit = {}
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
    
    // 4. 處理認證錯誤
    if (response.status === 401) {
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
 * @param url - API 端點 URL
 * @param options - fetch 選項
 * @returns Promise<T> 解析後的 JSON 資料
 * @throws {ApiError} 如果請求失敗
 * 
 * @example
 * ```typescript
 * const data = await apiRequestJson<RewardsData>(
 *   `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/rewards`
 * );
 * console.log('Available rewards:', data.availableRewards);
 * ```
 */
export async function apiRequestJson<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
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
 * // 返回: https://{projectId}.supabase.co/functions/v1/make-server-5c6718b9/rewards
 * ```
 */
export function buildApiUrl(path: string): string {
  // 確保 path 以 / 開頭
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9${cleanPath}`;
}
