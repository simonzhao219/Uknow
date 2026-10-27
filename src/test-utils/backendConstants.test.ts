import { describe, expect, it } from 'vitest';
import { readBackendConstant, readPurgeDefaultDays } from './backendConstants';

describe('readBackendConstant', () => {
  it('讀得到乘式常數的數值', () => {
    expect(readBackendConstant('REFERRAL_INVITE_TARGET_WINDOW_SECONDS')).toBe(24 * 60 * 60);
    expect(readBackendConstant('REFERRAL_INVITE_RATE_MAX')).toBe(5);
  });

  it('抽不到常數時拋錯而不是回 undefined', () => {
    expect(() => readBackendConstant('NO_SUCH_CONSTANT')).toThrow(/找不到/);
  });

  it('寫法不是數字乘式時抽不到並拋錯', () => {
    expect(() => readBackendConstant('X', 'export const X = Number(Deno.env.get("X"));')).toThrow();
  });
});

describe('readPurgeDefaultDays', () => {
  it('讀得到 purge 預設天數', () => {
    expect(readPurgeDefaultDays()).toBe(7);
  });

  it('找不到預設值時拋錯', () => {
    expect(() => readPurgeDefaultDays('create function x()')).toThrow(/找不到/);
  });
});
