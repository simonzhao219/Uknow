/**
 * 統一的認證工具
 * 
 * 提供一致的認證方法，確保所有組件使用相同的方式獲取 token 和檢查登入狀態
 */

import { createClient } from './supabase/client';

/**
 * 獲取當前用戶的 access token
 * 
 * @returns {Promise<string | null>} access_token 或 null（如果未登入）
 * 
 * @example
 * ```typescript
 * const token = await getAccessToken();
 * if (!token) {
 *   showToast('請先登入', 'error');
 *   return;
 * }
 * ```
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[auth] 獲取 session 失敗:', error);
      return null;
    }
    
    if (!session) {
      console.info('[auth] 未找到有效的 session');
      return null;
    }
    
    return session.access_token;
  } catch (error) {
    console.error('[auth] getAccessToken 異常:', error);
    return null;
  }
}

/**
 * 檢查用戶是否已登入
 * 
 * @returns {Promise<boolean>} true 表示已登入，false 表示未登入
 * 
 * @example
 * ```typescript
 * if (!(await isAuthenticated())) {
 *   showToast('請先登入', 'error');
 *   navigate('/login');
 *   return;
 * }
 * ```
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

/**
 * 獲取當前 session
 * 
 * @returns {Promise<Session | null>} session 對象或 null
 * 
 * @example
 * ```typescript
 * const session = await getSession();
 * if (!session) {
 *   showToast('請先登入', 'error');
 *   return;
 * }
 * console.log('User ID:', session.user.id);
 * ```
 */
export async function getSession() {
  try {
    const supabase = createClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('[auth] 獲取 session 失敗:', error);
      return null;
    }
    
    return session;
  } catch (error) {
    console.error('[auth] getSession 異常:', error);
    return null;
  }
}
