import { describe, it, expect } from 'vitest';
import {
  describePasswordRequirements,
  validatePasswordPolicy,
} from './passwordPolicy';

describe('describePasswordRequirements — 逐條列出缺少的規則', () => {
  it('完全合格的密碼回傳空陣列', () => {
    expect(describePasswordRequirements('Passw0rd')).toEqual([]);
  });

  it('太短（7 碼但含大小寫數字）只缺長度', () => {
    expect(describePasswordRequirements('short1A')).toEqual(['至少 8 個字元']);
  });

  it('剛好 8 碼是長度邊界的合格側', () => {
    // 8 碼、含大小寫數字 → 全通過
    expect(describePasswordRequirements('Abcdefg1')).toEqual([]);
  });

  it('缺大寫', () => {
    expect(describePasswordRequirements('alllower1')).toEqual([
      '至少一個大寫字母（A-Z）',
    ]);
  });

  it('缺小寫', () => {
    expect(describePasswordRequirements('ALLUPPER1')).toEqual([
      '至少一個小寫字母（a-z）',
    ]);
  });

  it('缺數字', () => {
    expect(describePasswordRequirements('NoDigitsX')).toEqual([
      '至少一個數字（0-9）',
    ]);
  });

  it('多項同時缺失時全部列出（順序固定）', () => {
    // "abc" → 太短、缺大寫、缺數字
    expect(describePasswordRequirements('abc')).toEqual([
      '至少 8 個字元',
      '至少一個大寫字母（A-Z）',
      '至少一個數字（0-9）',
    ]);
  });
});

describe('validatePasswordPolicy — 註冊 / 重設共用（requireConfirmation 預設 true）', () => {
  it('合格且兩次一致 → 無錯誤', () => {
    expect(validatePasswordPolicy('Passw0rd!', 'Passw0rd!')).toEqual({});
  });

  it('空密碼 → 提示請輸入', () => {
    expect(validatePasswordPolicy('', '')).toEqual({
      password: '請輸入密碼',
      confirmPassword: '請再次輸入密碼以確認',
    });
  });

  it('政策不合格 → password 欄位帶「密碼需包含」前綴', () => {
    const errors = validatePasswordPolicy('short', 'short');
    expect(errors.password).toContain('密碼需包含');
    expect(errors.password).toContain('至少 8 個字元');
  });

  it('兩次不一致 → confirmPassword 報錯', () => {
    const errors = validatePasswordPolicy('Passw0rd!', 'Passw0rd?');
    expect(errors.password).toBeUndefined();
    expect(errors.confirmPassword).toBe('兩次輸入的密碼不一致，請重新確認');
  });

  it('確認密碼留空 → 要求再次輸入', () => {
    const errors = validatePasswordPolicy('Passw0rd!', '');
    expect(errors.confirmPassword).toBe('請再次輸入密碼以確認');
  });
});

describe('validatePasswordPolicy — requireConfirmation: false（僅檢查密碼本身）', () => {
  it('不一致也不報 confirm 錯誤', () => {
    const errors = validatePasswordPolicy('Passw0rd!', 'anything', {
      requireConfirmation: false,
    });
    expect(errors).toEqual({});
  });

  it('仍會檢查密碼政策本身', () => {
    const errors = validatePasswordPolicy('short', '', {
      requireConfirmation: false,
    });
    expect(errors.password).toContain('密碼需包含');
    expect(errors.confirmPassword).toBeUndefined();
  });
});
