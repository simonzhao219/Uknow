import { describe, it, expect } from 'vitest';
import { NAME_CASES } from '@name-cases';
import {
  validateName,
  validateNationalId,
  validatePhone,
  validateBirthDate,
  validateProfileForm,
  type ProfileFormValues,
} from './profileValidation';

describe('validateNationalId', () => {
  it('格式正確的身分證字號通過', () => {
    expect(validateNationalId('A123456789')).toBeUndefined();
    expect(validateNationalId('B234567890')).toBeUndefined();
  });

  it('小寫輸入會先正規化再檢查', () => {
    expect(validateNationalId('a123456789')).toBeUndefined();
  });

  it('事故截圖的 Q777777777 被拒，且訊息說明第 2 碼規則', () => {
    // 這正是使用者遇到的值：第 2 碼是 7，不是 1/2 —— 舊版讓按鈕靜默反灰。
    const err = validateNationalId('Q777777777');
    expect(err).toBeDefined();
    expect(err).toContain('第 2 碼');
  });

  it('缺開頭英文字母被拒', () => {
    expect(validateNationalId('1123456789')).toContain('英文字母開頭');
  });

  it('長度不符被拒', () => {
    expect(validateNationalId('A12345678')).toBeDefined();
    expect(validateNationalId('A1234567890')).toBeDefined();
  });

  it('空值被拒', () => {
    expect(validateNationalId('')).toBe('請輸入身分證字號');
    expect(validateNationalId('   ')).toBe('請輸入身分證字號');
  });
});

describe('validateName', () => {
  const zhOf = (s: string) => validateName(s, 'zh');
  const fgOf = (s: string) => validateName(s, 'foreign');

  it('案例表的中文模式期望值全數符合', () => {
    for (const c of NAME_CASES) {
      const err = zhOf(c.input);
      expect(err === undefined, `「${c.input}」中文模式應${c.zh ? '通過' : '被拒'}`).toBe(c.zh);
    }
  });

  it('案例表的外文模式期望值全數符合', () => {
    for (const c of NAME_CASES) {
      const err = fgOf(c.input);
      expect(err === undefined, `「${c.input}」外文模式應${c.foreign ? '通過' : '被拒'}`).toBe(
        c.foreign,
      );
    }
  });

  it('Peter 在中文模式被拒——切換鈕不是裝飾,預設模式有強制力', () => {
    // v3 審查 P1:原案例表四個不合法值剛好都因含數字或中英混雜而被連帶擋下,
    // 沒有任何一個能暴露「格式工整的英文字串在預設中文模式直接通過」這個盲點。
    expect(zhOf('Peter')).toBeDefined();
    expect(fgOf('Peter')).toBeUndefined();
  });

  it('中文模式的字元錯誤訊息帶切換到外文模式的出口指引', () => {
    const err = zhOf('Peter');
    expect(err).toContain('中文字');
    expect(err).toContain('外文姓名');
  });

  it('間隔號被拒,且訊息明確引導改用半形空格', () => {
    const err = zhOf('谷辣斯·尤達卡');
    expect(err).toContain('半形空格');
  });

  it('視覺相近的其他分隔符號也走同一句引導,不靠碼點清單窮舉', () => {
    // v3 審查 P2:只鎖 U+00B7/U+2027/U+30FB 會讓 bullet、半形中點等變體
    // 退回通用訊息,原地重現同一個死巷。改以「非中文非英數非空格」判定。
    for (const sep of ['‧', '・', '•', '･', '　']) {
      expect(
        zhOf(`谷辣斯${sep}尤達卡`),
        `分隔符號 U+${sep.codePointAt(0)?.toString(16)}`,
      ).toContain('半形空格');
    }
  });

  it('字元合法但超長時回長度訊息,依模式帶入各自上限', () => {
    // v3 審查 P1:這是獨立案例。拿「姓名須為中文字」去回應一個全是合法中文字、
    // 只是太長的輸入,講的是錯的事。
    expect(zhOf('王'.repeat(11))).toBe('姓名最多 10 個字元');
    expect(fgOf(`A${'a'.repeat(50)}`)).toBe('姓名最多 50 個字元');
  });

  it('剛好在上限的長度通過', () => {
    expect(zhOf('王'.repeat(10))).toBeUndefined();
    expect(fgOf(`A${'a'.repeat(49)}`)).toBeUndefined();
  });

  it('空值被拒', () => {
    expect(zhOf('   ')).toBe('請輸入真實姓名');
    expect(fgOf('')).toBe('請輸入真實姓名');
  });

  it('未指定模式時預設為中文', () => {
    expect(validateName('王小明')).toBeUndefined();
    expect(validateName('Peter')).toBeDefined();
  });
});

describe('validatePhone', () => {
  it('合法台灣手機號碼通過', () => {
    expect(validatePhone('0933333333')).toBeUndefined();
  });
  it('非 09 開頭或長度不符被拒', () => {
    expect(validatePhone('0812345678')).toBeDefined();
    expect(validatePhone('093333333')).toBeDefined();
  });
});

describe('validateBirthDate', () => {
  const now = new Date(2026, 6, 19); // 2026-07-19 (local)

  it('今天剛滿 18 歲通過', () => {
    expect(validateBirthDate('2008-07-19', now)).toBeUndefined();
  });

  it('事故截圖的生日通過（兩天前滿 18）', () => {
    expect(validateBirthDate('2008-07-17', now)).toBeUndefined();
  });

  it('明天才滿 18 歲被拒', () => {
    expect(validateBirthDate('2008-07-20', now)).toBe('註冊用戶需年滿 18 歲');
  });

  it('日界線上不受時區影響（無 off-by-one）', () => {
    // 若用 new Date('2008-07-19') 在 UTC- 時區會偏一天；用日期元件比對則穩定。
    expect(validateBirthDate('2008-07-19', now)).toBeUndefined();
  });

  it('空值或格式錯誤被拒', () => {
    expect(validateBirthDate('', now)).toBe('請選擇出生年月日');
    expect(validateBirthDate('not-a-date', now)).toBe('請選擇出生年月日');
  });
});

describe('validateProfileForm', () => {
  const now = new Date(2026, 6, 19);
  const valid: ProfileFormValues = {
    name: '王小明',
    nameMode: 'zh',
    nationalId: 'A123456789',
    phone: '0933333333',
    birthDate: '2008-07-17',
    agreedToTerms: true,
  };

  it('完全合法的表單無錯誤', () => {
    expect(validateProfileForm(valid, now)).toEqual({});
  });

  it('重現事故截圖情境時回報身分證字號錯誤', () => {
    // 全部欄位都填了、條款也勾了，唯一擋住的是身分證第 2 碼。
    const errors = validateProfileForm({ ...valid, nationalId: 'Q777777777' }, now);
    expect(Object.keys(errors)).toEqual(['nationalId']);
    expect(errors.nationalId).toContain('第 2 碼');
  });

  it('姓名模式會傳進 validateName——外文姓名在中文模式下被表單擋住', () => {
    const errors = validateProfileForm({ ...valid, name: 'John Smith' }, now);
    expect(errors.name).toBeDefined();
    expect(validateProfileForm({ ...valid, name: 'John Smith', nameMode: 'foreign' }, now)).toEqual(
      {},
    );
  });

  it('一次標出所有有問題的欄位', () => {
    const errors = validateProfileForm(
      {
        name: '',
        nameMode: 'zh',
        nationalId: 'x',
        phone: '123',
        birthDate: '',
        agreedToTerms: false,
      },
      now,
    );
    expect(errors.name).toBeDefined();
    expect(errors.nationalId).toBeDefined();
    expect(errors.phone).toBeDefined();
    expect(errors.birthDate).toBeDefined();
    expect(errors.agreedToTerms).toBeDefined();
  });
});
