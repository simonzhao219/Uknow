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
  it('accepts a well-formed ID', () => {
    expect(validateNationalId('A123456789')).toBeUndefined();
    expect(validateNationalId('B234567890')).toBeUndefined();
  });

  it('lower-cases input is normalised before checking', () => {
    expect(validateNationalId('a123456789')).toBeUndefined();
  });

  it('rejects the screenshot value Q777777777 with a message that explains the 2nd digit', () => {
    // 這正是使用者遇到的值：第 2 碼是 7，不是 1/2 —— 舊版讓按鈕靜默反灰。
    const err = validateNationalId('Q777777777');
    expect(err).toBeDefined();
    expect(err).toContain('第 2 碼');
  });

  it('rejects a missing leading letter', () => {
    expect(validateNationalId('1123456789')).toContain('英文字母開頭');
  });

  it('rejects wrong length', () => {
    expect(validateNationalId('A12345678')).toBeDefined();
    expect(validateNationalId('A1234567890')).toBeDefined();
  });

  it('rejects empty', () => {
    expect(validateNationalId('')).toBe('請輸入身分證字號');
    expect(validateNationalId('   ')).toBe('請輸入身分證字號');
  });
});

describe('validateName', () => {
  it('accepts a normal name', () => {
    expect(validateName('Simon7')).toBeUndefined();
  });
  it('rejects empty', () => {
    expect(validateName('   ')).toBe('請輸入真實姓名');
  });
  it('rejects > 10 chars', () => {
    expect(validateName('01234567890')).toBe('姓名最多 10 個字元');
  });
});

describe('validatePhone', () => {
  it('accepts a valid TW mobile', () => {
    expect(validatePhone('0933333333')).toBeUndefined();
  });
  it('rejects non-09 prefix / wrong length', () => {
    expect(validatePhone('0812345678')).toBeDefined();
    expect(validatePhone('093333333')).toBeDefined();
  });
});

describe('validateBirthDate', () => {
  const now = new Date(2026, 6, 19); // 2026-07-19 (local)

  it('accepts someone who is exactly 18 today', () => {
    expect(validateBirthDate('2008-07-19', now)).toBeUndefined();
  });

  it('accepts the screenshot birthdate (turned 18 two days ago)', () => {
    expect(validateBirthDate('2008-07-17', now)).toBeUndefined();
  });

  it('rejects someone who turns 18 tomorrow', () => {
    expect(validateBirthDate('2008-07-20', now)).toBe('註冊用戶需年滿 18 歲');
  });

  it('is timezone-safe at the day boundary (no off-by-one)', () => {
    // 若用 new Date('2008-07-19') 在 UTC- 時區會偏一天；用日期元件比對則穩定。
    expect(validateBirthDate('2008-07-19', now)).toBeUndefined();
  });

  it('rejects empty or malformed', () => {
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

  it('returns no errors for a fully valid form', () => {
    expect(validateProfileForm(valid, now)).toEqual({});
  });

  it('surfaces the national-id error for the exact screenshot scenario', () => {
    // 全部欄位都填了、條款也勾了，唯一擋住的是身分證第 2 碼。
    const errors = validateProfileForm({ ...valid, nationalId: 'Q777777777' }, now);
    expect(Object.keys(errors)).toEqual(['nationalId']);
    expect(errors.nationalId).toContain('第 2 碼');
  });

  it('flags every problem field at once', () => {
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
