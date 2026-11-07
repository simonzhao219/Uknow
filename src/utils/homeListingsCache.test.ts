import { beforeEach, describe, expect, it } from 'vitest';
import type { PublicListingRow } from '../types/listing';
import {
  DEFAULT_HOME_FILTERS,
  getCachedCoords,
  getCachedFilters,
  getCachedListing,
  freezeBrowseContext,
  getBrowseContext,
  getCachedListings,
  getLastViewedId,
  getSavedScrollY,
  resetHomeListingsCache,
  resetHomeView,
  saveScrollY,
  setCachedCoords,
  setCachedFilters,
  setCachedListings,
  setLastViewedId,
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

describe('browse context（換篇脈絡）', () => {
  it('凍結後可讀回有序 id、進入的那篇與版本', () => {
    const version = freezeBrowseContext(['a', 'b', 'c'], 'b');
    expect(getBrowseContext()).toEqual({ ids: ['a', 'b', 'c'], entryId: 'b', version });
  });

  it('凍結時複製陣列，之後改動來源不影響已凍結的順序', () => {
    const ids = ['a', 'b'];
    freezeBrowseContext(ids, 'a');
    ids.reverse();
    expect(getBrowseContext()?.ids).toEqual(['a', 'b']);
  });

  it('每次凍結都換新版本', () => {
    const v1 = freezeBrowseContext(['a'], 'a');
    const v2 = freezeBrowseContext(['a'], 'a');
    expect(v1).not.toBe(v2);
    expect(v1).not.toBe('');
  });

  it('重新凍結會清掉上一輪最後看的那篇', () => {
    freezeBrowseContext(['a', 'b'], 'a');
    setLastViewedId('b');
    freezeBrowseContext(['a', 'b'], 'b');
    expect(getLastViewedId()).toBeNull();
  });

  it('最後看的那篇可寫入與讀回', () => {
    expect(getLastViewedId()).toBeNull();
    setLastViewedId('b');
    expect(getLastViewedId()).toBe('b');
  });

  it('resetHomeView 清掉最後看的那篇，但保留凍結脈絡', () => {
    const version = freezeBrowseContext(['a', 'b'], 'a');
    setLastViewedId('b');
    resetHomeView();
    expect(getLastViewedId()).toBeNull();
    expect(getBrowseContext()?.version).toBe(version);
  });

  it('resetHomeListingsCache（登出）清掉凍結脈絡與最後看的那篇', () => {
    freezeBrowseContext(['a', 'b'], 'a');
    setLastViewedId('b');
    resetHomeListingsCache();
    expect(getBrowseContext()).toBeNull();
    expect(getLastViewedId()).toBeNull();
  });
});
