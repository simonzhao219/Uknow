import { beforeEach, describe, expect, it } from 'vitest';
import type { PublicListingRow } from '../types/listing';
import {
  DEFAULT_HOME_FILTERS,
  getCachedCoords,
  getCachedFilters,
  getCachedListing,
  getCachedListings,
  getSavedScrollY,
  resetHomeListingsCache,
  resetHomeView,
  saveScrollY,
  setCachedCoords,
  setCachedFilters,
  setCachedListings,
} from './homeListingsCache';

const row = (id: string) => ({ id, name: id }) as unknown as PublicListingRow;

beforeEach(() => resetHomeListingsCache());

describe('homeListingsCache', () => {
  it('冷啟動時清單、座標為 null，篩選為預設，捲動為 0', () => {
    expect(getCachedListings()).toBeNull();
    expect(getCachedCoords()).toBeNull();
    expect(getCachedFilters()).toEqual(DEFAULT_HOME_FILTERS);
    expect(getSavedScrollY()).toBe(0);
  });

  it('清單寫入後可整批讀回，並能依 id 取單筆', () => {
    setCachedListings([row('a'), row('b')]);
    expect(getCachedListings()).toHaveLength(2);
    expect(getCachedListing('b')?.id).toBe('b');
  });

  it('id 不存在或為 undefined 時 getCachedListing 回 null', () => {
    setCachedListings([row('a')]);
    expect(getCachedListing('zzz')).toBeNull();
    expect(getCachedListing(undefined)).toBeNull();
  });

  it('座標寫入後可讀回', () => {
    setCachedCoords({ lat: 22.6, lng: 120.3 });
    expect(getCachedCoords()).toEqual({ lat: 22.6, lng: 120.3 });
  });

  it('性別與地區篩選寫入後原樣讀回', () => {
    const next = {
      searchQuery: '剪髮',
      category: '美髮',
      genders: ['女', '男'],
      districtsByCity: { 高雄市: ['全區'], 台北市: ['大安區'] },
    };
    setCachedFilters(next);
    expect(getCachedFilters().genders).toEqual(['女', '男']);
    expect(getCachedFilters().districtsByCity).toEqual({ 高雄市: ['全區'], 台北市: ['大安區'] });
    expect(getCachedFilters()).toEqual(next);
  });

  it('捲動位置寫入後可讀回', () => {
    saveScrollY(480);
    expect(getSavedScrollY()).toBe(480);
  });

  it('resetHomeView 清掉篩選與捲動，但保留清單與座標', () => {
    setCachedListings([row('a')]);
    setCachedCoords({ lat: 1, lng: 2 });
    setCachedFilters({ ...DEFAULT_HOME_FILTERS, searchQuery: 'x', genders: ['女'] });
    saveScrollY(300);

    resetHomeView();

    expect(getCachedFilters()).toEqual(DEFAULT_HOME_FILTERS);
    expect(getSavedScrollY()).toBe(0);
    expect(getCachedListings()).toHaveLength(1);
    expect(getCachedCoords()).toEqual({ lat: 1, lng: 2 });
  });

  it('resetHomeListingsCache 回到冷啟動狀態', () => {
    setCachedListings([row('a')]);
    setCachedCoords({ lat: 1, lng: 2 });
    saveScrollY(9);
    resetHomeListingsCache();
    expect(getCachedListings()).toBeNull();
    expect(getCachedCoords()).toBeNull();
    expect(getSavedScrollY()).toBe(0);
  });
});
