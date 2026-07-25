import { describe, it, expect } from 'vitest';
import { getGenderDisplay, TEXT_PRESENTATION, type GenderDisplay } from './gender';

describe('TEXT_PRESENTATION', () => {
  it('是 Unicode 文字呈現選擇符 U+FE0E', () => {
    // 這是修正的核心：U+FE0E 強制前一個字元以「文字」而非「emoji」渲染，
    // 避免 iOS Safari 把 ♂/♀ 放大成 emoji 而在 badge 內被裁切。
    expect(TEXT_PRESENTATION).toBe('︎');
    expect(TEXT_PRESENTATION.codePointAt(0)).toBe(0xfe0e);
  });
});

describe('getGenderDisplay', () => {
  it('maps 男 to the male display data', () => {
    const result = getGenderDisplay('男') as GenderDisplay;
    expect(result).not.toBeNull();
    expect(result.value).toBe('男');
    expect(result.label).toBe('男');
    expect(result.iconName).toBe('mars');
    expect(result.colorClass).toBe('border-blue-500 text-blue-600');
  });

  it('maps 女 to the female display data', () => {
    const result = getGenderDisplay('女') as GenderDisplay;
    expect(result).not.toBeNull();
    expect(result.value).toBe('女');
    expect(result.label).toBe('女');
    expect(result.iconName).toBe('venus');
    expect(result.colorClass).toBe('border-pink-500 text-pink-600');
  });

  it('強制 ♂／♀ 以文字呈現，不被畫成 emoji', () => {
    const male = getGenderDisplay('男') as GenderDisplay;
    const female = getGenderDisplay('女') as GenderDisplay;

    // 符號後緊跟 U+FE0E
    expect(male.symbol).toBe('♂︎');
    expect(female.symbol).toBe('♀︎');
    expect(male.symbolWithLabel).toBe('♂︎ 男');
    expect(female.symbolWithLabel).toBe('♀︎ 女');

    // 每個符號字串都必須包含文字呈現選擇器（守住回歸）
    for (const s of [male.symbol, female.symbol, male.symbolWithLabel, female.symbolWithLabel]) {
      expect(s).toContain('︎');
    }
  });

  it('未知、空值與非字串回傳 null，不顯示徽章', () => {
    expect(getGenderDisplay('')).toBeNull();
    expect(getGenderDisplay('其他')).toBeNull();
    expect(getGenderDisplay(undefined)).toBeNull();
    expect(getGenderDisplay(null)).toBeNull();
    expect(getGenderDisplay(0)).toBeNull();
    expect(getGenderDisplay({})).toBeNull();
  });

  it('同一性別回傳穩定參考（共用單例）', () => {
    expect(getGenderDisplay('男')).toBe(getGenderDisplay('男'));
    expect(getGenderDisplay('女')).toBe(getGenderDisplay('女'));
  });
});
