// @vitest-environment jsdom
//
// 登出與換帳號時清本機「屬於某個帳號」的狀態（R3 §1.3 P2-2、P2-3）。
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAccountLocalState } from './clearAccountLocalState';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('clearAccountLocalState', () => {
  it('清掉提領銀行帳號、待付款個資與升版前殘留鍵', () => {
    for (const k of ['withdrawalBankData', 'pendingUser', 'user', 'pendingSession']) {
      localStorage.setItem(k, '{"x":1}');
    }
    clearAccountLocalState();
    for (const k of ['withdrawalBankData', 'pendingUser', 'user', 'pendingSession']) {
      expect(localStorage.getItem(k)).toBeNull();
    }
  });

  it('不清與帳號無關的偏好與訪客帶進來的推薦碼', () => {
    localStorage.setItem('homeViewMode', 'photo');
    localStorage.setItem('pending_referral_code', 'ABC123');
    clearAccountLocalState();
    expect(localStorage.getItem('homeViewMode')).toBe('photo');
    expect(localStorage.getItem('pending_referral_code')).toBe('ABC123');
  });
});
