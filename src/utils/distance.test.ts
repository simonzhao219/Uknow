import { describe, expect, it } from 'vitest';
import { TAIWAN_CITIES } from './constants';
import { calculateDistance, cityCoordinates } from './distance';

describe('calculateDistance', () => {
  it('同一點的距離為 0', () => {
    expect(calculateDistance(25.033, 121.5654, 25.033, 121.5654)).toBe(0);
  });

  it('台北到高雄約 296 公里', () => {
    const km = calculateDistance(25.033, 121.5654, 22.6273, 120.3014);
    expect(km).toBeGreaterThan(290);
    expect(km).toBeLessThan(302);
  });

  it('距離與方向無關', () => {
    const ab = calculateDistance(25.033, 121.5654, 24.1477, 120.6736);
    const ba = calculateDistance(24.1477, 120.6736, 25.033, 121.5654);
    expect(ab).toBeCloseTo(ba, 9);
  });
});

describe('cityCoordinates', () => {
  it('涵蓋全部縣市', () => {
    for (const city of TAIWAN_CITIES) {
      expect(cityCoordinates[city], city).toBeDefined();
    }
  });
});
