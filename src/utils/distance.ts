// 階段 1 stub：只求型別過，行為留空（TDD 紅燈用）。
export type LatLng = { lat: number; lng: number };

export const cityCoordinates: Record<string, LatLng> = {};

export const calculateDistance = (
  _lat1: number,
  _lng1: number,
  _lat2: number,
  _lng2: number,
): number => 0;
