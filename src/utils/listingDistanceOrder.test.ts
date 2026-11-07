import { describe, expect, it } from 'vitest';
import type { PublicListingRow } from '../types/listing';
import { DISTRICT_CENTROIDS } from './districtCentroids';
import { nearestDistrict, sortByDistance } from './listingDistanceOrder';

const row = (id: string, city: string, districts: string[]): PublicListingRow =>
  ({ id, city, districts }) as PublicListingRow;
const ids = (rows: PublicListingRow[]) => rows.map((r) => r.id);
const at = (key: string) => ({ lat: DISTRICT_CENTROIDS[key][0], lng: DISTRICT_CENTROIDS[key][1] });

describe('nearestDistrict', () => {
  it('回傳最近的區中心所屬縣市與區', () => {
    expect(nearestDistrict(at('台北市|大安區'), DISTRICT_CENTROIDS)).toEqual({
      city: '台北市',
      district: '大安區',
    });
  });

  it('同名區以座標分辨縣市', () => {
    expect(nearestDistrict(at('基隆市|中山區'), DISTRICT_CENTROIDS)).toEqual({
      city: '基隆市',
      district: '中山區',
    });
  });

  it('空表時回傳 null', () => {
    expect(nearestDistrict({ lat: 25, lng: 121.5 }, {})).toBeNull();
  });
});

describe('sortByDistance', () => {
  const user = at('台北市|大安區');

  it('服務使用者所在區的刊登排最前', () => {
    const rows = [
      row('far', '台北市', ['北投區']),
      row('here', '台北市', ['大安區', '士林區']),
      row('mid', '台北市', ['信義區']),
    ];
    expect(ids(sortByDistance(rows, user, DISTRICT_CENTROIDS))[0]).toBe('here');
  });

  it('同市「全區」視為服務使用者所在區', () => {
    const rows = [row('near', '台北市', ['信義區']), row('all', '台北市', ['全區'])];
    expect(ids(sortByDistance(rows, user, DISTRICT_CENTROIDS))).toEqual(['all', 'near']);
  });

  it('districts 為空陣列視同全區', () => {
    const rows = [row('near', '台北市', ['信義區']), row('empty', '台北市', [])];
    expect(ids(sortByDistance(rows, user, DISTRICT_CENTROIDS))).toEqual(['empty', 'near']);
  });

  it('其他刊登依最近的服務區中心距離排序', () => {
    const rows = [
      row('kh', '高雄市', ['前鎮區']),
      row('ntp', '新北市', ['板橋區']),
      row('tc', '台中市', ['西區']),
    ];
    expect(ids(sortByDistance(rows, user, DISTRICT_CENTROIDS))).toEqual(['ntp', 'tc', 'kh']);
  });

  it('多個服務區取最近的那一個', () => {
    const rows = [
      row('multi', '新北市', ['瑞芳區', '中和區']),
      row('single', '新北市', ['三峽區']),
    ];
    expect(ids(sortByDistance(rows, user, DISTRICT_CENTROIDS))).toEqual(['multi', 'single']);
  });

  it('同分維持輸入順序', () => {
    const rows = [row('a', '台北市', ['信義區']), row('b', '台北市', ['信義區'])];
    expect(ids(sortByDistance(rows, user, DISTRICT_CENTROIDS))).toEqual(['a', 'b']);
  });

  it('查不到座標的刊登排最後', () => {
    const rows = [row('bad', '不存在市', ['某區']), row('ok', '高雄市', ['前鎮區'])];
    expect(ids(sortByDistance(rows, user, DISTRICT_CENTROIDS))).toEqual(['ok', 'bad']);
  });

  it('部分區名查不到時只計查得到的', () => {
    const rows = [row('half', '新北市', ['不存在區', '板橋區']), row('kh', '高雄市', ['前鎮區'])];
    expect(ids(sortByDistance(rows, user, DISTRICT_CENTROIDS))).toEqual(['half', 'kh']);
  });

  it('不改動傳入的陣列', () => {
    const rows = [row('kh', '高雄市', ['前鎮區']), row('ntp', '新北市', ['板橋區'])];
    const copy = [...rows];
    sortByDistance(rows, user, DISTRICT_CENTROIDS);
    expect(rows).toEqual(copy);
  });
});
