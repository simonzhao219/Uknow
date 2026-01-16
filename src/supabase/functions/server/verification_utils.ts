/**
 * ✅ 統一的身分證驗證工具
 * 
 * 所有需要身分證驗證的API端點都應該使用此工具
 * 確保驗證邏輯一致且錯誤訊息統一
 */

import * as kv from './kv_store.tsx';
import type { Context } from 'npm:hono@4.3.11';

/**
 * 驗證用戶的身分證字號是否與註冊時一致
 * 
 * @param userId - 用戶 ID
 * @param idNumber - 用戶提供的身分證字號
 * @returns 驗證成功返回 true，失敗返回 false
 */
export async function verifyIdNumber(userId: string, idNumber: string): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    console.log(`🔐 開始驗證身分證字號: userId=${userId}`);

    // 1. 獲取用戶註冊資料
    const userProfile = await kv.get(`user:${userId}:profile`);

    if (!userProfile) {
      console.error(`❌ 用戶資料不存在: ${userId}`);
      return {
        success: false,
        message: '用戶資料不存在'
      };
    }

    // 2. 檢查用戶是否有設置身分證字號
    if (!userProfile.nationalId) {
      console.error(`❌ 用戶未設置身分證字號: ${userId}`);
      return {
        success: false,
        message: '您尚未設置身分證字號，請先完成個人資料設定'
      };
    }

    // 3. 驗證身分證字號是否匹配
    if (userProfile.nationalId !== idNumber) {
      console.error(`❌ 身分證字號不符: userId=${userId}`);
      console.error(`   Profile nationalId: ${userProfile.nationalId}`);
      console.error(`   提供的 idNumber: ${idNumber}`);
      return {
        success: false,
        message: '身分證字號驗證失敗，請確認輸入正確'
      };
    }

    console.log(`✅ 身分證驗證成功: userId=${userId}`);
    return {
      success: true
    };

  } catch (error) {
    console.error('❌ 身分證驗證發生錯誤:', error);
    return {
      success: false,
      message: '驗證過程發生錯誤，請稍後再試'
    };
  }
}

/**
 * ✅ 統一的身分證驗證中間件（用於Hono路由）
 * 
 * 使用範例：
 * ```typescript
 * tasks.post('/claim-reward/:id', async (c) => {
 *   const body = await c.req.json();
 *   const { idNumber } = body;
 *   
 *   // 驗證身分證
 *   const verifyError = await verifyAndRespond(c, user.id, idNumber);
 *   if (verifyError) return verifyError;
 *   
 *   // 繼續處理業務邏輯...
 * });
 * ```
 * 
 * @param c - Hono Context
 * @param userId - 用戶 ID
 * @param idNumber - 用戶提供的身分證字號
 * @returns 如果驗證失敗，返回錯誤回應；驗證成功返回 null
 */
export async function verifyAndRespond(
  c: Context,
  userId: string,
  idNumber: string
): Promise<Response | null> {
  // 1. 檢查是否提供��分證字號
  if (!idNumber) {
    console.error('❌ 未提供身分證字號');
    return c.json({
      success: false,
      error: {
        code: 'ID_NUMBER_REQUIRED',
        message: '請提供身分證字號'
      }
    }, 400);
  }

  // 2. 執行驗證
  const result = await verifyIdNumber(userId, idNumber);

  if (!result.success) {
    return c.json({
      success: false,
      error: {
        code: 'ID_VERIFICATION_FAILED',
        message: result.message || '身分證字號驗證失敗'
      }
    }, 403);
  }

  // 3. 驗證成功，返回 null（繼續執行）
  return null;
}

/**
 * 格式化錯誤回應
 * 
 * @param message - 錯誤訊息
 * @param code - 錯誤代碼（可選）
 * @param statusCode - HTTP 狀態碼（預設 400）
 */
export function errorResponse(
  c: Context,
  message: string,
  code: string = 'BAD_REQUEST',
  statusCode: number = 400
) {
  return c.json({
    success: false,
    error: {
      code,
      message
    }
  }, statusCode);
}