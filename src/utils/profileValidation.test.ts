import { describe, it, expect } from 'vitest';
import {
  validateName,
  validateNationalId,
  validatePhone,
  validateBirthDate,
  validateProfileForm,
  type ProfileFormValues,
} from './profileValidation';

describe('validateNationalId', () => {
  it('格式正確的身分證字號通過', () => {
    expect(validateNationalId('A123456789')).toBeUndefined();
    expect(validateNationalId('B234567890')).toBeUndefined();
  });

  it('小寫輸入會先正規化再檢查', () => {
    expect(validateNationalId('a123456789')).toBeUndefined();
  });

  it('事故截圖的 Q777777777 被拒，且訊息說明第 2 碼規則', () => {
    // 這正是使用者遇到的值：第 2 碼是 7，不是 1/2 —— 舊版讓按鈕靜默反灰。
    const err = validateNationalId('Q777777777');
    expect(err).toBeDefined();
    expect(err).toContain('第 2 碼');
  });

  it('缺開頭英文字母被拒', () => {
    expect(validateNationalId('1123456789')).toContain('英文字母開頭');
  });

  it('長度不符被拒', () => {
    expect(validateNationalId('A12345678')).toBeDefined();
    expect(validateNationalId('A1234567890')).toBeDefined();
  });

  it('空值被拒', () => {
    expect(validateNationalId('')).toBe('請輸入身分證字號');
    expect(validateNationalId('   ')).toBe('請輸入身分證字號');
  });
});

describe('validateName', () => {
  it('一般姓名通過', () => {
    expect(validateName('Simon7')).toBeUndefined();
  });
  it('空值被拒', () => {
    expect(validateName('   ')).toBe('請輸入真實姓名');
  });
  it('超過 10 字被拒', () => {
    expect(validateName('01234567890')).toBe('姓名最多 10 個字元');
  });
});

describe('validatePhone', () => {
  it('合法台灣手機號碼通過', () => {
    expect(validatePhone('0933333333')).toBeUndefined();
  });
  it('非 09 開頭或長度不符被拒', () => {
    expect(validatePhone('0812345678')).toBeDefined();
    expect(validatePhone('093333333')).toBeDefined();
  });
});

describe('validateBirthDate', () => {
  const now = new Date(2026, 6, 19); // 2026-07-19 (local)

  it('今天剛滿 18 歲通過', () => {
    expect(validateBirthDate('2008-07-19', now)).toBeUndefined();
  });

  it('事故截圖的生日通過（兩天前滿 18）', () => {
    expect(validateBirthDate('2008-07-17', now)).toBeUndefined();
  });

  it('明天才滿 18 歲被拒', () => {
    expect(validateBirthDate('2008-07-20', now)).toBe('註冊用戶需年滿 18 歲');
  });

  it('日界線上不受時區影響（無 off-by-one）', () => {
    // 若用 new Date('2008-07-19') 在 UTC- 時區會偏一天；用日期元件比對則穩定。
    expect(validateBirthDate('2008-07-19', now)).toBeUndefined();
  });

  it('空值或格式錯誤被拒', () => {
    expect(validateBirthDate('', now)).toBe('請選擇出生年月日');
    expect(validateBirthDate('not-a-date', now)).toBe('請選擇出生年月日');
  });
});

describe('validateProfileForm', () => {
  const now = new Date(2026, 6, 19);
  const valid: ProfileFormValues = {
    name: 'Simon7',
    nationalId: 'A123456789',
    phone: '0933333333',
    birthDate: '2008-07-17',
    agreedToTerms: true,
  };

  it('完全合法的表單無錯誤', () => {
    expect(validateProfileForm(valid, now)).toEqual({});
  });

  it('重現事故截圖情境時回報身分證字號錯誤', () => {
    // 全部欄位都填了、條款也勾了，唯一擋住的是身分證第 2 碼。
    const errors = validateProfileForm({ ...valid, nationalId: 'Q777777777' }, now);
    expect(Object.keys(errors)).toEqual(['nationalId']);
    expect(errors.nationalId).toContain('第 2 碼');
  });

  it('一次標出所有有問題的欄位', () => {
    const errors = validateProfileForm(
      { name: '', nationalId: 'x', phone: '123', birthDate: '', agreedToTerms: false },
      now,
    );
    expect(errors.name).toBeDefined();
    expect(errors.nationalId).toBeDefined();
    expect(errors.phone).toBeDefined();
    expect(errors.birthDate).toBeDefined();
    expect(errors.agreedToTerms).toBeDefined();
  });
});
