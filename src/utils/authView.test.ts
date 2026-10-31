import { describe, it, expect } from 'vitest';
import { resolveAuthView, type AuthViewInput } from './authView';

const base: AuthViewInput = {
  authState: 'unknown',
  isFunnel: false,
  isAdmin: false,
  hint: null,
  pathname: '/',
};
const view = (over: Partial<AuthViewInput>) => resolveAuthView({ ...base, ...over });

describe('resolveAuthView', () => {
  describe('unknown（判定中）', () => {
    it('無提示、非漏斗路由畫訪客版', () => {
      expect(view({})).toBe('guest');
    });

    it('無提示、漏斗路由畫中性占位', () => {
      expect(view({ pathname: '/auth/complete-profile' })).toBe('placeholder');
      expect(view({ pathname: '/payment/result/' })).toBe('placeholder');
    });

    it('member 提示畫頭像占位（不論路由）', () => {
      expect(view({ hint: { kind: 'member' } })).toBe('member-pending');
      expect(view({ hint: { kind: 'member' }, pathname: '/payment/checkout' })).toBe(
        'member-pending',
      );
    });

    it('funnel 提示畫漏斗頁首（不論路由）', () => {
      expect(view({ hint: { kind: 'funnel' } })).toBe('funnel');
      expect(view({ hint: { kind: 'funnel' }, pathname: '/auth/verify-otp' })).toBe('funnel');
    });
  });

  describe('anonymous（已確認未登入）', () => {
    it('非漏斗路由畫訪客版', () => {
      expect(view({ authState: 'anonymous' })).toBe('guest');
    });

    it('漏斗路由（OTP 驗證前）畫中性占位', () => {
      expect(view({ authState: 'anonymous', pathname: '/auth/verify-otp' })).toBe('placeholder');
    });

    it('殘留提示不影響（transient 時提示保留但頁首照訪客版）', () => {
      expect(view({ authState: 'anonymous', hint: { kind: 'member' } })).toBe('guest');
      expect(view({ authState: 'anonymous', hint: { kind: 'funnel' } })).toBe('guest');
    });
  });

  describe('authenticated（已確認登入）', () => {
    it('非漏斗者畫會員版', () => {
      expect(view({ authState: 'authenticated' })).toBe('member');
    });

    it('漏斗者畫漏斗頁首（不論路由）', () => {
      expect(view({ authState: 'authenticated', isFunnel: true })).toBe('funnel');
      expect(
        view({ authState: 'authenticated', isFunnel: true, pathname: '/payment/checkout' }),
      ).toBe('funnel');
    });

    it('提示與確認結果不同時以確認結果為準', () => {
      expect(view({ authState: 'authenticated', hint: { kind: 'funnel' } })).toBe('member');
      expect(view({ authState: 'authenticated', isFunnel: true, hint: { kind: 'member' } })).toBe(
        'funnel',
      );
    });

    it('admin 一律畫會員版', () => {
      expect(view({ authState: 'authenticated', isFunnel: true, isAdmin: true })).toBe('member');
    });
  });

  describe('authState 缺值（舊 context mock）', () => {
    it('依 isLoggedIn 回落會員版或訪客版', () => {
      expect(view({ authState: undefined, isLoggedIn: true })).toBe('member');
      expect(view({ authState: undefined, isLoggedIn: false })).toBe('guest');
      expect(view({ authState: undefined, isLoggedIn: false, pathname: '/payment/checkout' })).toBe(
        'guest',
      );
    });
  });
});
