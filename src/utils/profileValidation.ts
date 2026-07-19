// 完善資料（CompleteProfile）表單的驗證邏輯 —— 抽成純函式的「單一決策來源」。
//
// 為什麼獨立成一支：原本驗證寫在 component 裡，既不能單獨測試，也讓「按鈕該不該
// 反灰」和「錯誤訊息長怎樣」兩件事糊在一起。抽成純函式後：
//   1. 可用 vitest 直接釘死每條規則（本專案測試環境為 node、純函式取向）。
//   2. UI 只負責「呈現」錯誤，不再自己算規則，避免兩處邏輯漂移。
//
// 每條錯誤訊息都盡量「說出為什麼」，讓使用者不會對著看似填好的欄位卻卡住。

export interface ProfileFormValues {
  name: string;
  nationalId: string;
  phone: string;
  birthDate: string; // 'YYYY-MM-DD'
  agreedToTerms: boolean;
}

export type ProfileErrors = Partial<Record<keyof ProfileFormValues, string>>;

export const MIN_AGE = 18;

export function validateName(name: string): string | undefined {
  if (!name.trim()) return '請輸入真實姓名';
  if (name.length > 10) return '姓名最多 10 個字元';
  return undefined;
}

export function validateNationalId(rawId: string): string | undefined {
  const id = rawId.trim().toUpperCase();
  if (!id) return '請輸入身分證字號';
  if (!/^[A-Z]/.test(id)) return '身分證字號需以一個英文字母開頭（例：A123456789）';
  // 明確指出第 2 碼規則 —— 這正是「Q777777777」這類值會靜默卡住的地方。
  if (!/^[A-Z][12]/.test(id)) return '第 2 碼需為 1（男）或 2（女），例：A123456789';
  if (!/^[A-Z][12]\d{8}$/.test(id)) return '身分證字號需為 1 碼英文字母加 9 碼數字（例：A123456789）';
  return undefined;
}

export function validatePhone(phone: string): string | undefined {
  if (!phone.trim()) return '請輸入手機號碼';
  if (!/^09\d{8}$/.test(phone)) return '手機號碼格式不正確（格式：09XXXXXXXX）';
  return undefined;
}

// now 以參數注入，讓「剛好滿 18 歲」等邊界能被測試釘死，也避免測試依賴系統時鐘。
export function validateBirthDate(birthDate: string, now: Date = new Date()): string | undefined {
  if (!birthDate) return '請選擇出生年月日';
  const parts = birthDate.split('-').map(Number);
  const [by, bm, bd] = parts;
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return '請選擇出生年月日';
  }
  // 以本地日期元件比對，避免 new Date('YYYY-MM-DD') 被當成 UTC 午夜、
  // 在負時區出現差一天而誤判年齡。
  let age = now.getFullYear() - by;
  const monthDiff = now.getMonth() + 1 - bm;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < bd)) {
    age--;
  }
  if (age < MIN_AGE) return `註冊用戶需年滿 ${MIN_AGE} 歲`;
  return undefined;
}

export function validateAgreedToTerms(agreed: boolean): string | undefined {
  if (!agreed) return '請同意服務條款';
  return undefined;
}

// 回傳所有「有問題」欄位的錯誤 map；空物件代表整張表單合法。
export function validateProfileForm(values: ProfileFormValues, now: Date = new Date()): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = validateName(values.name);
  if (name) errors.name = name;
  const nationalId = validateNationalId(values.nationalId);
  if (nationalId) errors.nationalId = nationalId;
  const phone = validatePhone(values.phone);
  if (phone) errors.phone = phone;
  const birthDate = validateBirthDate(values.birthDate, now);
  if (birthDate) errors.birthDate = birthDate;
  const agreedToTerms = validateAgreedToTerms(values.agreedToTerms);
  if (agreedToTerms) errors.agreedToTerms = agreedToTerms;
  return errors;
}
