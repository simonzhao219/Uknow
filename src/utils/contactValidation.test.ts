import { describe, it, expect } from 'vitest';
import {
  validateInstagram,
  validateLineId,
  validateFacebook,
  validateContacts,
} from './contactValidation';

describe('validateInstagram', () => {
  it('treats empty / whitespace-only as "not filled" (null)', () => {
    expect(validateInstagram('')).toBeNull();
    expect(validateInstagram('   ')).toBeNull();
  });

  it('strips a single leading @ and accepts the remainder', () => {
    expect(validateInstagram('@amy_hair')).toBeNull();
    expect(validateInstagram('amy_hair')).toBeNull();
  });

  it('accepts letters, digits, underscore and dot', () => {
    expect(validateInstagram('a.b_c1')).toBeNull();
  });

  it('accepts boundary lengths 1 and 30, rejects 31', () => {
    expect(validateInstagram('a')).toBeNull();
    expect(validateInstagram('a'.repeat(30))).toBeNull();
    expect(validateInstagram('a'.repeat(31))).not.toBeNull();
  });

  it('rejects a value that is only "@" (empty after stripping)', () => {
    expect(validateInstagram('@')).not.toBeNull();
  });

  it('rejects leading / trailing dot and consecutive dots', () => {
    expect(validateInstagram('.name')).not.toBeNull();
    expect(validateInstagram('name.')).not.toBeNull();
    expect(validateInstagram('na..me')).not.toBeNull();
  });

  it('rejects hyphen and other disallowed characters', () => {
    expect(validateInstagram('na-me')).not.toBeNull();
    expect(validateInstagram('na me')).not.toBeNull();
  });
});

describe('validateLineId', () => {
  it('treats empty / whitespace-only as null', () => {
    expect(validateLineId('')).toBeNull();
    expect(validateLineId('   ')).toBeNull();
  });

  it('accepts letters, digits, underscore, dot and hyphen', () => {
    expect(validateLineId('abc_1.2-3')).toBeNull();
  });

  it('accepts boundary lengths 4 and 20, rejects 3 and 21', () => {
    expect(validateLineId('abc')).not.toBeNull();
    expect(validateLineId('abcd')).toBeNull();
    expect(validateLineId('a'.repeat(20))).toBeNull();
    expect(validateLineId('a'.repeat(21))).not.toBeNull();
  });

  it('requires the first character to be a letter or digit', () => {
    expect(validateLineId('_abcd')).not.toBeNull();
    expect(validateLineId('.abcd')).not.toBeNull();
    expect(validateLineId('-abcd')).not.toBeNull();
    expect(validateLineId('1abcd')).toBeNull();
  });

  it('rejects spaces / disallowed characters', () => {
    expect(validateLineId('ab cd')).not.toBeNull();
  });
});

describe('validateFacebook', () => {
  it('treats empty / whitespace-only as null', () => {
    expect(validateFacebook('')).toBeNull();
    expect(validateFacebook('   ')).toBeNull();
  });

  it('accepts a plain username of letters, digits and dots', () => {
    expect(validateFacebook('john.doe')).toBeNull();
  });

  it('extracts the username from a full URL', () => {
    expect(validateFacebook('https://facebook.com/john.doe')).toBeNull();
    expect(validateFacebook('www.fb.com/john.doe')).toBeNull();
  });

  it('rejects a URL whose extracted username is too short', () => {
    // "ab" is only 2 chars → below the 5-char minimum
    expect(validateFacebook('http://facebook.com/ab')).not.toBeNull();
  });

  it('captures only up to the first non-username char in a URL', () => {
    // regex stops at "?"; "john" is 4 chars → invalid
    expect(validateFacebook('facebook.com/john?ref=1')).not.toBeNull();
  });

  it('accepts boundary lengths 5 and 50, rejects 4 and 51', () => {
    expect(validateFacebook('abcd')).not.toBeNull();
    expect(validateFacebook('abcde')).toBeNull();
    expect(validateFacebook('a'.repeat(50))).toBeNull();
    expect(validateFacebook('a'.repeat(51))).not.toBeNull();
  });

  it('rejects underscore and hyphen (unlike Instagram / LINE)', () => {
    expect(validateFacebook('john_doe')).not.toBeNull();
    expect(validateFacebook('john-doe')).not.toBeNull();
  });
});

describe('validateContacts', () => {
  it('requires at least one contact and short-circuits when all empty', () => {
    const errors = validateContacts({ instagram: '', line: '', facebook: '' });
    expect(errors).toEqual({ contacts: '請至少填寫一種聯絡方式' });
  });

  it('returns no errors when one valid contact is filled', () => {
    const errors = validateContacts({ instagram: 'amy_hair', line: '', facebook: '' });
    expect(errors).toEqual({});
  });

  it('reports only the invalid field when others are empty', () => {
    const errors = validateContacts({ instagram: 'na..me', line: '', facebook: '' });
    expect(Object.keys(errors)).toEqual(['instagram']);
  });

  it('reports each invalid field independently', () => {
    const errors = validateContacts({ instagram: 'na..me', line: 'ab', facebook: 'a_b' });
    expect(errors).toHaveProperty('instagram');
    expect(errors).toHaveProperty('line');
    expect(errors).toHaveProperty('facebook');
    expect(errors).not.toHaveProperty('contacts');
  });

  it('does not flag empty siblings once one contact is provided', () => {
    // line is valid; empty instagram/facebook must not produce errors
    const errors = validateContacts({ instagram: '', line: 'valid_id', facebook: '' });
    expect(errors).toEqual({});
  });
});
