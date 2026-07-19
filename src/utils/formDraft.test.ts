import { describe, it, expect } from 'vitest';
import {
  sanitizeDraft,
  isDraftMeaningful,
  serializeDraft,
  parseDraft,
  loadProfileDraft,
  saveProfileDraft,
  clearProfileDraft,
  PROFILE_DRAFT_KEY,
  type StorageLike,
} from './formDraft';

// 記憶體版 Storage —— 讓草稿讀寫能在 node 環境（無 sessionStorage）下被單元測試。
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe('sanitizeDraft', () => {
  it('只保留白名單欄位，丟棄未知欄位', () => {
    const out = sanitizeDraft({ name: '小明', evil: 'x', __proto__: 'y', referralCode: 'ABC' });
    expect(out).toEqual({ name: '小明', referralCode: 'ABC' });
  });

  it('丟棄型別不符的欄位（字串欄位收到非字串、布林欄位收到非布林）', () => {
    const out = sanitizeDraft({ name: 123, phone: null, agreedToTerms: 'true' });
    expect(out).toEqual({});
  });

  it('把過長字串截到欄位上限', () => {
    const out = sanitizeDraft({ name: '一二三四五六七八九十十一', nationalId: 'A1234567890000' });
    expect(out.name).toHaveLength(10);
    expect(out.nationalId).toHaveLength(10);
  });

  it('保留 agreedToTerms 的布林值', () => {
    expect(sanitizeDraft({ agreedToTerms: true }).agreedToTerms).toBe(true);
    expect(sanitizeDraft({ agreedToTerms: false }).agreedToTerms).toBe(false);
  });

  it('對 null / 非物件輸入回傳空物件', () => {
    expect(sanitizeDraft(null)).toEqual({});
    expect(sanitizeDraft('nope')).toEqual({});
    expect(sanitizeDraft(42)).toEqual({});
  });

  it('不會 trim 使用者打字中途的空白', () => {
    expect(sanitizeDraft({ name: '王 ' }).name).toBe('王 ');
  });
});

describe('isDraftMeaningful', () => {
  it('全空草稿視為無意義', () => {
    expect(isDraftMeaningful({})).toBe(false);
    expect(isDraftMeaningful({ name: '', phone: '   ' })).toBe(false);
    expect(isDraftMeaningful({ agreedToTerms: false })).toBe(false);
  });

  it('任一欄位有值即視為有意義', () => {
    expect(isDraftMeaningful({ name: '小明' })).toBe(true);
    expect(isDraftMeaningful({ referralCode: 'abc' })).toBe(true);
    expect(isDraftMeaningful({ agreedToTerms: true })).toBe(true);
  });
});

describe('serializeDraft / parseDraft roundtrip', () => {
  it('序列化再解析可還原（且已消毒）', () => {
    const draft = { name: '小明', nationalId: 'A123456789', agreedToTerms: true };
    expect(parseDraft(serializeDraft(draft))).toEqual(draft);
  });

  it('parseDraft 對壞 JSON / null 安全回傳空物件', () => {
    expect(parseDraft(null)).toEqual({});
    expect(parseDraft('')).toEqual({});
    expect(parseDraft('{not json')).toEqual({});
    expect(parseDraft('null')).toEqual({});
  });
});

describe('storage 讀寫（注入記憶體 storage）', () => {
  it('save 後 load 可取回同一份草稿', () => {
    const s = memoryStorage();
    saveProfileDraft({ name: '小明', phone: '0912345678' }, s);
    expect(loadProfileDraft(s)).toEqual({ name: '小明', phone: '0912345678' });
  });

  it('儲存全空草稿時改為清除，不留殘留', () => {
    const s = memoryStorage({ [PROFILE_DRAFT_KEY]: JSON.stringify({ name: '舊資料' }) });
    saveProfileDraft({ name: '', phone: '' }, s);
    expect(s.getItem(PROFILE_DRAFT_KEY)).toBeNull();
    expect(loadProfileDraft(s)).toEqual({});
  });

  it('clear 會移除草稿', () => {
    const s = memoryStorage();
    saveProfileDraft({ name: '小明' }, s);
    clearProfileDraft(s);
    expect(loadProfileDraft(s)).toEqual({});
  });

  it('load 會消毒儲存體裡被竄改的髒資料', () => {
    const s = memoryStorage({ [PROFILE_DRAFT_KEY]: JSON.stringify({ name: '小明', evil: 1, phone: 999 }) });
    expect(loadProfileDraft(s)).toEqual({ name: '小明' });
  });

  it('storage 為 null（如 SSR / 無 sessionStorage）時全部降級為安全 no-op', () => {
    expect(loadProfileDraft(null)).toEqual({});
    expect(() => saveProfileDraft({ name: '小明' }, null)).not.toThrow();
    expect(() => clearProfileDraft(null)).not.toThrow();
  });

  it('getItem 拋錯時 load 安全回傳空物件', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadProfileDraft(throwing)).toEqual({});
  });
});
