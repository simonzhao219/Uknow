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
  inferNameMode,
  type StorageLike,
} from './formDraft';

// 記憶體版 Storage —— 讓草稿讀寫能在 node 環境（無 sessionStorage）下被單元測試。
function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { dump: () => Record<string, string> } {
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
    // name 的上限是 50(兩個姓名模式中較寬鬆者),不是中文模式的 10
    // ——理由見 formDraft.ts 的 MAX_LEN 註解與「姓名模式的草稿處理」那組測試。
    const out = sanitizeDraft({ name: '一'.repeat(60), nationalId: 'A1234567890000' });
    expect(out.name).toHaveLength(50);
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
    const s = memoryStorage({
      [PROFILE_DRAFT_KEY]: JSON.stringify({ name: '小明', evil: 1, phone: 999 }),
    });
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

describe('姓名模式的草稿處理', () => {
  it('nameMode 走 allow-list，被竄改的值一律丟棄', () => {
    // 模式是只有兩個合法值的 enum。若掛進 MAX_LEN 沿用字串截斷路徑，
    // 竄改過的 sessionStorage 值會被當成合法草稿原樣寫回 UI state。
    expect(sanitizeDraft({ nameMode: 'foreign' })).toEqual({ nameMode: 'foreign' });
    expect(sanitizeDraft({ nameMode: 'zh' })).toEqual({ nameMode: 'zh' });
    for (const bad of ['xyz', '', 'ZH', 1, null, {}]) {
      expect(sanitizeDraft({ nameMode: bad }), `nameMode=${JSON.stringify(bad)}`).toEqual({});
    }
  });

  it('name 上限取兩模式較寬鬆者，外文長姓名存草稿不被截斷', () => {
    // 若上限留在中文模式的 10，`Christopher Nolan` 會被截成 `Christophe`
    // ——而那個截斷結果仍會通過格式驗證，等於把錯的姓名寫進核對身分的欄位。
    expect(sanitizeDraft({ name: 'Christopher Nolan' })).toEqual({ name: 'Christopher Nolan' });
    const tooLong = `A${'a'.repeat(60)}`;
    expect(sanitizeDraft({ name: tooLong }).name).toHaveLength(50);
  });

  it('只切了模式還沒打字的草稿仍值得存', () => {
    expect(isDraftMeaningful({ nameMode: 'foreign' })).toBe(true);
    expect(isDraftMeaningful({ nameMode: 'zh' })).toBe(false);
  });

  it('inferNameMode 由內容推回模式，供兩條 prefill 路徑還原', () => {
    expect(inferNameMode('王小明')).toBe('zh');
    expect(inferNameMode('谷辣斯 尤達卡')).toBe('zh');
    expect(inferNameMode('John Smith')).toBe('foreign');
    expect(inferNameMode('JOHN SMITH')).toBe('foreign');
    expect(inferNameMode('')).toBe('zh');
  });

  it('外文姓名的草稿還原後模式與內容一致', () => {
    const s = memoryStorage();
    saveProfileDraft({ name: 'John Smith', nameMode: 'foreign' }, s);
    expect(loadProfileDraft(s)).toEqual({ name: 'John Smith', nameMode: 'foreign' });
  });
});
