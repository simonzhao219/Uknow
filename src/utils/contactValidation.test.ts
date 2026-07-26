import { describe, it, expect } from 'vitest';
import {
  validateInstagram,
  validateLineId,
  validateFacebook,
  validateContacts,
} from './contactValidation';

describe('validateInstagram', () => {
  it('空字串與純空白視為「未填」（null）', () => {
    expect(validateInstagram('')).toBeNull();
    expect(validateInstagram('   ')).toBeNull();
  });

  it('去掉開頭單一個 @ 後接受其餘部分', () => {
    expect(validateInstagram('@amy_hair')).toBeNull();
    expect(validateInstagram('amy_hair')).toBeNull();
  });

  it('接受英數字、底線與點', () => {
    expect(validateInstagram('a.b_c1')).toBeNull();
  });

  it('長度邊界：1 與 30 通過、31 被拒', () => {
    expect(validateInstagram('a')).toBeNull();
    expect(validateInstagram('a'.repeat(30))).toBeNull();
    expect(validateInstagram('a'.repeat(31))).not.toBeNull();
  });

  it('只有 "@" 被拒（去除後為空）', () => {
    expect(validateInstagram('@')).not.toBeNull();
  });

  it('開頭、結尾的點與連續點被拒', () => {
    expect(validateInstagram('.name')).not.toBeNull();
    expect(validateInstagram('name.')).not.toBeNull();
    expect(validateInstagram('na..me')).not.toBeNull();
  });

  it('連字號與其他不允許字元被拒', () => {
    expect(validateInstagram('na-me')).not.toBeNull();
    expect(validateInstagram('na me')).not.toBeNull();
  });
});

describe('validateLineId', () => {
  it('空字串與純空白視為 null', () => {
    expect(validateLineId('')).toBeNull();
    expect(validateLineId('   ')).toBeNull();
  });

  it('接受英數字、底線、點與連字號', () => {
    expect(validateLineId('abc_1.2-3')).toBeNull();
  });

  it('長度邊界：4 與 20 通過、3 與 21 被拒', () => {
    expect(validateLineId('abc')).not.toBeNull();
    expect(validateLineId('abcd')).toBeNull();
    expect(validateLineId('a'.repeat(20))).toBeNull();
    expect(validateLineId('a'.repeat(21))).not.toBeNull();
  });

  it('第一個字元必須是英文字母或數字', () => {
    expect(validateLineId('_abcd')).not.toBeNull();
    expect(validateLineId('.abcd')).not.toBeNull();
    expect(validateLineId('-abcd')).not.toBeNull();
    expect(validateLineId('1abcd')).toBeNull();
  });

  it('空白與不允許字元被拒', () => {
    expect(validateLineId('ab cd')).not.toBeNull();
  });
});

describe('validateFacebook', () => {
  it('空字串與純空白視為 null', () => {
    expect(validateFacebook('')).toBeNull();
    expect(validateFacebook('   ')).toBeNull();
  });

  it('接受純英數字與點組成的使用者名稱', () => {
    expect(validateFacebook('john.doe')).toBeNull();
  });

  it('從完整網址取出使用者名稱', () => {
    expect(validateFacebook('https://facebook.com/john.doe')).toBeNull();
    expect(validateFacebook('www.fb.com/john.doe')).toBeNull();
  });

  it('網址取出的使用者名稱過短時被拒', () => {
    // "ab" is only 2 chars → below the 5-char minimum
    expect(validateFacebook('http://facebook.com/ab')).not.toBeNull();
  });

  it('網址只擷取到第一個非使用者名稱字元為止', () => {
    // regex stops at "?"; "john" is 4 chars → invalid
    expect(validateFacebook('facebook.com/john?ref=1')).not.toBeNull();
  });

  it('長度邊界：5 與 50 通過、4 與 51 被拒', () => {
    expect(validateFacebook('abcd')).not.toBeNull();
    expect(validateFacebook('abcde')).toBeNull();
    expect(validateFacebook('a'.repeat(50))).toBeNull();
    expect(validateFacebook('a'.repeat(51))).not.toBeNull();
  });

  it('底線與連字號被拒（與 Instagram／LINE 規則不同）', () => {
    expect(validateFacebook('john_doe')).not.toBeNull();
    expect(validateFacebook('john-doe')).not.toBeNull();
  });
});

describe('validateContacts', () => {
  it('至少要填一個聯絡方式，全空時短路回報', () => {
    const errors = validateContacts({ instagram: '', line: '', facebook: '' });
    expect(errors).toEqual({ contacts: '請至少填寫一種聯絡方式' });
  });

  it('填了一個合法聯絡方式即無錯誤', () => {
    const errors = validateContacts({ instagram: 'amy_hair', line: '', facebook: '' });
    expect(errors).toEqual({});
  });

  it('其他欄位為空時只回報不合法的那一欄', () => {
    const errors = validateContacts({ instagram: 'na..me', line: '', facebook: '' });
    expect(Object.keys(errors)).toEqual(['instagram']);
  });

  it('每個不合法欄位各自回報', () => {
    const errors = validateContacts({ instagram: 'na..me', line: 'ab', facebook: 'a_b' });
    expect(errors).toHaveProperty('instagram');
    expect(errors).toHaveProperty('line');
    expect(errors).toHaveProperty('facebook');
    expect(errors).not.toHaveProperty('contacts');
  });

  it('已填一個聯絡方式後，其餘空欄不再標錯', () => {
    // line is valid; empty instagram/facebook must not produce errors
    const errors = validateContacts({ instagram: '', line: 'valid_id', facebook: '' });
    expect(errors).toEqual({});
  });
});
