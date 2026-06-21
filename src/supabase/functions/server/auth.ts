import { Context } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { 
  getTaiwanNow, 
  toTaiwanISOString
} from './date_utils.ts';

// 導出 completeRegistration 函數
export { completeRegistration } from './auth_complete_registration.ts';

// 創建 Supabase Admin Client（用於管理操作）
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

/**
 * 從 JWT token 中解碼用戶信息
 * JWT 格式：header.payload.signature
 * Payload 包含用戶 ID 和其他信息
 */
function decodeJWT(token: string): { sub: string; email?: string } | null {
  try {
    // JWT 由三部分組成，用 . 分隔
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('[decodeJWT] Invalid JWT format: expected 3 parts');
      return null;
    }
    
    // Payload 是第二部分，使用 base64url 編碼
    const payload = parts[1];
    
    // Base64url 解碼
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    const decoded = JSON.parse(jsonPayload);
    
    console.log('[decodeJWT] Decoded JWT payload:', {
      sub: decoded.sub,
      email: decoded.email,
      exp: decoded.exp,
      iat: decoded.iat
    });
    
    // 檢查 token 是否過期
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      console.error('[decodeJWT] Token has expired');
      return null;
    }
    
    return decoded;
  } catch (error) {
    console.error('[decodeJWT] Error decoding JWT:', error);
    return null;
  }
}

/**
 * 驗證 JWT token 並返回用戶信息
 * 解碼 JWT 並使用 Admin API 獲取完整用戶信息
 */
export async function verifyToken(token: string) {
  try {
    // 1. 解碼 JWT 獲取用戶 ID
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.sub) {
      console.error('[verifyToken] Failed to decode JWT or missing user ID');
      return { user: null, error: new Error('Invalid token') };
    }
    
    const userId = decoded.sub;
    console.log(`[verifyToken] Decoded user ID: ${userId}`);
    
    // 2. 使用 Admin API 獲取用戶完整信息
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (error || !user) {
      console.error('[verifyToken] Failed to get user by ID:', error);
      return { user: null, error: error || new Error('User not found') };
    }
    
    console.log(`[verifyToken] Token verified successfully for user: ${user.id}, email: ${user.email}`);
    return { user, error: null };
  } catch (error) {
    console.error('[verifyToken] Exception:', error);
    return { user: null, error };
  }
}

/**
 * 檢查 Email 是否已註冊
 * POST /auth/check-email
 * 
 * ✅ Phase 10.2: 修復分頁問題，使用 getUserByEmail API
 */
export const checkEmail = async (c: Context) => {
  try {
    const { email } = await c.req.json();
    console.log(`[checkEmail] Checking email: ${email}`);

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    // ✅ 修復：使用 listUsers 的分頁查詢，確保查詢所有用戶
    // 或者更好的做法：直接嘗試用 email 查詢
    let user = null;
    let page = 1;
    const perPage = 1000; // 每頁最多 1000 個用戶
    
    console.log(`[checkEmail] Searching for user by email across all pages...`);
    
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });
      
      if (error) {
        console.error(`[checkEmail] Error listing users (page ${page}):`, error);
        return c.json({ error: "Internal server error" }, 500);
      }
      
      console.log(`[checkEmail] Checking page ${page}, found ${data.users.length} users`);
      
      // 在當前頁查找用戶
      const foundUser = data.users.find(u => u.email === email);
      
      if (foundUser) {
        user = foundUser;
        console.log(`[checkEmail] ✅ Found user on page ${page}: ${user.id}`);
        break;
      }
      
      // 如果當前頁用戶數小於 perPage，表示已經是最後一頁
      if (data.users.length < perPage) {
        console.log(`[checkEmail] Reached last page (${page}), user not found`);
        break;
      }
      
      // 繼續查詢下一頁
      page++;
      
      // 安全限制：最多查詢 100 頁（避免無限循環）
      if (page > 100) {
        console.error(`[checkEmail] ⚠️ Stopped at page 100 to prevent infinite loop`);
        break;
      }
    }

    // 如果用戶不存在，視為新用戶
    if (!user) {
      console.log(`[checkEmail] User ${email} not found in Supabase Auth (checked ${page} page(s))`);
      return c.json({ exists: false });
    }

    console.log(`[checkEmail] User found: ${user.id}, email_confirmed_at: ${user.email_confirmed_at}`);

    // 檢查用戶是否已完成資料填寫
    let profile = null;
    try {
      profile = await kv.get(`user:${user.id}:profile`);
      console.log(`[checkEmail] Profile in KV Store: ${profile ? 'exists' : 'not found'}`);
    } catch (kvError) {
      console.log("[checkEmail] KV Store not available or error:", kvError);
    }
    
    // 情況 1：Email 已驗證 + 有 Profile = 完整註冊用戶（可以登入）
    if (user.email_confirmed_at && profile) {
      console.log(`[checkEmail] ✅ User ${email} is fully registered (confirmed + profile)`);
      return c.json({ exists: true });
    }

    // 情況 2：Email 已驗證 + 沒有 Profile = 正在註冊流程中（已驗證但未完成資料填寫）
    // 這種情況應該讓用戶登入，然後導向 CompleteProfile
    if (user.email_confirmed_at && !profile) {
      console.log(`[checkEmail] ⚠️ User ${email} email verified but profile incomplete (正在註冊流程中，允許登入)`);
      return c.json({ exists: true }); // 讓用戶登入
    }

    // 情況 3：Email 未驗證（無論有沒有 Profile）= 註冊未完成
    // 刪除舊記錄，允許重新註冊
    if (!user.email_confirmed_at) {
      console.log(`[checkEmail] ❌ User ${email} email not verified, deleting and allowing re-registration`);
      
      try {
        await supabaseAdmin.auth.admin.deleteUser(user.id);
        console.log(`[checkEmail] Deleted unverified user: ${user.id}`);
        
        // 同時刪除 KV Store 中的記錄（如果有）
        if (profile) {
          await kv.del(`user:${user.id}:profile`);
          await kv.del(`user:email:${email}`);
          console.log(`[checkEmail] Deleted KV Store records for: ${user.id}`);
        }
      } catch (deleteError) {
        console.error("[checkEmail] Error deleting unverified user:", deleteError);
      }
      
      return c.json({ exists: false });
    }

    // 預設：允許登入
    console.log(`[checkEmail] Default: allowing login for ${email}`);
    return c.json({ exists: true });
  } catch (error) {
    console.error("[checkEmail] Error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};

/**
 * 註冊新用戶（創建 Supabase Auth 用戶並發送驗證郵件）
 * POST /auth/signup
 */
export const signUpUser = async (c: Context) => {
  try {
    const { email, password } = await c.req.json();

    // 驗證必填欄位
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // 驗證 Email 格式
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }

    // 驗證密碼強度
    const passwordErrors = [];
    if (password.length < 8) {
      passwordErrors.push("至少 8 個字元");
    }
    if (!/[A-Z]/.test(password)) {
      passwordErrors.push("至少一個大寫字母");
    }
    if (!/[a-z]/.test(password)) {
      passwordErrors.push("至少一個小寫字母");
    }
    if (!/[0-9]/.test(password)) {
      passwordErrors.push("至少一個數字");
    }

    if (passwordErrors.length > 0) {
      return c.json({ 
        error: `密碼需包含：${passwordErrors.join("、")}` 
      }, 400);
    }

    // 檢查用戶是否已存在
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("Error listing users:", listError);
      return c.json({ error: "Internal server error" }, 500);
    }

    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      // 如果已經有完整的 profile，不允許重複註冊
      try {
        const profile = await kv.get(`user:${existingUser.id}:profile`);
        if (profile && existingUser.email_confirmed_at) {
          return c.json({ error: "此 Email 已被註冊" }, 400);
        }
      } catch (kvError) {
        console.log("KV Store error:", kvError);
      }

      // 刪除未完成的用戶記錄，允許重新註冊
      try {
        await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
        console.log(`Deleted incomplete user: ${existingUser.id}`);
      } catch (deleteError) {
        console.error("Error deleting user:", deleteError);
      }
    }

    // 使用 Admin API 創建用戶（不自動確認 email）
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // 需要用戶驗證 Email
    });

    if (error) {
      console.error("Error creating user:", error);
      return c.json({ 
        error: error.message || "註冊失敗，請稍後再試" 
      }, 400);
    }

    console.log(`User created: ${data.user.id}, email: ${email}`);

    // 注意：email_confirm: false 時，Supabase 不會自動發送驗證郵件
    // 我們需要手動觸發驗證郵件流程，但這在 Admin API 中比較複雜
    // 更好的方案是：在前端使用 client-side signUp，讓 Supabase 自動處理驗證郵件

    return c.json({ 
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      message: "註冊成功，請檢查您的 Email 以完成驗證"
    });
  } catch (error) {
    console.error("Error in signUpUser:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};

/**
 * 完成註冊（儲存用戶資料）
 * POST /auth/register
 */
export const registerUser = async (c: Context) => {
  try {
    console.log('[registerUser] Starting user registration...');
    
    // 1. 驗證 access token
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      console.error('[registerUser] No Authorization header');
      return c.json({ error: "Authorization header is required" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    console.log('[registerUser] Verifying token...');
    const { user, error: authError } = await verifyToken(token);

    if (authError || !user) {
      console.error("[registerUser] Auth error:", authError);
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`[registerUser] Authenticated user: ${user.id}, email: ${user.email}`);

    // 2. 取得表單資料（✅ 新增 referralCode 和 nationalId）
    const { name, nationalId, phone, birthDate, referralCode } = await c.req.json();
    console.log(`[registerUser] Form data received - name: ${name}, nationalId: ${nationalId}, phone: ${phone}, birthDate: ${birthDate}, referralCode: ${referralCode || '無'}`);

    // 3. 驗證必填欄位
    if (!name || !nationalId || !phone || !birthDate) {
      console.error('[registerUser] Missing required fields');
      return c.json({ error: "Name, nationalId, phone, and birthDate are required" }, 400);
    }
    
    // ✅ 4. 智能推荐码处理（新规格）
    let referredByUserId = null;
    let referredByListingId = null;
    let isAutoReferral = false;  // ✅ 新增：标记是否为系统自动带入的推荐码
    const DEFAULT_REFERRAL_CODE = 'asa899869';
    
    // 确定最终使用的推荐码
    let finalReferralCode = referralCode;
    
    // 1️⃣ 如果用户没有填写推荐码，尝试使用预设推荐码
    if (!referralCode || referralCode.trim() === '') {
      console.log(`[registerUser] 用户未填写推荐码，检查预设推荐码 ${DEFAULT_REFERRAL_CODE} 是否存在...`);
      
      // 查询预设推荐码是否存在
      const defaultReferralData = await kv.get(`referral_code:${DEFAULT_REFERRAL_CODE}`);
      
      if (defaultReferralData) {
        console.log(`[registerUser] ✅ 预设推荐码存在，自动使用: ${DEFAULT_REFERRAL_CODE}`);
        finalReferralCode = DEFAULT_REFERRAL_CODE;
        isAutoReferral = true;  // ✅ 标记为系统自动带入
      } else {
        console.log(`[registerUser] ⚠️ 预设推荐码不存在，不建立推荐关系`);
        finalReferralCode = null;
      }
    } else {
      console.log(`[registerUser] 用户主动填写了推荐码: ${referralCode}`);
      isAutoReferral = false;  // ✅ 标记为用户主动填写
    }
    
    // 2️⃣ 如果有推荐码（用户填写或自动使用预设），进行验证
    if (finalReferralCode) {
      console.log(`[registerUser] 验证推荐码: ${finalReferralCode} (${isAutoReferral ? '系统自动' : '用户主动'})`);
      
      const referralData = await kv.get(`referral_code:${finalReferralCode}`);
      
      if (!referralData) {
        console.error(`[registerUser] 推荐码无效: ${finalReferralCode}`);
        return c.json({ error: "推荐码无效" }, 400);
      }
      
      // ✅ 新架构：推荐码绑定到用户，listingId 可以为 null
      // 推荐码在付款后生成，初始 listingId = null
      // 只要有 userId 就是有效的推荐码
      referredByUserId = referralData.userId;
      referredByListingId = referralData.listingId;  // 可能为 null（用户尚未创建刊登）
      
      console.log(`[registerUser] ✅ 推荐码验证成功: ${finalReferralCode}, 推荐人: ${referredByUserId}, 刊登: ${referredByListingId || 'null (未创建刊登)'}, 自动推荐: ${isAutoReferral}`);
    }

    // 5. 驗證手機號碼格式（台灣手機號碼：09 開頭，共 10 位數）
    if (!/^09\d{8}$/.test(phone)) {
      console.error(`[registerUser] Invalid phone format: ${phone}`);
      return c.json({ error: "手機號碼格式不正確（格式：09XXXXXXXX）" }, 400);
    }

    // ✅ 5.5 驗證身分證字號格式（台灣身分證字號：1個英文字母 + 1個數字（性別碼）+ 8個數字）
    if (!/^[A-Z][12]\d{8}$/.test(nationalId)) {
      console.error(`[registerUser] Invalid nationalId format: ${nationalId}`);
      return c.json({ error: "身分證字號格式不正確（格式：A123456789）" }, 400);
    }
    console.log(`[registerUser] National ID format validation passed`);

    // 6. 驗證年齡（需年滿 18 歲）- ✅ 使用台灣時區
    const birthDateObj = new Date(birthDate);
    const today = getTaiwanNow();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const monthDiff = today.getMonth() - birthDateObj.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
      age--;
    }
    if (age < 18) {
      console.error(`[registerUser] User too young: ${age} years old`);
      return c.json({ error: "註冊用戶需年滿 18 歲" }, 400);
    }
    console.log(`[registerUser] Age validation passed: ${age} years old`);

    // 7. 檢查手機號碼是否重複
    try {
      const allUsers = await kv.getByPrefix("user:");
      const phoneExists = allUsers.some((u: any) => u.phone === phone && u.id !== user.id);
      if (phoneExists) {
        console.error(`[registerUser] Phone number already exists: ${phone}`);
        return c.json({ error: "此手機號碼已被註冊" }, 400);
      }
      console.log('[registerUser] Phone number is unique');
      
      // ✅ 7.5 檢查身分證字號是否重複
      const nationalIdExists = allUsers.some((u: any) => u.nationalId === nationalId && u.id !== user.id);
      if (nationalIdExists) {
        console.error(`[registerUser] National ID already exists: ${nationalId}`);
        return c.json({ error: "此身分證字號已被註冊" }, 400);
      }
      console.log('[registerUser] National ID is unique');
    } catch (kvError) {
      console.log("[registerUser] KV Store error when checking phone/nationalId, skipping duplicate check:", kvError);
      // KV Store 不可用，跳過重複檢查（在早期開發階段可以接受）
    }

    // ✅ 8. 儲存用戶資料（registrationStep = 1，等待付款）
    const profile = {
      id: user.id,
      publicUserId: null,  // 第一次創建刊登時才生成
      email: user.email,
      name,
      nationalId,  // ✅ 新增身分證字號
      phone,
      birthDate,
      isAdmin: false,
      emailVerified: true,  // Supabase 已驗證
      phoneVerified: true,  // 我們只做格式驗證
      registrationStep: 1,  // ✅ 新增：Step 1 = 基本資訊完成，等待付款
      referralCode: null,  // ✅ 新增：付款後才會生成
      referredByCode: finalReferralCode || null,  // ✅ 新增：推荐码
      referredByUserId: referredByUserId,  // ✅ 新增：推荐人用户 ID
      referredByListingId: referredByListingId,  // ✅ 新增：推荐人刊登 ID
      isAutoReferral: isAutoReferral,  // ✅ 新增：标记是否为系统自动带入的推荐码
      createdAt: toTaiwanISOString(getTaiwanNow()),
      updatedAt: toTaiwanISOString(getTaiwanNow()),
    };

    console.log('[registerUser] Attempting to save profile to KV Store...');
    console.log('[registerUser] Profile data:', JSON.stringify(profile));

    try {
      await kv.set(`user:${user.id}:profile`, profile);
      console.log(`[registerUser] ✅ Saved user:${user.id}:profile to KV Store`);
      
      await kv.set(`user:email:${user.email}`, user.id);
      console.log(`[registerUser] ✅ Saved user:email:${user.email} to KV Store`);
      
      console.log(`[registerUser] ✅ User registered successfully (Step 1): ${user.id}`);
      
      // 驗證保存是否成功
      const savedProfile = await kv.get(`user:${user.id}:profile`);
      if (savedProfile) {
        console.log(`[registerUser] ✅ Verification: Profile exists in KV Store`);
      } else {
        console.error(`[registerUser] ❌ Verification FAILED: Profile not found in KV Store after save!`);
      }
    } catch (kvError) {
      console.error("[registerUser] ❌ Error saving to KV Store:", kvError);
      return c.json({ error: "無法儲存用戶資料，請稍後再試" }, 500);
    }

    console.log('[registerUser] Returning profile to client...');
    return c.json(profile);
  } catch (error) {
    console.error("[registerUser] Unexpected error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};

/**
 * 取得用戶資料
 * GET /auth/profile
 */
export const getUserProfile = async (c: Context) => {
  try {
    console.log('[getUserProfile] Getting user profile...');
    
    // 1. 驗證 access token
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      console.error('[getUserProfile] No Authorization header');
      return c.json({ error: "Authorization header is required" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    console.log(`[getUserProfile] Token received (length: ${token.length})`);
    
    // 使用 verifyToken 函數來驗證 token
    console.log('[getUserProfile] Verifying token...');
    const { user, error: authError } = await verifyToken(token);

    if (authError || !user) {
      console.error("[getUserProfile] Token verification failed:", authError);
      return c.json({ error: "Unauthorized", details: authError?.message || "Invalid token" }, 401);
    }

    console.log(`[getUserProfile] Authenticated user: ${user.id}, email: ${user.email}, email_confirmed_at: ${user.email_confirmed_at}`);

    // 2. 從 KV Store 取得用戶資料
    let profile = null;
    try {
      console.log(`[getUserProfile] Fetching profile from KV Store: user:${user.id}:profile`);
      profile = await kv.get(`user:${user.id}:profile`);
      console.log(`[getUserProfile] Profile found: ${profile ? 'YES' : 'NO'}`);
      if (profile) {
        console.log(`[getUserProfile] Profile data:`, JSON.stringify(profile));
      }
    } catch (kvError) {
      console.error("[getUserProfile] KV Store error when getting profile:", kvError);
      // KV Store 不可用，返回基本用戶資訊
    }

    if (!profile) {
      // 用戶存在於 Auth 但沒有 profile（剛驗證完 email）
      console.log(`[getUserProfile] ⚠️ No profile found, user needs to complete registration`);
      return c.json({
        id: user.id,
        email: user.email,
        registrationStep: 0,  // ✅ 修正：Step 0 = 需要填寫基本資料
      });
    }

    // ✅ 新增：檢查 profile 是否包含基本資料（name, phone, birthDate）
    if (!profile.name || !profile.phone || !profile.birthDate) {
      console.log(`[getUserProfile] ⚠️ Profile incomplete (missing name/phone/birthDate), user needs to complete basic info`);
      return c.json({
        id: user.id,
        email: user.email,
        registrationStep: 0,  // Step 0 = 需要填寫基本資料
      });
    }

    console.log(`[getUserProfile] ✅ Returning complete profile`);
    return c.json(profile);
  } catch (error) {
    console.error("[getUserProfile] Unexpected error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};

/**
 * 檢查手機號碼是否可用
 * POST /auth/check-phone
 */
export const checkPhoneAvailability = async (c: Context) => {
  try {
    const { phone } = await c.req.json();

    if (!phone) {
      return c.json({ error: "Phone is required" }, 400);
    }

    // 驗證手機號碼格式
    if (!/^09\d{8}$/.test(phone)) {
      return c.json({ 
        available: false, 
        error: "手機號碼格式不正確（格式：09XXXXXXXX）" 
      });
    }

    // 檢查手機號碼是否重複
    try {
      const allUsers = await kv.getByPrefix("user:");
      const phoneExists = allUsers.some((u: any) => u.phone === phone);

      return c.json({ 
        available: !phoneExists,
        error: phoneExists ? "此手機號碼已被註冊" : null
      });
    } catch (kvError) {
      console.log("KV Store error when checking phone availability:", kvError);
      // KV Store 不可用，假設手機號碼可用（在早期開發階段）
      return c.json({ 
        available: true,
        error: null
      });
    }
  } catch (error) {
    console.error("Error checking phone:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};

/**
 * 重置註冊狀態（用於編輯註冊資料）
 * POST /auth/reset-registration
 * 
 * 功能：將用戶的 registrationStep 重置為 0，但保留 email 和 id
 * 用途：當用戶在付款前想要編輯註冊資料時使用
 */
export const resetRegistration = async (c: Context) => {
  try {
    console.log('[resetRegistration] Starting registration reset...');
    
    // 1. 驗證 access token
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      console.error('[resetRegistration] No Authorization header');
      return c.json({ error: { message: "Authorization header is required" } }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { user, error: authError } = await verifyToken(token);

    if (authError || !user) {
      console.error('[resetRegistration] Token verification failed:', authError);
      return c.json({ error: { message: "無效的認證 token" } }, 401);
    }

    console.log(`[resetRegistration] User authenticated: ${user.id}`);

    // 2. 獲取當前用戶的 profile
    const profileKey = `user:${user.id}:profile`;
    const currentProfile = await kv.get(profileKey);

    if (!currentProfile) {
      console.error(`[resetRegistration] Profile not found for user: ${user.id}`);
      return c.json({ error: { message: "用戶資料不存在" } }, 404);
    }

    console.log(`[resetRegistration] Current profile found, resetting to step 0`);

    // 3. 創建重置後的 profile（保留 id, email，清除其他資料）
    const resetProfile = {
      id: user.id,
      publicUserId: null,
      email: user.email,
      name: null,
      phone: null,
      birthDate: null,
      isAdmin: currentProfile.isAdmin || false,
      emailVerified: true,
      phoneVerified: false,
      registrationStep: 0,  // ✅ 重置為 0（需要重新填寫基本資料）
      referralCode: null,
      referredByCode: null,
      referredByUserId: null,
      referredByListingId: null,
      createdAt: currentProfile.createdAt || toTaiwanISOString(getTaiwanNow()),
      updatedAt: toTaiwanISOString(getTaiwanNow()),
    };

    // 4. 儲存重置後的 profile
    await kv.set(profileKey, resetProfile);
    console.log(`[resetRegistration] ✅ Profile reset to step 0 for user: ${user.id}`);

    return c.json({
      success: true,
      message: "註冊狀態已重置，可以重新填寫資料",
      profile: resetProfile
    });

  } catch (error) {
    console.error("[resetRegistration] Unexpected error:", error);
    return c.json({ error: { message: "Internal server error" } }, 500);
  }
};

/**
 * 更新會員資料
 * PUT /auth/profile
 */
export const updateUserProfile = async (c: Context) => {
  try {
    console.log('[updateUserProfile] Starting profile update...');
    
    // 1. 驗證 access token
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      console.error('[updateUserProfile] No Authorization header');
      return c.json({ error: "Authorization header is required" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    console.log('[updateUserProfile] Verifying token...');
    const { user, error: authError } = await verifyToken(token);

    if (authError || !user) {
      console.error("[updateUserProfile] Auth error:", authError);
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`[updateUserProfile] Authenticated user: ${user.id}, email: ${user.email}`);

    // 2. 取得更新資料
    const { name, phone, registrationStep } = await c.req.json();
    console.log(`[updateUserProfile] Update data - name: ${name}, phone: ${phone}, registrationStep: ${registrationStep}`);

    // 3. 驗證必填欄位
    if (!name || !phone) {
      console.error('[updateUserProfile] Missing required fields');
      return c.json({ error: "Name and phone are required" }, 400);
    }

    // 4. 驗證姓名長度
    if (name.length < 2 || name.length > 10) {
      console.error(`[updateUserProfile] Invalid name length: ${name.length}`);
      return c.json({ error: "姓名需介於 2-10 個字元" }, 400);
    }

    // 5. 驗證手機號碼格式
    if (!/^09\d{8}$/.test(phone)) {
      console.error(`[updateUserProfile] Invalid phone format: ${phone}`);
      return c.json({ error: "手機號碼格式不正確（格式：09XXXXXXXX）" }, 400);
    }

    // 6. 檢查手機號碼是否被其他用戶使用
    try {
      const allUsers = await kv.getByPrefix("user:");
      const phoneExists = allUsers.some((u: any) => u.phone === phone && u.id !== user.id);
      if (phoneExists) {
        console.error(`[updateUserProfile] Phone number already exists: ${phone}`);
        return c.json({ error: "此手機號碼已被其他用戶使用" }, 400);
      }
      console.log('[updateUserProfile] Phone number is available');
    } catch (kvError) {
      console.log("[updateUserProfile] KV Store error when checking phone:", kvError);
    }

    // 7. 從 KV Store 取得現有資料
    let existingProfile = null;
    try {
      existingProfile = await kv.get(`user:${user.id}:profile`);
      console.log(`[updateUserProfile] Existing profile found: ${existingProfile ? 'YES' : 'NO'}`);
    } catch (kvError) {
      console.error("[updateUserProfile] Error getting existing profile:", kvError);
      return c.json({ error: "無法取得用戶資料" }, 500);
    }

    if (!existingProfile) {
      console.error('[updateUserProfile] Profile not found');
      return c.json({ error: "用戶資料不存在" }, 404);
    }

    // 8. 更新資料（保留其他欄位）
    const updatedProfile = {
      ...existingProfile,
      name,
      phone,
      updatedAt: toTaiwanISOString(getTaiwanNow()),
    };
    
    // ✅ 如果前端传入了 registrationStep，也更新它
    if (registrationStep !== undefined && registrationStep !== null) {
      updatedProfile.registrationStep = registrationStep;
      console.log(`[updateUserProfile] ✅ Updating registrationStep to: ${registrationStep}`);
    }

    console.log('[updateUserProfile] Saving updated profile to KV Store...');
    try {
      await kv.set(`user:${user.id}:profile`, updatedProfile);
      console.log(`[updateUserProfile] ✅ Updated user:${user.id} in KV Store`);
      
      // 驗證保存是否成功
      const savedProfile = await kv.get(`user:${user.id}:profile`);
      if (savedProfile) {
        console.log(`[updateUserProfile] ✅ Verification: Profile updated successfully`);
      } else {
        console.error(`[updateUserProfile] ❌ Verification FAILED: Profile not found after update!`);
      }
    } catch (kvError) {
      console.error("[updateUserProfile] ❌ Error saving to KV Store:", kvError);
      return c.json({ error: "無法更新用戶資料，請稍後再試" }, 500);
    }

    console.log('[updateUserProfile] Returning updated profile to client...');
    return c.json(updatedProfile);
  } catch (error) {
    console.error("[updateUserProfile] Unexpected error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};

/**
 * 取消註冊（刪除未完成的用戶帳號）
 * DELETE /auth/cancel-signup
 */
export const cancelSignup = async (c: Context) => {
  try {
    console.log('[cancelSignup] User canceling signup...');
    
    // 1. 驗證 access token
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      console.error('[cancelSignup] No Authorization header');
      return c.json({ error: "Authorization header is required" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    console.log('[cancelSignup] Verifying token...');
    const { user, error: authError } = await verifyToken(token);

    if (authError || !user) {
      console.error("[cancelSignup] Auth error:", authError);
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`[cancelSignup] Authenticated user: ${user.id}, email: ${user.email}`);

    // 2. 刪除 KV Store 中的記錄（如果有）
    try {
      const profile = await kv.get(`user:${user.id}:profile`);
      if (profile) {
        await kv.del(`user:${user.id}:profile`);
        await kv.del(`user:email:${user.email}`);
        console.log(`[cancelSignup] ✅ Deleted KV Store records for user: ${user.id}`);
      } else {
        console.log(`[cancelSignup] No profile found in KV Store for user: ${user.id}`);
      }
    } catch (kvError) {
      console.log("[cancelSignup] KV Store error when deleting profile:", kvError);
      // 繼續刪除 Auth 用戶，即使 KV Store 刪除失敗
    }

    // 3. 刪除 Supabase Auth 用戶
    try {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteError) {
        console.error("[cancelSignup] Error deleting user from Auth:", deleteError);
        return c.json({ error: "無法刪除用戶帳號" }, 500);
      }
      console.log(`[cancelSignup] ✅ Deleted user from Auth: ${user.id}`);
    } catch (deleteError) {
      console.error("[cancelSignup] Exception when deleting user:", deleteError);
      return c.json({ error: "無法刪除用戶帳號" }, 500);
    }

    console.log(`[cancelSignup] ✅ User signup canceled successfully: ${user.id}`);
    return c.json({ message: "帳號已成功刪除" });
  } catch (error) {
    console.error("[cancelSignup] Unexpected error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};

/**
 * 重置到付款步驟（從 Step 2 回到 Step 1）
 * POST /auth/reset-to-payment
 * 
 * 使用場景：付款失敗後，用戶點擊「重新付款」
 */
export const resetToPayment = async (c: Context) => {
  try {
    console.log('[resetToPayment] Resetting user to payment step...');
    
    // 1. 驗證 access token
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      console.error('[resetToPayment] No Authorization header');
      return c.json({ error: "Authorization header is required" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    console.log('[resetToPayment] Verifying token...');
    const { user, error: authError } = await verifyToken(token);

    if (authError || !user) {
      console.error("[resetToPayment] Auth error:", authError);
      return c.json({ error: "Unauthorized" }, 401);
    }

    console.log(`[resetToPayment] Authenticated user: ${user.id}, email: ${user.email}`);

    // 2. 獲取用戶 profile
    const profileKey = `user:${user.id}:profile`;
    const profile = await kv.get(profileKey);
    
    if (!profile) {
      console.error(`[resetToPayment] Profile not found for user: ${user.id}`);
      return c.json({ error: "用戶資料不存在" }, 404);
    }

    // 3. 檢查當前步驟
    console.log(`[resetToPayment] Current step: ${profile.registrationStep}`);
    
    // 只允許從 Step 2 重置到 Step 1
    if (profile.registrationStep !== 2) {
      console.warn(`[resetToPayment] User is not at Step 2, current step: ${profile.registrationStep}`);
      return c.json({ 
        error: "只能在付款結果頁面重置付款狀態",
        currentStep: profile.registrationStep 
      }, 400);
    }

    // 4. 重置到 Step 1
    profile.registrationStep = 1;
    profile.pendingActivation = false;
    profile.paidAt = null;
    profile.periodTradeNo = null;
    profile.updatedAt = toTaiwanISOString(getTaiwanNow());
    
    await kv.set(profileKey, profile);
    
    console.log(`[resetToPayment] ✅ User reset to Step 1: ${user.id}`);
    
    return c.json({
      success: true,
      message: "已重置到付款步驟",
      profile: {
        registrationStep: profile.registrationStep,
        pendingActivation: profile.pendingActivation
      }
    });

  } catch (error) {
    console.error("[resetToPayment] Unexpected error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
};