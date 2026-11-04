import { describe, expect, it } from 'vitest';
import type { PublicListingRow } from '../types/listing';
import { filterAndSortListings } from './homeListingOrder';
import { DEFAULT_HOME_FILTERS, type HomeFilters } from './homeListingsCache';

const row = (id: string, over: Partial<PublicListingRow> = {}): PublicListingRow => ({
  id,
  user_id: `u-${id}`,
  name: `服務者${id}`,
  category: '寵物美容',
  city: '台北市',
  districts: ['全區'],
  gender: '女',
  photos: [],
  contacts: {},
  description: '介紹',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

const ids = (rows: PublicListingRow[]) => rows.map((r) => r.id);
const filters = (over: Partial<HomeFilters> = {}): HomeFilters => ({
  ...DEFAULT_HOME_FILTERS,
  ...over,
});

describe('filterAndSortListings：篩選', () => {
  const list = [
    row('a', { name: '王小明', category: '寵物美容', gender: '男', city: '台北市' }),
    row('b', {
      name: '李小華',
      category: '家教',
      gender: '女',
      city: '新北市',
      districts: ['板橋區'],
    }),
    row('c', {
      name: '陳大文',
      category: '家教',
      gender: null,
      city: '新北市',
      districts: ['中和區'],
    }),
  ];

  it('沒有任何條件時保留原順序', () => {
    expect(ids(filterAndSortListings(list, filters(), null))).toEqual(['a', 'b', 'c']);
  });

  it('關鍵字命中名稱', () => {
    expect(ids(filterAndSortListings(list, filters({ searchQuery: '李小華' }), null))).toEqual([
      'b',
    ]);
  });

  it('類別單選', () => {
    expect(ids(filterAndSortListings(list, filters({ category: '家教' }), null))).toEqual([
      'b',
      'c',
    ]);
  });

  it('性別篩選排除未填性別的刊登', () => {
    expect(ids(filterAndSortListings(list, filters({ genders: ['女', '男'] }), null))).toEqual([
      'a',
      'b',
    ]);
  });

  it('縣市與區篩選交集', () => {
    const f = filters({ districtsByCity: { 新北市: ['板橋區'] } });
    expect(ids(filterAndSortListings(list, f, null))).toEqual(['b']);
  });

  it('選了縣市但區清空時該市全過', () => {
    const f = filters({ districtsByCity: { 新北市: [] } });
    expect(ids(filterAndSortListings(list, f, null))).toEqual(['b', 'c']);
  });
});

describe('filterAndSortListings：縣市級距離排序（階段 2 改區級前的既有行為）', () => {
  const list = [
    row('kh', { city: '高雄市' }),
    row('tp', { city: '台北市' }),
    row('tc', { city: '台中市' }),
    row('tp2', { city: '台北市' }),
  ];

  it('有座標時由近到遠，同縣市維持原順序', () => {
    const taipei = { lat: 25.04, lng: 121.55 };
    expect(ids(filterAndSortListings(list, filters(), taipei))).toEqual(['tp', 'tp2', 'tc', 'kh']);
  });

  it('座標在高雄時高雄最前', () => {
    const kaohsiung = { lat: 22.63, lng: 120.3 };
    expect(ids(filterAndSortListings(list, filters(), kaohsiung))[0]).toBe('kh');
  });

  it('查不到縣市座標的刊登排最後', () => {
    const odd = [row('x', { city: '不存在市' }), row('tp')];
    expect(ids(filterAndSortListings(odd, filters(), { lat: 25.04, lng: 121.55 }))).toEqual([
      'tp',
      'x',
    ]);
  });

  it('沒有座標時維持輸入順序（最新優先）', () => {
    expect(ids(filterAndSortListings(list, filters(), null))).toEqual(['kh', 'tp', 'tc', 'tp2']);
  });

  it('不改動傳入的陣列', () => {
    const copy = [...list];
    filterAndSortListings(list, filters(), { lat: 25.04, lng: 121.55 });
    expect(list).toEqual(copy);
  });
});
