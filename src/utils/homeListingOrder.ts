// 首頁清單的「篩選＋排序」純函式——HomePage 與（日後）換篇脈絡共用同一個來源。
// 搜尋、類別、性別、地區篩選；有座標時由近到遠排序，沒座標保留輸入順序（created_at 倒序）。
import type { PublicListingRow } from '../types/listing';
import { calculateDistance, cityCoordinates } from './distance';
import { listingMatchesDistricts } from './districtSelection';
import type { Coords, HomeFilters } from './homeListingsCache';
import type { DistrictTable } from './listingDistanceOrder';
import { listingMatchesSearch } from './listingSearch';

export function filterAndSortListings(
  listings: PublicListingRow[],
  filters: HomeFilters,
  coords: Coords | null,
  _table: DistrictTable | null,
): PublicListingRow[] {
  const { searchQuery, category, genders, districtsByCity } = filters;
  const selectedCities = Object.keys(districtsByCity);

  const filtered = listings.filter((listing) => {
    // 關鍵字搜尋（名稱／服務介紹／服務類別），判定見 utils/listingSearch.ts。
    if (!listingMatchesSearch(searchQuery, listing)) return false;

    // 服務類別篩選（單選）
    if (category && listing.category !== category) return false;

    // 性別篩選（使用後端的 gender 欄位）
    if (genders.length > 0) {
      if (!listing.gender || !genders.includes(listing.gender)) return false;
    }

    // 地區篩選：縣市層先比對，區層交由縣市 scope 的判定（該市勾全區或區清空＝該市全過；
    // 具體區要有交集；同名區不跨市誤配）。
    if (selectedCities.length > 0) {
      if (!selectedCities.includes(listing.city)) return false;
      if (!listingMatchesDistricts(districtsByCity, listing.city, listing.districts)) return false;
    }

    return true;
  });

  // 僅在取得使用者真實定位後，才依「由近到遠」排序；未授權／不支援時保留
  // 後端的最新（created_at desc）排序，不假裝依距離。
  if (!coords) return filtered;
  return [...filtered].sort((a, b) => {
    const aCoords = cityCoordinates[a.city];
    const bCoords = cityCoordinates[b.city];
    if (!aCoords && !bCoords) return 0;
    if (!aCoords) return 1;
    if (!bCoords) return -1;
    return (
      calculateDistance(coords.lat, coords.lng, aCoords.lat, aCoords.lng) -
      calculateDistance(coords.lat, coords.lng, bCoords.lat, bCoords.lng)
    );
  });
}
