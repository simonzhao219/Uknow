import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildReferralLink,
  buildInviteMessage,
  savePendingReferral,
  getPendingReferral,
  clearPendingReferral,
  buildLineShareUrl,
  shareReferralInvite,
} from './referralInvite';
import { openExternalLink } from './externalLink';
import { copyToClipboard } from './clipboard';
import {
  findForbiddenWord,
  RECRUITMENT_FORBIDDEN_WORDS,
  referralDisclosureSentence,
} from '@recruitment-copy';

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

describe('buildInviteMessage — 連結、推薦碼與推薦人揭露句', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://test.example' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('包含邀請連結（含 ?ref）', () => {
    expect(buildInviteMessage('abc123', '小明')).toContain('register?ref=abc123');
  });

  it('包含推薦碼文字', () => {
    expect(buildInviteMessage('abc123', '小明')).toContain('推薦碼 abc123');
  });

  it('是可閱讀的多行邀請訊息', () => {
    expect(buildInviteMessage('abc123', '小明')).toContain('邀請你一起加入');
  });

  it('連結只出現一次（避免重複）', () => {
    const message = buildInviteMessage('abc123', '小明');
    const occurrences = message.split('register?ref=abc123').length - 1;
    expect(occurrences).toBe(1);
  });

  it('既有三段逐字不變，揭露句空一行自成一段收尾', () => {
    // 手冊 4-1-2(2)：推薦人要表明身分。揭露句接在推薦碼之後、空一行，不黏成碼的附註。
    expect(buildInviteMessage('abc123', '小明')).toBe(
      '邀請你一起加入 Uknow：\nhttps://test.example/register?ref=abc123\n\n推薦碼 abc123' +
        '\n\n本邀請由 Uknow 推薦人 小明 發送',
    );
  });

  it('沒給名字時以不帶名字的揭露句收尾，不留空白破句', () => {
    expect(buildInviteMessage('abc123')).toMatch(/\n\n本邀請由 Uknow 推薦人發送$/);
  });

  it.each(RECRUITMENT_FORBIDDEN_WORDS)('邀請訊息不含招募禁用字樣「%s」', (word) => {
    expect(buildInviteMessage('abc123', '小明')).not.toContain(word);
  });
});

describe('referralDisclosureSentence', () => {
  it('帶名字時逐字為「本邀請由 Uknow 推薦人 {名} 發送」', () => {
    expect(referralDisclosureSentence('小明')).toBe('本邀請由 Uknow 推薦人 小明 發送');
  });

  it('名字前後的空白不帶進句子', () => {
    expect(referralDisclosureSentence('  小明 ')).toBe('本邀請由 Uknow 推薦人 小明 發送');
  });

  it.each(['', '   ', null, undefined])('名字為 %j 時退回不帶名字的句子', (name) => {
    expect(referralDisclosureSentence(name)).toBe('本邀請由 Uknow 推薦人發送');
  });
});

describe('RECRUITMENT_FORBIDDEN_WORDS', () => {
  it('恰為手冊對應詞十二個加用語裁決三個，共十五個字樣', () => {
    expect([...RECRUITMENT_FORBIDDEN_WORDS]).toEqual([
      '賺',
      '獎金',
      '收入',
      '投資',
      '受僱',
      '工作',
      '兼職',
      '節稅',
      '僱傭',
      '合夥',
      '獨家',
      '特許',
      '傳銷',
      '直銷',
      '下線',
    ]);
  });
});

describe('findForbiddenWord', () => {
  it('文字含禁用字樣時回傳命中的那一個', () => {
    expect(findForbiddenWord('邀請你一起來兼職')).toBe('兼職');
  });

  it('沒有命中時回傳 undefined', () => {
    expect(findForbiddenWord('本邀請由 Uknow 推薦人 小明 發送')).toBeUndefined();
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

// 分享順位（業主 2026-10-17）：① 手機／系統分享面板，讓使用者自己選 App 與對象；
// ② 面板確定用不了時，所在 App 能直接分享就交給它（LINE 內建瀏覽器 → LINE 好友選擇器）；
// ③ 最後才複製整段邀請訊息並提示。會員中心、推薦管理、我的 QR 頁的「邀請好友」都是這一支。
describe('shareReferralInvite — 先系統分享面板，再所在 App，最後複製', () => {
  let message = '';
  let lineUrl = '';

  /** share 給值＝環境有系統分享面板；訊息在替身環境裡算，不另抄邀請文案。 */
  function stubEnv(share?: (data: ShareData) => Promise<void>) {
    vi.stubGlobal('window', { location: { origin: 'https://test.example' } });
    vi.stubGlobal('navigator', share ? { share } : {});
    message = buildInviteMessage('abc123', '小明');
    lineUrl = `https://line.me/R/share?text=${encodeURIComponent(message)}`;
  }

  /** 讓 share() 被拒之後的 .catch 跑完。 */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** 瀏覽器拒絕 share() 時丟的是 DOMException，name 區分原因。 */
  const rejectWith = (name: string) => () => Promise.reject(new DOMException(name, name));

  beforeEach(() => {
    browser.isInAppBrowser = false;
    browser.platform = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('有系統分享面板就先叫面板，訊息含連結與推薦碼', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubEnv(share);
    shareReferralInvite('abc123', vi.fn(), '小明');
    expect(share).toHaveBeenCalledWith({ title: 'Uknow 專業服務平台', text: message });
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('系統分享面板收到的訊息以推薦人揭露句收尾', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubEnv(share);
    shareReferralInvite('abc123', vi.fn(), '小明');
    expect(share.mock.calls[0][0].text).toMatch(/\n\n本邀請由 Uknow 推薦人 小明 發送$/);
  });

  it('在 LINE 內建瀏覽器裡也先叫系統分享面板，讓使用者自己選 App', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubEnv(share);
    browser.isInAppBrowser = true;
    browser.platform = 'line';
    shareReferralInvite('abc123', vi.fn(), '小明');
    expect(share).toHaveBeenCalledTimes(1);
    expect(openExternalLink).not.toHaveBeenCalled();
  });

  it('使用者在分享面板按取消就停在那裡，不再導頁也不複製', async () => {
    stubEnv(rejectWith('AbortError'));
    browser.isInAppBrowser = true;
    browser.platform = 'line';
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    await settle();
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('面板還開著又按一下（InvalidStateError）就停，不導頁也不複製', async () => {
    // Web Share 規格：前一次 share() 尚未結束時再呼叫，以 InvalidStateError 拒絕——
    // 那是連點的第二下，不是「面板用不了」。
    stubEnv(rejectWith('InvalidStateError'));
    browser.isInAppBrowser = true;
    browser.platform = 'line';
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    await settle();
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('不在任何 App 裡時連點第二下（InvalidStateError）也不複製、不提示', async () => {
    // 上一條在 LINE 內：那裡本來就不走複製，只有「不導頁」咬得到。這條守複製那一側。
    stubEnv(rejectWith('InvalidStateError'));
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    await settle();
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('分享面板叫不起來時，在 LINE 內建瀏覽器改開 LINE 好友選擇器', async () => {
    stubEnv(rejectWith('NotAllowedError'));
    browser.isInAppBrowser = true;
    browser.platform = 'line';
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    await settle();
    expect(openExternalLink).toHaveBeenCalledWith(lineUrl);
    // 開了 LINE 不等於送出了：不給任何成功提示。
    expect(showToast).not.toHaveBeenCalled();
  });

  it('沒有分享面板的 LINE 內建瀏覽器直接開 LINE 好友選擇器', () => {
    stubEnv();
    browser.isInAppBrowser = true;
    browser.platform = 'line';
    shareReferralInvite('abc123', vi.fn(), '小明');
    expect(openExternalLink).toHaveBeenCalledWith(lineUrl);
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('沒有分享面板、所在 App 也不能直接分享時，複製整段邀請訊息並提示', () => {
    stubEnv();
    browser.isInAppBrowser = true;
    browser.platform = 'facebook';
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(copyToClipboard).toHaveBeenCalledWith(message);
    expect(showToast).toHaveBeenCalledWith('邀請訊息已複製到剪貼簿！', 'success');
  });

  it('分享面板出錯且不在可直接分享的 App 裡時，退回複製', async () => {
    stubEnv(rejectWith('NotAllowedError'));
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    await settle();
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(copyToClipboard).toHaveBeenCalledWith(message);
    expect(showToast).toHaveBeenCalledWith('邀請訊息已複製到剪貼簿！', 'success');
  });

  // 防禦性的那條路：只有導頁當下丟同步例外（沙箱 iframe 禁止導頁之類）才會走到。
  it('導頁當下丟例外時退回複製，邀請仍可完成', () => {
    stubEnv();
    browser.isInAppBrowser = true;
    browser.platform = 'line';
    vi.mocked(openExternalLink).mockImplementationOnce(() => {
      throw new Error('navigation blocked');
    });
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    expect(copyToClipboard).toHaveBeenCalledWith(message);
    expect(showToast).toHaveBeenCalledWith('邀請訊息已複製到剪貼簿！', 'success');
  });

  // 會員中心與推薦管理沒有可手動複製的邀請文字（只露推薦碼），複製失敗要指向有欄位的
  // 地方；面板被拒之後的複製已脫離使用者手勢，WebKit 的 execCommand 更容易回 false。
  it('沒有分享面板而複製失敗時，指向我的 QR 頁的邀請連結欄位', () => {
    stubEnv();
    vi.mocked(copyToClipboard).mockReturnValueOnce(false);
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    expect(showToast).toHaveBeenCalledWith(
      '複製失敗，請到「我的 QR」頁的邀請連結欄位複製',
      'error',
    );
  });

  it('分享面板出錯後複製也失敗時，同樣指向我的 QR 頁的邀請連結欄位', async () => {
    stubEnv(rejectWith('NotAllowedError'));
    vi.mocked(copyToClipboard).mockReturnValueOnce(false);
    const showToast = vi.fn();
    shareReferralInvite('abc123', showToast, '小明');
    await settle();
    expect(showToast).toHaveBeenCalledWith(
      '複製失敗，請到「我的 QR」頁的邀請連結欄位複製',
      'error',
    );
  });

  it('沒有推薦碼時提示錯誤，不分享', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubEnv(share);
    const showToast = vi.fn();
    shareReferralInvite('', showToast, '小明');
    expect(share).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('推薦碼不存在', 'error');
  });
});
