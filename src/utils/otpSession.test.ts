import { describe, it, expect, beforeEach, vi } from 'vitest';
import { savePendingOtp, getPendingOtp, clearPendingOtp } from './otpSession';

// jsdom isn't configured for this suite (node env), so provide a minimal
// in-memory localStorage. The module only uses getItem/setItem/removeItem.
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

describe('otpSession — 待驗證情境撐過重整', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('save → get 能還原 email 與 otpType', () => {
    savePendingOtp('user@example.com', 'signup');
    expect(getPendingOtp()).toEqual({ email: 'user@example.com', otpType: 'signup' });

    savePendingOtp('reset@example.com', 'recovery');
    expect(getPendingOtp()).toEqual({ email: 'reset@example.com', otpType: 'recovery' });
  });

  it('沒有任何待驗證情境時回傳 null', () => {
    expect(getPendingOtp()).toBeNull();
  });

  it('clear 之後回傳 null', () => {
    savePendingOtp('user@example.com', 'signup');
    clearPendingOtp();
    expect(getPendingOtp()).toBeNull();
  });

  it('資料毀損（非 JSON）→ 回傳 null 而非丟例外', () => {
    localStorage.setItem('pending_otp', '{not json');
    expect(getPendingOtp()).toBeNull();
  });

  it('缺欄位 / otpType 非法 → 回傳 null', () => {
    localStorage.setItem('pending_otp', JSON.stringify({ email: 'a@b.com' }));
    expect(getPendingOtp()).toBeNull();
    localStorage.setItem('pending_otp', JSON.stringify({ email: 'a@b.com', otpType: 'bogus' }));
    expect(getPendingOtp()).toBeNull();
    localStorage.setItem('pending_otp', JSON.stringify({ email: '', otpType: 'signup' }));
    expect(getPendingOtp()).toBeNull();
  });

  it('storage 不可用時，save/get/clear 都不丟例外', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('unavailable'); },
      setItem: () => { throw new Error('unavailable'); },
      removeItem: () => { throw new Error('unavailable'); },
    });
    expect(() => savePendingOtp('a@b.com', 'signup')).not.toThrow();
    expect(getPendingOtp()).toBeNull();
    expect(() => clearPendingOtp()).not.toThrow();
  });
});
