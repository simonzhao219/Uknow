import { describe, it, expect } from 'vitest';
import { getInputErrorClass, getInputAriaProps } from './formHelpers';

describe('getInputErrorClass', () => {
  it('returns the destructive classes when there is an error', () => {
    expect(getInputErrorClass(true)).toBe('border-destructive focus-visible:ring-destructive');
  });

  it('returns an empty string when there is no error', () => {
    expect(getInputErrorClass(false)).toBe('');
  });
});

describe('getInputAriaProps', () => {
  it('marks the field invalid and points aria-describedby at the error node', () => {
    expect(getInputAriaProps('email', 'bad email')).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'email-error',
      'aria-required': true,
    });
  });

  it('omits invalid / describedby when there is no error', () => {
    expect(getInputAriaProps('email')).toEqual({
      'aria-invalid': undefined,
      'aria-describedby': undefined,
      'aria-required': true,
    });
  });
});
