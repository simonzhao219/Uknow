// 自訂服務類別的領域規則。這裡釘住的是三件「壞掉時很難從畫面看出來」的事:
//
//   1. **收斂**(A4):「美髮 」與「美髮」不能變成兩個類別。類別詞彙推導自
//      `group by category`,而那是逐字元比對——正規化一旦失效,篩選器會長出
//      兩顆看起來一模一樣的 chip,各自篩到不同的刊登。
//   2. **內建類別不進自訂區**(A10):view 的 `group by` 回傳的是**所有**類別,
//      含內建 30 項。少了這道扣除,下拉選單裡「美髮」會出現兩次。
//   3. **當前值一定在選項裡**(A9):編輯一筆自訂類別的刊登時,若下拉選單配不到
//      對應的 SelectItem,Radix 會顯示成未選擇——使用者以為類別被清空而手動
//      重選,原本的自訂類別就被覆蓋掉了。那是真實的資料損失,不是視覺瑕疵。
import { describe, it, expect } from 'vitest';
import { SERVICE_CATEGORIES } from './constants';
import {
  CUSTOM_CATEGORY_MAX_LENGTH,
  CUSTOM_CATEGORY_SENTINEL,
  allKnownCategories,
  deriveCustomCategories,
  findCanonicalCategory,
  normalizeCategoryInput,
  validateCustomCategory,
} from './serviceCategories';

describe('normalizeCategoryInput', () => {
  it('去掉頭尾空白', () => {
    expect(normalizeCategoryInput('  寵物美容  ')).toBe('寵物美容');
  });

  it('內部連續空白收成一個半形空格', () => {
    expect(normalizeCategoryInput('寵物   美容')).toBe('寵物 美容');
  });

  it('全形空白與換行同樣被收斂', () => {
    expect(normalizeCategoryInput('寵物　\n美容')).toBe('寵物 美容');
  });

  it('只有空白時收斂成空字串', () => {
    expect(normalizeCategoryInput('   　  ')).toBe('');
  });
});

describe('findCanonicalCategory', () => {
  it('只差頭尾空白時對應到既有類別', () => {
    expect(findCanonicalCategory(' 美髮 ', SERVICE_CATEGORIES)).toBe('美髮');
  });

  it('全形英數對應到既有的半形寫法', () => {
    expect(findCanonicalCategory('ＳＰＡ', ['SPA'])).toBe('SPA');
  });

  it('大小寫不同時對應到既有寫法', () => {
    expect(findCanonicalCategory('spa', ['SPA'])).toBe('SPA');
  });

  it('真的是新類別時回 null', () => {
    expect(findCanonicalCategory('寵物溝通', SERVICE_CATEGORIES)).toBeNull();
  });

  it('空輸入回 null，不會誤配到任何類別', () => {
    expect(findCanonicalCategory('   ', SERVICE_CATEGORIES)).toBeNull();
  });
});

describe('validateCustomCategory', () => {
  it('空白輸入被拒並要求輸入', () => {
    const result = validateCustomCategory('  ', SERVICE_CATEGORIES);
    expect(result.error).toBe('請輸入自訂類別');
    expect(result.value).toBe('');
  });

  it('超過上限被拒', () => {
    const tooLong = '寵'.repeat(CUSTOM_CATEGORY_MAX_LENGTH + 1);
    expect(validateCustomCategory(tooLong, SERVICE_CATEGORIES).error).toContain(
      String(CUSTOM_CATEGORY_MAX_LENGTH),
    );
  });

  it('剛好等於上限可通過', () => {
    const exact = '寵'.repeat(CUSTOM_CATEGORY_MAX_LENGTH);
    const result = validateCustomCategory(exact, SERVICE_CATEGORIES);
    expect(result.error).toBeNull();
    expect(result.value).toBe(exact);
  });

  it('冒用 sentinel 被拒（否則下拉選單的選取邏輯會誤判）', () => {
    const result = validateCustomCategory(CUSTOM_CATEGORY_SENTINEL, SERVICE_CATEGORIES);
    expect(result.error).not.toBeNull();
    expect(result.value).toBe('');
  });

  it('冒用篩選器保留字「全部類別」被拒', () => {
    expect(validateCustomCategory('全部類別', SERVICE_CATEGORIES).error).not.toBeNull();
  });

  it('新類別原樣通過並保留使用者打的字', () => {
    const result = validateCustomCategory(' 寵物溝通 ', SERVICE_CATEGORIES);
    expect(result.error).toBeNull();
    expect(result.value).toBe('寵物溝通');
    expect(result.matchedExisting).toBeNull();
  });

  it('與既有類別等價時收斂過去，並回報收斂對象供 UI 提示', () => {
    const result = validateCustomCategory('美髮 ', SERVICE_CATEGORIES);
    expect(result.error).toBeNull();
    expect(result.value).toBe('美髮');
    expect(result.matchedExisting).toBe('美髮');
  });

  it('逐字相同時不回報收斂（沒有改寫就不必提示）', () => {
    expect(validateCustomCategory('美髮', SERVICE_CATEGORIES).matchedExisting).toBeNull();
  });

  it('與其他人建立的自訂類別等價時同樣收斂', () => {
    const known = [...SERVICE_CATEGORIES, '寵物美容'];
    expect(validateCustomCategory(' 寵物美容', known).value).toBe('寵物美容');
  });
});

describe('deriveCustomCategories', () => {
  it('扣除內建類別，只留真正的自訂類別', () => {
    const rows = [
      { category: '美髮', listing_count: 12 },
      { category: '寵物美容', listing_count: 3 },
    ];
    expect(deriveCustomCategories(rows)).toEqual(['寵物美容']);
  });

  it('依使用數由多到少排序', () => {
    const rows = [
      { category: '寵物溝通', listing_count: 1 },
      { category: '寵物美容', listing_count: 5 },
    ];
    expect(deriveCustomCategories(rows)).toEqual(['寵物美容', '寵物溝通']);
  });

  it('使用數相同時以字序穩定收斂，不隨回傳順序跳動', () => {
    const rows = [
      { category: '甲類', listing_count: 2 },
      { category: '乙類', listing_count: 2 },
    ];
    expect(deriveCustomCategories(rows)).toEqual(deriveCustomCategories(rows.slice().reverse()));
  });

  it('沒有任何自訂類別時回空陣列', () => {
    expect(deriveCustomCategories([{ category: '美髮', listing_count: 1 }])).toEqual([]);
  });

  it('不修改傳入的陣列', () => {
    const rows = [
      { category: '乙類', listing_count: 1 },
      { category: '甲類', listing_count: 9 },
    ];
    const snapshot = rows.map((row) => row.category);
    deriveCustomCategories(rows);
    expect(rows.map((row) => row.category)).toEqual(snapshot);
  });
});

describe('allKnownCategories', () => {
  it('內建類別在前且維持規格書的順序', () => {
    const merged = allKnownCategories(['寵物美容']);
    expect(merged.slice(0, SERVICE_CATEGORIES.length)).toEqual(SERVICE_CATEGORIES);
  });

  it('自訂類別接在內建之後', () => {
    expect(allKnownCategories(['寵物美容']).at(-1)).toBe('寵物美容');
  });

  it('當前值不在清單裡時仍被併入（A9：編輯頁的下拉一定配得到選項）', () => {
    expect(allKnownCategories([], '寵物溝通')).toContain('寵物溝通');
  });

  it('自訂類別清單尚未載入時，當前值依然在選項裡', () => {
    const merged = allKnownCategories([], '寵物美容');
    expect(merged).toContain('寵物美容');
  });

  it('當前值已在清單裡時不重複收錄', () => {
    const merged = allKnownCategories(['寵物美容'], '寵物美容');
    expect(merged.filter((category) => category === '寵物美容')).toHaveLength(1);
  });

  it('當前值為空字串時不產生空選項（Radix Select 不接受空值）', () => {
    expect(allKnownCategories([], '')).not.toContain('');
  });
});
