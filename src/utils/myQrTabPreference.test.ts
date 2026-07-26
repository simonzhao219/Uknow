// 「我的 QR」分頁偏好的行為契約：預設是邀請好友、記得上次選擇、髒資料收斂回預設、
// 儲存體不可用時不炸；以及最關鍵的一條——未加入推薦計畫時一律停在核身碼分頁
// （那時邀請分頁根本不存在，停在它上面會是一片空白）。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MY_QR_TAB,
  MY_QR_TAB_KEY,
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

describe('normalizeMyQrTab', () => {
  it('合法值原樣保留', () => {
    expect(normalizeMyQrTab('invite')).toBe('invite');
    expect(normalizeMyQrTab('verify')).toBe('verify');
  });

  it('髒資料/空值收斂回預設（邀請好友）', () => {
    expect(normalizeMyQrTab('garbage')).toBe(DEFAULT_MY_QR_TAB);
    expect(normalizeMyQrTab(null)).toBe(DEFAULT_MY_QR_TAB);
    expect(normalizeMyQrTab(undefined)).toBe(DEFAULT_MY_QR_TAB);
    expect(DEFAULT_MY_QR_TAB).toBe('invite');
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
  it('可邀請時依偏好', () => {
    expect(resolveMyQrTab(true, 'invite')).toBe('invite');
    expect(resolveMyQrTab(true, 'verify')).toBe('verify');
  });

  it('不可邀請（未加入推薦計畫）時一律核身碼，即使偏好記著邀請', () => {
    expect(resolveMyQrTab(false, 'invite')).toBe('verify');
    expect(resolveMyQrTab(false, 'verify')).toBe('verify');
  });
});
