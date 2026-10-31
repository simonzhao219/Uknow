import { describe, it, expect } from 'vitest';
import {
  AUTH_HINT_KEY,
  clearAuthHint,
  initialOf,
  loadAuthHint,
  readAuthHint,
  toUid8,
  writeAuthHint,
} from './authHint';

/** 記憶體版 Storage；`throwing` 讓每個存取都擲例外（Safari 隱私模式、配額用盡）。 */
function memoryStorage(initial: Record<string, string> = {}, throwing = false): Storage {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (throwing) throw new Error('SecurityError');
  };
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      guard();
      data.clear();
    },
    getItem: (k) => {
      guard();
      return data.has(k) ? (data.get(k) as string) : null;
    },
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => {
      guard();
      data.delete(k);
    },
    setItem: (k, v) => {
      guard();
      data.set(k, String(v));
    },
  };
}

const UID = '1a2b3c4d-0000-4000-8000-000000000000';

describe('toUid8', () => {
  it('取 user id 前 8 碼', () => {
    expect(toUid8(UID)).toBe('1a2b3c4d');
  });

  it('null 或空字串回空字串', () => {
    expect(toUid8(null)).toBe('');
    expect(toUid8('')).toBe('');
  });
});

describe('initialOf', () => {
  it('取姓名第一個字', () => {
    expect(initialOf('王小明')).toBe('王');
  });

  it('前後空白不算字', () => {
    expect(initialOf('  李四')).toBe('李');
  });

  it('罕用字（代理對）整個字取出不切半', () => {
    expect(initialOf('𠀀明')).toBe('𠀀');
  });

  it('無姓名時回空字串', () => {
    expect(initialOf(null)).toBe('');
    expect(initialOf('   ')).toBe('');
  });
});

describe('writeAuthHint／readAuthHint', () => {
  it('寫入後讀回同形狀並帶版本與時間', () => {
    const s = memoryStorage();
    writeAuthHint(
      { kind: 'member', initial: '王', uid8: '1a2b3c4d', next: null },
      s,
      1730000000000,
    );
    expect(JSON.parse(s.getItem(AUTH_HINT_KEY) as string)).toEqual({
      v: 1,
      kind: 'member',
      initial: '王',
      uid8: '1a2b3c4d',
      next: null,
      at: 1730000000000,
    });
    expect(readAuthHint(s)).toEqual({
      v: 1,
      kind: 'member',
      initial: '王',
      uid8: '1a2b3c4d',
      next: null,
      at: 1730000000000,
    });
  });

  it('funnel 提示保留 next 目的地種類', () => {
    const s = memoryStorage();
    writeAuthHint({ kind: 'funnel', initial: '', uid8: '1a2b3c4d', next: 'result' }, s, 1);
    expect(readAuthHint(s)?.next).toBe('result');
  });

  it('member 提示的 next 一律存成 null', () => {
    const s = memoryStorage();
    writeAuthHint({ kind: 'member', initial: '王', uid8: '1a2b3c4d', next: 'checkout' }, s, 1);
    expect(readAuthHint(s)?.next).toBeNull();
  });

  it('不存 email、isAdmin 等其他欄位', () => {
    const s = memoryStorage();
    writeAuthHint(
      { kind: 'member', initial: '王', uid8: '1a2b3c4d', next: null, email: 'a@b.c' } as never,
      s,
      1,
    );
    expect(Object.keys(JSON.parse(s.getItem(AUTH_HINT_KEY) ?? '{}')).sort()).toEqual(
      ['at', 'initial', 'kind', 'next', 'uid8', 'v'].sort(),
    );
  });

  it('無提示時回 null', () => {
    expect(readAuthHint(memoryStorage())).toBeNull();
  });

  it.each([
    ['壞 JSON', '{not json'],
    [
      '未知版本',
      JSON.stringify({ v: 2, kind: 'member', initial: '王', uid8: 'x', next: null, at: 1 }),
    ],
    [
      '未知 kind',
      JSON.stringify({ v: 1, kind: 'admin', initial: '王', uid8: 'x', next: null, at: 1 }),
    ],
    [
      '未知 next',
      JSON.stringify({ v: 1, kind: 'funnel', initial: '', uid8: 'x', next: 'pay', at: 1 }),
    ],
    [
      '欄位型別錯',
      JSON.stringify({ v: 1, kind: 'member', initial: 1, uid8: 'x', next: null, at: 1 }),
    ],
    ['非物件', '"member"'],
  ])('%s 視同無提示並移除', (_label, raw) => {
    const s = memoryStorage({ [AUTH_HINT_KEY]: raw });
    expect(readAuthHint(s)).toBeNull();
    expect(s.getItem(AUTH_HINT_KEY)).toBeNull();
  });

  it('storage 擲例外時讀回 null、寫入與清除不擲出', () => {
    const s = memoryStorage({}, true);
    expect(readAuthHint(s)).toBeNull();
    expect(() =>
      writeAuthHint({ kind: 'member', initial: '王', uid8: 'x', next: null }, s, 1),
    ).not.toThrow();
    expect(() => clearAuthHint(s)).not.toThrow();
  });

  it('storage 不存在時讀回 null', () => {
    expect(readAuthHint(null)).toBeNull();
  });
});

describe('clearAuthHint', () => {
  it('移除提示鍵', () => {
    const s = memoryStorage();
    writeAuthHint({ kind: 'member', initial: '王', uid8: 'x', next: null }, s, 1);
    clearAuthHint(s);
    expect(s.getItem(AUTH_HINT_KEY)).toBeNull();
  });
});

describe('loadAuthHint', () => {
  const legacyMember = {
    id: UID,
    name: '王小明',
    phone: '0912345678',
    birthDate: '1990-01-01',
    registrationStep: 3,
    accountStatus: 'active',
    subscriptionEndDate: '2027-01-01',
    isAdmin: false,
  };

  it('已有提示時原樣回傳並清掉舊 user 與 pendingSession', () => {
    const s = memoryStorage({ user: JSON.stringify(legacyMember), pendingSession: '{}' });
    writeAuthHint({ kind: 'funnel', initial: '', uid8: 'ffffffff', next: 'checkout' }, s, 1);
    expect(loadAuthHint(s)?.uid8).toBe('ffffffff');
    expect(s.getItem('user')).toBeNull();
    expect(s.getItem('pendingSession')).toBeNull();
  });

  it('無提示但有舊會員 user 時遷移成 member 提示', () => {
    const s = memoryStorage({ user: JSON.stringify(legacyMember) });
    const hint = loadAuthHint(s);
    expect(hint).toMatchObject({
      v: 1,
      kind: 'member',
      initial: '王',
      uid8: '1a2b3c4d',
      next: null,
    });
    expect(readAuthHint(s)).toMatchObject({ kind: 'member', uid8: '1a2b3c4d' });
    expect(s.getItem('user')).toBeNull();
  });

  it('舊 user 是首購未付款者時遷移成 funnel 提示並帶 next', () => {
    const s = memoryStorage({
      user: JSON.stringify({
        ...legacyMember,
        registrationStep: 1,
        accountStatus: 'expired',
        subscriptionEndDate: null,
      }),
    });
    expect(loadAuthHint(s)).toMatchObject({ kind: 'funnel', next: 'checkout' });
  });

  it('舊 user 壞掉或缺 id 時不遷移、照樣清除', () => {
    for (const raw of ['{bad', JSON.stringify({ name: '王' })]) {
      const s = memoryStorage({ user: raw });
      expect(loadAuthHint(s)).toBeNull();
      expect(s.getItem('user')).toBeNull();
      expect(s.getItem(AUTH_HINT_KEY)).toBeNull();
    }
  });

  it('什麼都沒有時回 null', () => {
    expect(loadAuthHint(memoryStorage())).toBeNull();
  });

  it('storage 擲例外時回 null 不擲出', () => {
    expect(loadAuthHint(memoryStorage({}, true))).toBeNull();
  });
});
