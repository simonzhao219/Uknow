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
} from './constants';

describe('listing numeric / photo constants', () => {
  it('has the expected listing form limits', () => {
    expect(NAME_MAX_LENGTH).toBe(10);
    expect(DESCRIPTION_MAX_LENGTH).toBe(200);
  });

  it('caps photos at 3 files of 5MB in jpg/png/webp', () => {
    expect(MAX_PHOTO_SIZE).toBe(5 * 1024 * 1024);
    expect(MAX_PHOTO_SIZE).toBe(5242880);
    expect(MAX_PHOTO_COUNT).toBe(3);
    expect(ALLOWED_PHOTO_FORMATS).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('SERVICE_CATEGORIES', () => {
  it('is non-empty and has no duplicates', () => {
    expect(SERVICE_CATEGORIES.length).toBeGreaterThan(0);
    expect(new Set(SERVICE_CATEGORIES).size).toBe(SERVICE_CATEGORIES.length);
  });
});

describe('TAIWAN_CITIES / TAIWAN_REGIONS consistency', () => {
  it('has no duplicate cities', () => {
    expect(new Set(TAIWAN_CITIES).size).toBe(TAIWAN_CITIES.length);
  });

  it('every city has a region entry (and vice versa)', () => {
    const regionKeys = Object.keys(TAIWAN_REGIONS);
    expect(new Set(regionKeys)).toEqual(new Set(TAIWAN_CITIES));
  });

  it('every city maps to a non-empty list of districts with no duplicates', () => {
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
