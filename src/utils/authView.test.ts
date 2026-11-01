import { describe, it, expect } from 'vitest';
import {
  authViewOrFallback,
  resolveAuthView,
  showsMemberChrome,
  type AuthViewInput,
} from './authView';

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

describe('resolveAuthView degraded（T1-B 暫時性故障）', () => {
  it('無提示時一律畫中性占位（已知有 session，不畫登入）', () => {
    expect(view({ authState: 'degraded' })).toBe('placeholder');
    expect(view({ authState: 'degraded', pathname: '/dashboard' })).toBe('placeholder');
  });

  it('有提示時依提示畫頭像占位或漏斗頁首', () => {
    expect(view({ authState: 'degraded', hint: { kind: 'member' } })).toBe('member-pending');
    expect(view({ authState: 'degraded', hint: { kind: 'funnel' } })).toBe('funnel');
  });
});

describe('resolveAuthView 安全出口（getSession 卡住）', () => {
  it('判定中且 getSession 卡住時改畫訪客版（含漏斗路由與提示）', () => {
    expect(view({ sessionStalled: true })).toBe('guest');
    expect(view({ sessionStalled: true, pathname: '/payment/checkout' })).toBe('guest');
    expect(view({ sessionStalled: true, hint: { kind: 'member' } })).toBe('guest');
  });

  it('已確認登入時不受影響', () => {
    expect(view({ authState: 'authenticated', sessionStalled: true })).toBe('member');
  });
});

describe('showsMemberChrome', () => {
  it('會員與頭像占位顯示會員外框', () => {
    expect(showsMemberChrome('member')).toBe(true);
    expect(showsMemberChrome('member-pending')).toBe(true);
  });

  it('訪客、占位、註冊中不顯示', () => {
    for (const v of ['guest', 'placeholder', 'funnel'] as const) {
      expect(showsMemberChrome(v), v).toBe(false);
    }
    expect(showsMemberChrome(undefined)).toBe(false);
  });
});

describe('authViewOrFallback', () => {
  it('有 authView 時原樣回傳', () => {
    expect(authViewOrFallback('funnel', true)).toBe('funnel');
  });

  it('舊 context 沒有 authView 時依 isLoggedIn 回落', () => {
    expect(authViewOrFallback(undefined, true)).toBe('member');
    expect(authViewOrFallback(undefined, false)).toBe('guest');
  });
});
