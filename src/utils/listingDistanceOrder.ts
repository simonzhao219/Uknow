// 區級距離排序（W5-24）：使用者座標 → 最近的區中心視為所在區；
// 刊登依「服務使用者所在區」優先，其餘依最近服務區中心的距離。
// 只作排序近似，不是行政區判定。
import { TAIWAN_REGIONS } from './constants';
import { calculateDistance } from './distance';
import type { Coords } from './homeListingsCache';
import type { PublicListingRow } from '../types/listing';

export type DistrictTable = Readonly<Record<string, readonly [number, number]>>;

const ALL_DISTRICTS = '全區';

export function nearestDistrict(
  coords: Coords,
  table: DistrictTable,
): { city: string; district: string } | null {
  let best: string | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const [key, [lat, lng]] of Object.entries(table)) {
    const km = calculateDistance(coords.lat, coords.lng, lat, lng);
    if (km < bestKm) {
      bestKm = km;
      best = key;
    }
  }
  if (!best) return null;
  const [city, district] = best.split('|');
  return { city, district };
}

/** 刊登實際服務的區；「全區」或空陣列＝該縣市全部區。 */
function servedDistricts(row: PublicListingRow): string[] {
  const named = row.districts.filter((d) => d !== ALL_DISTRICTS);
  if (named.length === row.districts.length && named.length > 0) return named;
  return TAIWAN_REGIONS[row.city] ?? named;
}

function score(
  row: PublicListingRow,
  coords: Coords,
  table: DistrictTable,
  user: { city: string; district: string } | null,
): number {
  const served = servedDistricts(row);
  if (user && row.city === user.city && served.includes(user.district)) return -1;
  let min = Number.POSITIVE_INFINITY;
  for (const district of served) {
    const center = table[`${row.city}|${district}`];
    if (!center) continue;
    min = Math.min(min, calculateDistance(coords.lat, coords.lng, center[0], center[1]));
  }
  return min;
}

/** 每筆分數只算一次再穩定排序；同分維持輸入順序（created_at 倒序）。 */
export function sortByDistance(
  rows: PublicListingRow[],
  coords: Coords,
  table: DistrictTable,
): PublicListingRow[] {
  const user = nearestDistrict(coords, table);
  return rows
    .map((row, index) => ({ row, index, s: score(row, coords, table, user) }))
    .sort((a, b) => (a.s === b.s ? a.index - b.index : a.s < b.s ? -1 : 1))
    .map((x) => x.row);
}
