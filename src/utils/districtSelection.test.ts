import { describe, it, expect } from 'vitest';
import { handleDistrictSelection, sortDistrictsWithAllFirst } from './districtSelection';

const AVAILABLE = ['中正區', '大同區', '中山區'];

describe('handleDistrictSelection', () => {
  it('checking 全區 selects 全區 plus every available district', () => {
    const result = handleDistrictSelection([], AVAILABLE, '全區', true);
    expect(result).toEqual(['全區', ...AVAILABLE]);
  });

  it('unchecking 全區 clears everything', () => {
    const result = handleDistrictSelection(['全區', ...AVAILABLE], AVAILABLE, '全區', false);
    expect(result).toEqual([]);
  });

  it('checking a specific district adds it', () => {
    const result = handleDistrictSelection([], AVAILABLE, '中正區', true);
    expect(result).toEqual(['中正區']);
  });

  it('checking the last remaining specific district auto-adds 全區', () => {
    const result = handleDistrictSelection(['中正區', '大同區'], AVAILABLE, '中山區', true);
    // all three specifics selected → 全區 auto-added, sorted first
    expect(result[0]).toBe('全區');
    expect(new Set(result)).toEqual(new Set(['全區', ...AVAILABLE]));
  });

  it('unchecking one specific district also drops 全區', () => {
    const result = handleDistrictSelection(['全區', ...AVAILABLE], AVAILABLE, '中山區', false);
    expect(result).not.toContain('全區');
    expect(result).not.toContain('中山區');
    expect(new Set(result)).toEqual(new Set(['中正區', '大同區']));
  });

  it('checking an already-selected district does not duplicate it', () => {
    const result = handleDistrictSelection(['中正區'], AVAILABLE, '中正區', true);
    expect(result).toEqual(['中正區']);
  });

  it('does not mutate the input array', () => {
    const current = ['中正區'];
    handleDistrictSelection(current, AVAILABLE, '大同區', true);
    expect(current).toEqual(['中正區']);
  });
});

describe('sortDistrictsWithAllFirst', () => {
  it('returns an empty array unchanged', () => {
    expect(sortDistrictsWithAllFirst([])).toEqual([]);
  });

  it('keeps 全區 at index 0', () => {
    expect(sortDistrictsWithAllFirst(['中正區', '全區', '大同區'])).toEqual([
      '全區',
      '中正區',
      '大同區',
    ]);
  });

  it('preserves order of specifics when 全區 is absent', () => {
    expect(sortDistrictsWithAllFirst(['大同區', '中正區'])).toEqual(['大同區', '中正區']);
  });

  it('collapses duplicate 全區 entries to one', () => {
    expect(sortDistrictsWithAllFirst(['全區', '中正區', '全區'])).toEqual(['全區', '中正區']);
  });
});

// ============================================================
// 多縣市選區狀態（HomePage 的地區篩選）。
//
// 背景：HomePage 原以「不分縣市的扁平 string[]」存選區，造成三個
// 已驗證的 bug：(1)「全區」是跨縣市共用字串，勾台北市全區，高雄市
// 的全區也顯示已勾；(2) 取消一個縣市的全區會把共用字串移除，其他
// 縣市的選擇被連坐；(3) 台灣多縣市同名區（中山區、東區…）在扁平
// 陣列中互相誤匹配。這組以縣市為 scope 的純函式是修復的核心。
// ============================================================
import {
  toggleCity,
  toggleCityDistrict,
  cityDistricts,
  listingMatchesDistricts,
  type DistrictSelectionByCity,
} from './districtSelection';

const TAIPEI = ['中正區', '大同區', '中山區'];
const KEELUNG = ['仁愛區', '中山區', '七堵區'];

describe('toggleCity', () => {
  it('勾選縣市時預設帶入全區＋該市所有區', () => {
    const next = toggleCity({}, '台北市', true, TAIPEI);
    expect(next['台北市']).toEqual(['全區', ...TAIPEI]);
  });

  it('取消縣市時整個 key 移除，不影響其他縣市', () => {
    const state: DistrictSelectionByCity = {
      '台北市': ['全區', ...TAIPEI],
      '基隆市': ['全區', ...KEELUNG],
    };
    const next = toggleCity(state, '台北市', false, TAIPEI);
    expect(next['台北市']).toBeUndefined();
    expect(next['基隆市']).toEqual(['全區', ...KEELUNG]);
  });
});

describe('toggleCityDistrict（縣市 scope，互不污染）', () => {
  it('取消 A 市的全區不影響 B 市的全區', () => {
    const state: DistrictSelectionByCity = {
      '台北市': ['全區', ...TAIPEI],
      '基隆市': ['全區', ...KEELUNG],
    };
    const next = toggleCityDistrict(state, '台北市', TAIPEI, '全區', false);
    expect(next['台北市']).toEqual([]);
    expect(next['基隆市']).toEqual(['全區', ...KEELUNG], );
  });

  it('同名區各自獨立：勾台北市中山區不動基隆市', () => {
    const state: DistrictSelectionByCity = { '台北市': [], '基隆市': [] };
    const next = toggleCityDistrict(state, '台北市', TAIPEI, '中山區', true);
    expect(next['台北市']).toEqual(['中山區']);
    expect(next['基隆市']).toEqual([]);
  });

  it('沿用單縣市語意：勾滿所有區自動補全區、取消任一區自動退全區', () => {
    const state: DistrictSelectionByCity = { '台北市': ['中正區', '大同區'] };
    const filled = toggleCityDistrict(state, '台北市', TAIPEI, '中山區', true);
    expect(filled['台北市']).toEqual(['全區', ...TAIPEI]);
    const dropped = toggleCityDistrict(filled, '台北市', TAIPEI, '大同區', false);
    expect(dropped['台北市']).toContain('中正區');
    expect(dropped['台北市']).not.toContain('全區');
  });
});

describe('cityDistricts', () => {
  it('未選過的縣市回空陣列', () => {
    expect(cityDistricts({}, '台北市')).toEqual([]);
  });
});

describe('listingMatchesDistricts（篩選判定）', () => {
  const state: DistrictSelectionByCity = {
    '台北市': ['中山區'],
    '基隆市': ['全區', ...KEELUNG],
    '高雄市': [],
  };

  it('該市勾全區 → 該市所有刊登都過', () => {
    expect(listingMatchesDistricts(state, '基隆市', ['七堵區'])).toBe(true);
  });

  it('該市勾具體區 → 只有交集的刊登過', () => {
    expect(listingMatchesDistricts(state, '台北市', ['中山區'])).toBe(true);
    expect(listingMatchesDistricts(state, '台北市', ['大同區'])).toBe(false);
  });

  it('同名區不跨市誤配：基隆的選擇不會讓台北的大同區刊登通過', () => {
    // 台北只勾中山區；即使基隆勾了全市，台北的大同區刊登仍不該通過
    expect(listingMatchesDistricts(state, '台北市', ['大同區'])).toBe(false);
  });

  it('縣市已勾但區清空（=只按縣市篩）→ 該市全部通過', () => {
    expect(listingMatchesDistricts(state, '高雄市', ['苓雅區'])).toBe(true);
  });

  it('刊登本身標「全區」→ 任何區選擇都通過', () => {
    expect(listingMatchesDistricts(state, '台北市', ['全區'])).toBe(true);
  });
});
