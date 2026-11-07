import { describe, expect, it } from 'vitest';
import type { PublicListingRow } from '../types/listing';
import { filterAndSortListings } from './homeListingOrder';
import { DISTRICT_CENTROIDS } from './districtCentroids';
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
    expect(ids(filterAndSortListings(list, filters(), null, null))).toEqual(['a', 'b', 'c']);
  });

  it('關鍵字命中名稱', () => {
    expect(
      ids(filterAndSortListings(list, filters({ searchQuery: '李小華' }), null, null)),
    ).toEqual(['b']);
  });

  it('類別單選', () => {
    expect(ids(filterAndSortListings(list, filters({ category: '家教' }), null, null))).toEqual([
      'b',
      'c',
    ]);
  });

  it('性別篩選排除未填性別的刊登', () => {
    expect(
      ids(filterAndSortListings(list, filters({ genders: ['女', '男'] }), null, null)),
    ).toEqual(['a', 'b']);
  });

  it('縣市與區篩選交集', () => {
    const f = filters({ districtsByCity: { 新北市: ['板橋區'] } });
    expect(ids(filterAndSortListings(list, f, null, null))).toEqual(['b']);
  });

  it('選了縣市但區清空時該市全過', () => {
    const f = filters({ districtsByCity: { 新北市: [] } });
    expect(ids(filterAndSortListings(list, f, null, null))).toEqual(['b', 'c']);
  });
});

describe('filterAndSortListings：區級距離排序', () => {
  const list = [
    row('kh', { city: '高雄市', districts: ['前鎮區'] }),
    row('tp', { city: '台北市', districts: ['信義區'] }),
    row('tc', { city: '台中市', districts: ['西區'] }),
    row('tp2', { city: '台北市', districts: ['信義區'] }),
  ];
  const taipei = { lat: 25.04, lng: 121.55 };

  it('有座標與座標表時由近到遠，同區維持原順序', () => {
    expect(ids(filterAndSortListings(list, filters(), taipei, DISTRICT_CENTROIDS))).toEqual([
      'tp',
      'tp2',
      'tc',
      'kh',
    ]);
  });

  it('座標在高雄時高雄最前', () => {
    const kaohsiung = { lat: 22.61, lng: 120.31 };
    expect(ids(filterAndSortListings(list, filters(), kaohsiung, DISTRICT_CENTROIDS))[0]).toBe(
      'kh',
    );
  });

  it('座標表尚未載入時維持輸入順序（最新優先）', () => {
    expect(ids(filterAndSortListings(list, filters(), taipei, null))).toEqual([
      'kh',
      'tp',
      'tc',
      'tp2',
    ]);
  });

  it('沒有座標時維持輸入順序（最新優先）', () => {
    expect(ids(filterAndSortListings(list, filters(), null, DISTRICT_CENTROIDS))).toEqual([
      'kh',
      'tp',
      'tc',
      'tp2',
    ]);
  });
});
