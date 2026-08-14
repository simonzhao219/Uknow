import { describe, it, expect } from 'vitest';
import {
  NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  MAX_PHOTO_SIZE,
  MAX_PHOTO_COUNT,
  ALLOWED_PHOTO_FORMATS,
  SERVICE_CATEGORIES,
  TAIWAN_CITIES,
  TAIWAN_REGIONS,
  OFFICIAL_EMAIL,
  OFFICIAL_EMAIL_URL,
} from './constants';

describe('listing numeric / photo constants', () => {
  it('刊登表單的長度上限符合規格', () => {
    expect(NAME_MAX_LENGTH).toBe(10);
    expect(DESCRIPTION_MAX_LENGTH).toBe(200);
  });

  it('照片上限為 3 張、每張 5MB、限 jpg/png/webp', () => {
    expect(MAX_PHOTO_SIZE).toBe(5 * 1024 * 1024);
    expect(MAX_PHOTO_SIZE).toBe(5242880);
    expect(MAX_PHOTO_COUNT).toBe(3);
    expect(ALLOWED_PHOTO_FORMATS).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('OFFICIAL_EMAIL', () => {
  it('官方信箱位址為 service@uknow.com.tw，mailto 由它推導', () => {
    expect(OFFICIAL_EMAIL).toBe('service@uknow.com.tw');
    expect(OFFICIAL_EMAIL_URL).toBe(`mailto:${OFFICIAL_EMAIL}`);
  });
});

describe('SERVICE_CATEGORIES', () => {
  it('非空且無重複項', () => {
    expect(SERVICE_CATEGORIES.length).toBeGreaterThan(0);
    expect(new Set(SERVICE_CATEGORIES).size).toBe(SERVICE_CATEGORIES.length);
  });
});

describe('TAIWAN_CITIES / TAIWAN_REGIONS consistency', () => {
  it('縣市清單無重複', () => {
    expect(new Set(TAIWAN_CITIES).size).toBe(TAIWAN_CITIES.length);
  });

  it('每個縣市都有對應區域，反向亦然', () => {
    const regionKeys = Object.keys(TAIWAN_REGIONS);
    expect(new Set(regionKeys)).toEqual(new Set(TAIWAN_CITIES));
  });

  it('每個縣市都對到非空且無重複的行政區清單', () => {
    for (const city of TAIWAN_CITIES) {
      const districts = TAIWAN_REGIONS[city];
      expect(Array.isArray(districts)).toBe(true);
      expect(districts.length).toBeGreaterThan(0);
      expect(new Set(districts).size).toBe(districts.length);
    }
  });

  it('does not use 全區 as a stored district (it is a UI-only marker)', () => {
    for (const city of TAIWAN_CITIES) {
      expect(TAIWAN_REGIONS[city]).not.toContain('全區');
    }
  });
});
