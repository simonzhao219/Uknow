/**
 * 完成註冊模組
 * 處理用戶點擊「完成註冊」按鈕後的所有推薦相關數據創建
 */

import { Context } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { verifyToken } from "./auth.ts";
import { completeUserRegistration } from "./auth_registration_core.ts";

/**
 * POST /auth/complete-registration
 * 完成註冊（用戶點擊「完成註冊」按鈕後調用）
 */
export const completeRegistration = async (c: Context) => {
  try {
    console.log('[completeRegistration] 開始完成註冊...');
    
    // 1. 驗證 access token
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      console.error('[completeRegistration] 缺少 Authorization header');
      return c.json({ error: { message: "未登入" } }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { user, error: authError } = await verifyToken(token);

    if (authError || !user) {
      console.error('[completeRegistration] Token 驗證失敗:', authError);
      return c.json({ error: { message: "登入已過期" } }, 401);
    }

    console.log(`[completeRegistration] 用戶認證成功: ${user.id}`);
    
    // 2. 調用核心函數完成註冊
    const result = await completeUserRegistration(user.id);
    
    if (!result.success) {
      console.error('[completeRegistration] 註冊失敗:', result.error);
      return c.json({ 
        error: { message: result.error || '註冊失敗' } 
      }, 400);
    }
    
    console.log('[completeRegistration] 🎉 註冊完成:', user.id);
    
    return c.json({
      success: true,
      message: '註冊完成！',
      data: result.data
    });
    
  } catch (error: any) {
    console.error('[completeRegistration] 錯誤:', error);
    return c.json({ 
      error: { message: '系統錯誤，請稍後再試' } 
    }, 500);
  }
};