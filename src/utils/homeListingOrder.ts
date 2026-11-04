// 階段 1 stub：只求型別過，行為留空（TDD 紅燈用）。
import type { PublicListingRow } from '../types/listing';
import type { HomeFilters, Coords } from './homeListingsCache';

export function filterAndSortListings(
  _listings: PublicListingRow[],
  _filters: HomeFilters,
  _coords: Coords | null,
): PublicListingRow[] {
  return [];
}
