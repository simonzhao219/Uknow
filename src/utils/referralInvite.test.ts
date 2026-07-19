import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildReferralLink,
  buildInviteMessage,
  savePendingReferral,
  getPendingReferral,
  clearPendingReferral,
} from './referralInvite';

// node env (no jsdom) — provide a minimal in-memory localStorage, matching the
// convention in otpSession.test.ts. The module only uses getItem/setItem/removeItem.
function installMemoryStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', mock);
  return store;
}

describe('buildReferralLink', () => {
  beforeEach(() => {
    // buildReferralLink falls back to window.location.origin when
    // VITE_PUBLIC_APP_URL is unset (the case in the test env).
    vi.stubGlobal('window', { location: { origin: 'https://test.example' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a /register?ref= link from the referral code', () => {
    expect(buildReferralLink('abc123')).toBe('https://test.example/register?ref=abc123');
  });
});

describe('buildInviteMessage — 一律同時含「連結」與「推薦碼」', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://test.example' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('包含邀請連結（含 ?ref）', () => {
    expect(buildInviteMessage('abc123')).toContain('register?ref=abc123');
  });

  it('包含推薦碼文字', () => {
    expect(buildInviteMessage('abc123')).toContain('推薦碼 abc123');
  });

  it('是可閱讀的多行邀請訊息', () => {
    expect(buildInviteMessage('abc123')).toContain('邀請你一起加入');
  });

  it('連結只出現一次（避免重複）', () => {
    const message = buildInviteMessage('abc123');
    const occurrences = message.split('register?ref=abc123').length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('pending referral — 撐過註冊漏斗（save/get/clear）', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('save → get round-trip', () => {
    savePendingReferral('abc123');
    expect(getPendingReferral()).toBe('abc123');
  });

  it('沒有任何待帶入推薦碼時回傳 null', () => {
    expect(getPendingReferral()).toBeNull();
  });

  it('存入前正規化：轉小寫並去除前後空白', () => {
    savePendingReferral('  ABC123  ');
    expect(getPendingReferral()).toBe('abc123');
  });

  it('空字串 / 全空白視為無效，不寫入', () => {
    savePendingReferral('   ');
    expect(getPendingReferral()).toBeNull();
  });

  it('clear 之後回傳 null', () => {
    savePendingReferral('abc123');
    clearPendingReferral();
    expect(getPendingReferral()).toBeNull();
  });

  it('storage 不可用時，save/get/clear 都不丟例外', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('unavailable');
      },
      removeItem: () => {
        throw new Error('unavailable');
      },
    });
    expect(() => savePendingReferral('abc123')).not.toThrow();
    expect(getPendingReferral()).toBeNull();
    expect(() => clearPendingReferral()).not.toThrow();
  });
});
