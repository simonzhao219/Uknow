import { describe, it, expect } from 'vitest';
import {
  resolvePostLoginAction,
  nextRouteForStep,
  classifyLoginError,
} from './registrationFlow';

describe('resolvePostLoginAction — registrationStep 是唯一的導向來源', () => {
  it('step 3（完成）→ dashboard 並設定 user', () => {
    const action = resolvePostLoginAction(3);
    expect(action.route).toBe('/dashboard');
    expect(action.authenticate).toBe(true);
    expect(action.toast?.type).toBe('success');
  });

  it('step 1（待付款）→ 付款頁並設定 user，靜默不彈 toast', () => {
    const action = resolvePostLoginAction(1);
    expect(action.route).toBe('/payment/checkout');
    expect(action.authenticate).toBe(true);
    expect(action.toast).toBeUndefined();
  });

  it('step 2（待開通）→ 付款頁並設定 user', () => {
    const action = resolvePostLoginAction(2);
    expect(action.route).toBe('/payment/checkout');
    expect(action.authenticate).toBe(true);
  });

  it('step 0（新用戶未填資料）→ 完善資料頁，且不設定 user', () => {
    const action = resolvePostLoginAction(0);
    expect(action.route).toBe('/auth/complete-profile');
    expect(action.authenticate).toBe(false);
  });

  it.each([null, undefined, 99])('未知/缺值狀態 %p → 保守導向完善資料頁', (step) => {
    const action = resolvePostLoginAction(step as number | null | undefined);
    expect(action.route).toBe('/auth/complete-profile');
    expect(action.authenticate).toBe(false);
  });
});

describe('nextRouteForStep', () => {
  it('與 resolvePostLoginAction 的 route 一致', () => {
    expect(nextRouteForStep(3)).toBe('/dashboard');
    expect(nextRouteForStep(1)).toBe('/payment/checkout');
    expect(nextRouteForStep(0)).toBe('/auth/complete-profile');
  });
});

describe('classifyLoginError — 未驗證不能被誤判成密碼錯誤', () => {
  it('email_not_confirmed（by code）→ 可復原，導回驗證', () => {
    expect(classifyLoginError({ code: 'email_not_confirmed', message: 'Email not confirmed' }))
      .toBe('email_not_confirmed');
  });

  it('email_not_confirmed（只有訊息文字）→ 仍能辨識', () => {
    expect(classifyLoginError({ message: 'Email not confirmed' })).toBe('email_not_confirmed');
  });

  it('email_not_confirmed（走 error_description 欄位）→ 仍能辨識', () => {
    expect(classifyLoginError({ error_description: 'Email not confirmed' }))
      .toBe('email_not_confirmed');
  });

  it('真正的帳密錯誤（invalid_grant / Invalid login credentials）→ invalid_credentials', () => {
    expect(classifyLoginError({ error_description: 'Invalid login credentials' }))
      .toBe('invalid_credentials');
    expect(classifyLoginError({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('invalid_credentials');
  });

  it('未提供錯誤或無法辨識 → unknown', () => {
    expect(classifyLoginError(null)).toBe('unknown');
    expect(classifyLoginError(undefined)).toBe('unknown');
    expect(classifyLoginError({ message: 'some server blew up' })).toBe('unknown');
  });
});
