// Supabase Auth 錯誤訊息翻譯工具
// 將 Supabase 回傳的英文錯誤翻成友善的中文提示，供註冊 / 重設密碼等流程共用。

type AuthErrorLike = {
  code?: string;
  message?: string;
} | null | undefined;

/**
 * 判斷是否為 Supabase「密碼已外洩 / 過弱」錯誤。
 * 觸發時機：後台開啟 Leaked Password Protection，密碼出現在外洩名單中。
 * 同時比對 error.code 與訊息關鍵字，較為穩健。
 */
export function isWeakPasswordError(error: AuthErrorLike): boolean {
  return (
    error?.code === 'weak_password' ||
    /known to be weak|easy to guess|pwned|leaked/i.test(error?.message ?? '')
  );
}

/**
 * 將 Supabase Auth 錯誤翻成友善的中文提示。
 * @param error    Supabase 回傳的錯誤物件
 * @param fallback 無對應規則時使用的通用提示（依流程不同而異）
 */
export function translateAuthError(error: AuthErrorLike, fallback = '操作失敗，請稍後再試。'): string {
  if (isWeakPasswordError(error)) {
    return '此密碼曾出現在資料外洩名單中，容易被猜到，請改用其他密碼。';
  }

  const message = error?.message ?? '';

  if (error?.code === 'user_already_exists' || /already registered|already exists/i.test(message)) {
    return '此電子郵件已經註冊過，請改用登入。';
  }
  if (error?.code === 'same_password' || /should be different from the old password/i.test(message)) {
    return '新密碼不可與舊密碼相同，請改用其他密碼。';
  }
  if (error?.code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
    return '操作過於頻繁，請稍後再試。';
  }
  if (/invalid.*email|email.*invalid/i.test(message)) {
    return '電子郵件格式不正確，請重新輸入。';
  }

  return fallback;
}
