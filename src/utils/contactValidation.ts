// 聯絡方式格式驗證工具

/**
 * 驗證 Instagram ID
 * 規則：
 * - 只能包含字母、數字、底線、點號
 * - 長度 1-30 個字符
 * - 不能以點號開頭或結尾
 * - 不能有連續的點號
 */
export function validateInstagram(value: string): string | null {
  if (!value.trim()) return null; // 空值不驗證（因為至少要填一個）
  
  // 移除可能的 @ 符號
  const cleanValue = value.replace(/^@/, '');
  
  // 統一錯誤格式：簡潔版
  if (cleanValue.length < 1 || cleanValue.length > 30 || 
      !/^[a-zA-Z0-9._]+$/.test(cleanValue) ||
      cleanValue.startsWith('.') || cleanValue.endsWith('.') ||
      /\.\./.test(cleanValue)) {
    return '格式錯誤，允許1-30字符（字母、數字、底線、點號）';
  }
  
  return null;
}

/**
 * 驗證 LINE ID
 * 規則：
 * - 只能包含字母、數字、底線、點號、連字號
 * - 長度 4-20 個字符
 * - 第一個字符必須是字母或數字
 */
export function validateLineId(value: string): string | null {
  if (!value.trim()) return null; // 空值不驗證
  
  const cleanValue = value.trim();
  
  // 統一錯誤格式：簡潔版
  if (cleanValue.length < 4 || cleanValue.length > 20 ||
      !/^[a-zA-Z0-9]/.test(cleanValue) ||
      !/^[a-zA-Z0-9._-]+$/.test(cleanValue)) {
    return '格式錯誤，允許4-20字符（字母、數字、底線、點號、連字號）';
  }
  
  return null;
}

/**
 * 驗證 Facebook 專頁名稱或用戶名
 * 規則：
 * - 可以是完整的 Facebook URL 或用戶名
 * - 用戶名：只能包含字母、數字、點號
 * - 長度 5-50 個字符
 */
export function validateFacebook(value: string): string | null {
  if (!value.trim()) return null; // 空值不驗證
  
  const cleanValue = value.trim();
  
  // 如果是完整的 URL，提取用戶名
  const urlPattern = /^(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\/([a-zA-Z0-9.]+)/;
  const urlMatch = cleanValue.match(urlPattern);
  
  const username = urlMatch ? urlMatch[1] : cleanValue;
  
  // 統一錯誤格式：簡潔版
  if (username.length < 5 || username.length > 50 ||
      !/^[a-zA-Z0-9.]+$/.test(username)) {
    return '格式錯誤，允許5-50字符（字母、數字、點號）';
  }
  
  return null;
}

/**
 * 驗證所有聯絡方式
 * 返回錯誤對象
 */
export function validateContacts(contacts: {
  instagram: string;
  line: string;
  facebook: string;
}): { [key: string]: string } {
  const errors: { [key: string]: string } = {};
  
  // 檢查至少有一個聯絡方式
  const hasAnyContact = Object.values(contacts).some(c => c.trim());
  if (!hasAnyContact) {
    errors.contacts = '請至少填寫一種聯絡方式';
    return errors;
  }
  
  // 驗證每個聯絡方式的格式
  const instagramError = validateInstagram(contacts.instagram);
  if (instagramError) {
    errors.instagram = instagramError;
  }
  
  const lineError = validateLineId(contacts.line);
  if (lineError) {
    errors.line = lineError;
  }
  
  const facebookError = validateFacebook(contacts.facebook);
  if (facebookError) {
    errors.facebook = facebookError;
  }
  
  return errors;
}