// 區級距離排序（階段 2）。紅燈期最小 stub，實作見綠燈 commit。
import type { PublicListingRow } from '../types/listing';
import type { Coords } from './homeListingsCache';

export type DistrictTable = Readonly<Record<string, readonly [number, number]>>;

export function nearestDistrict(
  _coords: Coords,
  _table: DistrictTable,
): { city: string; district: string } | null {
  return null;
}

export function sortByDistance(
  rows: PublicListingRow[],
  _coords: Coords,
  _table: DistrictTable,
): PublicListingRow[] {
  return rows;
}
