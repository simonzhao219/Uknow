import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildReferralLink,
  buildInviteMessage,
  savePendingReferral,
  getPendingReferral,
  clearPendingReferral,
  buildLineShareUrl,
  shareToLine,
  shareReferralInvite,
} from './referralInvite';
import { openExternalLink } from './externalLink';
import { copyToClipboard } from './clipboard';

// 分享路由的三個外部依賴替身掉：導頁（openExternalLink）、複製（copyToClipboard）、
// 瀏覽器辨識（detectInAppBrowser）。只有「分享到哪裡」那幾條用得到。
const { browser } = vi.hoisted(() => ({
  browser: { isInAppBrowser: false, platform: null as string | null, userAgent: '' },
}));
vi.mock('./externalLink', () => ({ openExternalLink: vi.fn() }));
vi.mock('./clipboard', () => ({ copyToClipboard: vi.fn(() => true) }));
vi.mock('./browserDetection', () => ({ detectInAppBrowser: () => browser }));

// node env (no jsdom) — provide a minimal in-memory localStorage, matching the
// convention in otpSession.test.ts. The module only uses getItem/setItem/removeItem.
function installMemoryStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
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

  it('由推薦碼組出 /register?ref= 連結', () => {
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

  it('save 後 get 可取回同一份資料', () => {
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

describe('buildLineShareUrl', () => {
  it('把整段邀請訊息編碼進 line.me 分享網址的 text 參數', () => {
    const message =
      '邀請你一起加入 Uknow：\nhttps://a.example/register?ref=abc123\n\n推薦碼 abc123';
    const url = buildLineShareUrl(message);
    expect(url).toBe(`https://line.me/R/share?text=${encodeURIComponent(message)}`);
    // 換行、問號、等號都要被編碼，否則連結的 ?ref= 會被 LINE 當成自己的參數吃掉。
    expect(new URL(url).searchParams.get('text')).toBe(message);
  });
});

describe('shareToLine — 手機與 LINE 內直接到 LINE，桌機不導離本站', () => {
  const message = buildInviteMessageFor('abc123');
  const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(message)}`;

  function stubEnv({ coarse, share }: { coarse: boolean; share?: () => Promise<void> }) {
    vi.stubGlobal('window', {
      location: { origin: 'https://test.example' },
      matchMedia: (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }),
    });
    vi.stubGlobal('navigator', share ? { share } : {});
  }

  beforeEach(() => {
    browser.isInAppBrowser = false;
    browser.platform = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('LINE 內建瀏覽器直接導到 LINE 分享網址，不給成功提示', () => {
    stubEnv({ coarse: false });
    browser.isInAppBrowser = true;
    browser.platform = 'line';
    const showToast = vi.fn();
    shareToLine(message, showToast);
    expect(openExternalLink).toHaveBeenCalledWith(lineUrl);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('觸控裝置的一般瀏覽器也直接導到 LINE 分享網址', () => {
    stubEnv({ coarse: true });
    shareToLine(message, vi.fn());
    expect(openExternalLink).toHaveBeenCalledWith(lineUrl);
  });

  it('桌機有系統分享面板時叫面板，不導離本站', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubEnv({ coarse: false, share });
    shareToLine(message, vi.fn());
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledWith({ title: 'Uknow 專業服務平台', text: message });
  });

  it('桌機沒有分享面板時複製整段邀請訊息並提示', () => {
    stubEnv({ coarse: false });
    const showToast = vi.fn();
    shareToLine(message, showToast);
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(copyToClipboard).toHaveBeenCalledWith(message);
    expect(showToast).toHaveBeenCalledWith('邀請訊息已複製到剪貼簿！', 'success');
  });

  it('導頁失敗時退回複製，邀請仍可完成', () => {
    stubEnv({ coarse: true });
    vi.mocked(openExternalLink).mockImplementationOnce(() => {
      throw new Error('navigation blocked');
    });
    const showToast = vi.fn();
    shareToLine(message, showToast);
    expect(copyToClipboard).toHaveBeenCalledWith(message);
    expect(showToast).toHaveBeenCalledWith('邀請訊息已複製到剪貼簿！', 'success');
  });

  it('我的 QR 頁的邀請好友在 LINE 內建瀏覽器也改走 LINE 分享網址', () => {
    stubEnv({ coarse: false });
    browser.isInAppBrowser = true;
    browser.platform = 'line';
    shareReferralInvite('abc123', vi.fn());
    expect(openExternalLink).toHaveBeenCalledWith(lineUrl);
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('我的 QR 頁的邀請好友在其他內建瀏覽器照舊複製', () => {
    stubEnv({ coarse: true });
    browser.isInAppBrowser = true;
    browser.platform = 'facebook';
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast);
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(copyToClipboard).toHaveBeenCalledWith(message);
  });
});

/** 與 buildInviteMessage 同一個 base（stubEnv 的 origin）——在 describe 外先算好。 */
function buildInviteMessageFor(code: string): string {
  return `邀請你一起加入 Uknow：\nhttps://test.example/register?ref=${code}\n\n推薦碼 ${code}`;
}
