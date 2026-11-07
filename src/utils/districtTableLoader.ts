// 區中心座標表的動態載入與模組層快取：首頁返回時第二次掛載可同步取得，不二次重排。
import type { DistrictTable } from './listingDistanceOrder';

let loaded: DistrictTable | null = null;
let pending: Promise<DistrictTable> | null = null;

export function getLoadedDistrictTable(): DistrictTable | null {
  return loaded;
}

/** 載入失敗時 reject 並清掉 pending（下次進首頁可重試）；呼叫端靜默沿用最新排序。 */
export function loadDistrictTable(): Promise<DistrictTable> {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    pending = import('./districtCentroids')
      .then((m) => {
        loaded = m.DISTRICT_CENTROIDS;
        return loaded;
      })
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}
