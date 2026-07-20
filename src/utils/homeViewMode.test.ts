import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_VIEW_MODE,
  normalizeHomeViewMode,
  readHomeViewMode,
  writeHomeViewMode,
  type HomeViewMode,
  type StorageLike,
} from './homeViewMode';

// 用來注入的假儲存體：可選擇讓 get/set 拋錯，模擬 Safari 無痕模式 / 配額爆掉。
function fakeStorage(
  initial: Record<string, string> = {},
  opts: { throwOnGet?: boolean; throwOnSet?: boolean } = {},
): StorageLike & { store: Record<string, string> } {
  const store = { ...initial };
  return {
    store,
    getItem(key) {
      if (opts.throwOnGet) throw new Error('boom');
      return key in store ? store[key] : null;
    },
    setItem(key, value) {
      if (opts.throwOnSet) throw new Error('boom');
      store[key] = value;
    },
  };
}

describe('normalizeHomeViewMode', () => {
  it('接受兩個合法模式並原樣回傳', () => {
    expect(normalizeHomeViewMode('photo')).toBe('photo');
    expect(normalizeHomeViewMode('detailed')).toBe('detailed');
  });

  it('任何非法值都收斂回預設模式（照片牆）', () => {
    const junk: unknown[] = ['', 'grid', 'PHOTO', null, undefined, 3, {}, []];
    for (const value of junk) {
      expect(normalizeHomeViewMode(value)).toBe(DEFAULT_HOME_VIEW_MODE);
    }
  });

  it('預設模式是 3 欄照片牆', () => {
    expect(DEFAULT_HOME_VIEW_MODE).toBe<HomeViewMode>('photo');
  });
});

describe('readHomeViewMode', () => {
  it('空儲存體 → 預設照片牆', () => {
    expect(readHomeViewMode(fakeStorage())).toBe('photo');
  });

  it('讀回先前存的合法偏好', () => {
    const storage = fakeStorage();
    writeHomeViewMode('detailed', storage);
    expect(readHomeViewMode(storage)).toBe('detailed');
  });

  it('儲存體裡是髒資料 → 收斂回預設', () => {
    const storage = fakeStorage({ 'uknow:pref:home-view-mode': 'garbage' });
    expect(readHomeViewMode(storage)).toBe('photo');
  });

  it('讀取拋錯（無痕模式）→ 不炸、回預設', () => {
    expect(readHomeViewMode(fakeStorage({}, { throwOnGet: true }))).toBe('photo');
  });

  it('沒有可用儲存體（null）→ 回預設', () => {
    expect(readHomeViewMode(null)).toBe('photo');
  });
});

describe('writeHomeViewMode', () => {
  it('把偏好寫進儲存體', () => {
    const storage = fakeStorage();
    writeHomeViewMode('detailed', storage);
    expect(storage.store['uknow:pref:home-view-mode']).toBe('detailed');
  });

  it('寫入拋錯（配額 / 無痕）被吞掉，不影響流程', () => {
    expect(() =>
      writeHomeViewMode('photo', fakeStorage({}, { throwOnSet: true })),
    ).not.toThrow();
  });

  it('沒有可用儲存體（null）→ 靜默略過', () => {
    expect(() => writeHomeViewMode('photo', null)).not.toThrow();
  });
});
