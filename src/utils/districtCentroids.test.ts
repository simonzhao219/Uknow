import { describe, expect, it } from 'vitest';
import { TAIWAN_CITIES, TAIWAN_REGIONS } from './constants';
import { calculateDistance } from './distance';
import { DISTRICT_CENTROIDS } from './districtCentroids';

const allKeys = Object.entries(TAIWAN_REGIONS).flatMap(([city, districts]) =>
  districts.map((d) => `${city}|${d}`),
);

describe('DISTRICT_CENTROIDS', () => {
  it('鍵集合與 TAIWAN_REGIONS 全部「縣市|區」完全一致', () => {
    expect(Object.keys(DISTRICT_CENTROIDS).sort()).toEqual([...allKeys].sort());
  });

  it('涵蓋 TAIWAN_CITIES 的每個縣市（表的縣市字串與刊登 city 一致）', () => {
    const cities = new Set(Object.keys(DISTRICT_CENTROIDS).map((k) => k.split('|')[0]));
    for (const city of TAIWAN_CITIES) expect(cities.has(city), city).toBe(true);
  });

  it('每個座標都在台灣含離島的範圍內', () => {
    for (const [key, [lat, lng]] of Object.entries(DISTRICT_CENTROIDS)) {
      expect(lat, key).toBeGreaterThanOrEqual(21.8);
      expect(lat, key).toBeLessThanOrEqual(26.5);
      expect(lng, key).toBeGreaterThanOrEqual(118.0);
      expect(lng, key).toBeLessThanOrEqual(122.1);
    }
  });

  it('同名區在不同縣市有各自的座標', () => {
    const a = DISTRICT_CENTROIDS['台北市|中山區'];
    const b = DISTRICT_CENTROIDS['基隆市|中山區'];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(calculateDistance(a[0], a[1], b[0], b[1])).toBeGreaterThan(5);
  });

  it('台北市中正區落在台北車站一帶（抽樣驗證）', () => {
    const [lat, lng] = DISTRICT_CENTROIDS['台北市|中正區'];
    expect(calculateDistance(lat, lng, 25.0478, 121.517)).toBeLessThan(3);
  });
});
