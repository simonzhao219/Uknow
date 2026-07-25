import { describe, it, expect } from 'vitest';
import { getInputErrorClass, getInputAriaProps } from './formHelpers';

describe('getInputErrorClass', () => {
  it('有錯誤時回傳 destructive 樣式類別', () => {
    expect(getInputErrorClass(true)).toBe('border-destructive focus-visible:ring-destructive');
  });

  it('無錯誤時回傳空字串', () => {
    expect(getInputErrorClass(false)).toBe('');
  });
});

describe('getInputAriaProps', () => {
  it('標記欄位 invalid 並讓 aria-describedby 指向錯誤節點', () => {
    expect(getInputAriaProps('email', 'bad email')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'email-error',
      'aria-required': true,
    });
  });

  it('無錯誤時不輸出 invalid 與 describedby', () => {
    expect(getInputAriaProps('email')).toEqual({
      'aria-invalid': undefined,
      'aria-describedby': undefined,
      'aria-required': true,
    });
  });
});
