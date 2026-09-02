// 「我的 QR」分頁偏好的行為契約：預設是邀請好友、記得上次選擇、髒資料收斂回預設、
// 儲存體不可用時不炸；以及兩條最關鍵的——哪些分頁存在只由 availableMyQrTabs 說了算
// （不再各處手寫 joined && referralCode），以及開頁時「深連結 > 偏好 > 驗證碼」的
// 三層優先序（停在一個不存在的分頁上會是一片空白）。
import { describe, expect, it } from 'vitest';
import {
  availableMyQrTabs,
  DEFAULT_MY_QR_TAB,
  MY_QR_TAB_KEY,
  type MyQrTabAvailability,
  normalizeMyQrTab,
  readMyQrTab,
  resolveMyQrTab,
  type StorageLike,
  writeMyQrTab,
} from './myQrTabPreference';

function fakeStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

/** 三個分頁都在（已加入推薦計畫、有推薦碼、會籍有效）。 */
const ALL_TABS: MyQrTabAvailability = { invite: true, verify: true, scan: true };

describe('normalizeMyQrTab', () => {
  it('合法值原樣保留', () => {
    expect(normalizeMyQrTab('invite')).toBe('invite');
    expect(normalizeMyQrTab('verify')).toBe('verify');
  });

  it('掃描分頁是合法值，不得被當成髒資料收斂掉', () => {
    // 漏掉這一條的後果是靜默的：使用者切到掃描分頁、偏好寫進 localStorage 成功，
    // 下次開頁讀回來卻被收斂成邀請好友——TypeScript 攔不到（兩個分支都回 MyQrTab）。
    expect(normalizeMyQrTab('scan')).toBe('scan');
  });

  it('髒資料/空值收斂回預設（邀請好友）', () => {
    expect(normalizeMyQrTab('garbage')).toBe(DEFAULT_MY_QR_TAB);
    expect(normalizeMyQrTab(null)).toBe(DEFAULT_MY_QR_TAB);
    expect(normalizeMyQrTab(undefined)).toBe(DEFAULT_MY_QR_TAB);
    expect(DEFAULT_MY_QR_TAB).toBe('invite');
  });
});

describe('availableMyQrTabs', () => {
  it('已加入推薦計畫且推薦碼已產生時，邀請分頁存在', () => {
    expect(availableMyQrTabs({ joined: true, referralCode: 'UK8K3M9Q2X', canScan: true })).toEqual({
      invite: true,
      verify: true,
      scan: true,
    });
  });

  it('已加入但推薦碼尚未產生時邀請分頁不存在（不印假碼的同一條規則）', () => {
    expect(availableMyQrTabs({ joined: true, referralCode: null, canScan: true }).invite).toBe(
      false,
    );
    expect(availableMyQrTabs({ joined: true, referralCode: '', canScan: true }).invite).toBe(false);
  });

  it('未加入推薦計畫時邀請分頁不存在，即使推薦碼已產生', () => {
    expect(
      availableMyQrTabs({ joined: false, referralCode: 'UK8K3M9Q2X', canScan: true }).invite,
    ).toBe(false);
  });

  it('驗證碼分頁恆存在，掃描分頁跟著 canScan 走', () => {
    const cannotScan = availableMyQrTabs({ joined: false, referralCode: null, canScan: false });
    expect(cannotScan.verify).toBe(true);
    expect(cannotScan.scan).toBe(false);
    expect(availableMyQrTabs({ joined: false, referralCode: null, canScan: true }).scan).toBe(true);
  });
});

describe('readMyQrTab / writeMyQrTab', () => {
  it('沒有存過偏好時回預設', () => {
    expect(readMyQrTab(fakeStorage())).toBe('invite');
  });

  it('寫入後讀得回同一個分頁（記住上次選擇）', () => {
    const storage = fakeStorage();
    writeMyQrTab('verify', storage);
    expect(storage.data[MY_QR_TAB_KEY]).toBe('verify');
    expect(readMyQrTab(storage)).toBe('verify');
  });

  it('掃描分頁的偏好也存得住、讀得回', () => {
    const storage = fakeStorage();
    writeMyQrTab('scan', storage);
    expect(readMyQrTab(storage)).toBe('scan');
  });

  it('儲存體不可用（無痕模式回 null）時讀寫都不拋錯', () => {
    expect(readMyQrTab(null)).toBe(DEFAULT_MY_QR_TAB);
    expect(() => writeMyQrTab('verify', null)).not.toThrow();
  });

  it('存取拋錯時讀取安全退回預設', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(readMyQrTab(throwing)).toBe(DEFAULT_MY_QR_TAB);
    expect(() => writeMyQrTab('invite', throwing)).not.toThrow();
  });
});

describe('resolveMyQrTab', () => {
  it('URL 指定的分頁存在時勝過偏好（深連結是明確意圖）', () => {
    // /admin 的「會員驗證」捷徑帶 ?tab=scan：按下去就是要掃碼，不該停在上次的偏好。
    expect(resolveMyQrTab(ALL_TABS, 'scan', 'invite')).toBe('scan');
    expect(resolveMyQrTab(ALL_TABS, 'verify', 'invite')).toBe('verify');
  });

  it('URL 指定的分頁不存在時靜默落回偏好', () => {
    // 不能掃的人拿到別人轉傳的 ?tab=scan——降級，不是報錯。
    const noScan: MyQrTabAvailability = { invite: true, verify: true, scan: false };
    expect(resolveMyQrTab(noScan, 'scan', 'invite')).toBe('invite');
  });

  it('URL 髒值當作沒有指定，不得蓋掉偏好', () => {
    // 收斂成預設會讓 ?tab=垃圾 反過來把使用者的偏好改成邀請好友。
    expect(resolveMyQrTab(ALL_TABS, 'garbage', 'verify')).toBe('verify');
    expect(resolveMyQrTab(ALL_TABS, null, 'verify')).toBe('verify');
    expect(resolveMyQrTab(ALL_TABS, undefined, 'scan')).toBe('scan');
  });

  it('偏好的分頁不存在時落回驗證碼（唯一對所有人都在的分頁）', () => {
    const verifyOnly: MyQrTabAvailability = { invite: false, verify: true, scan: false };
    expect(resolveMyQrTab(verifyOnly, null, 'invite')).toBe('verify');
    expect(resolveMyQrTab(verifyOnly, 'scan', 'invite')).toBe('verify');
  });

  it('URL 與偏好都不存在時落回驗證碼', () => {
    const scanOnlyExtra: MyQrTabAvailability = { invite: false, verify: true, scan: true };
    expect(resolveMyQrTab(scanOnlyExtra, 'invite', 'invite')).toBe('verify');
  });
});
