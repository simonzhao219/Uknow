/**
 * 區域選擇邏輯共用函數
 * 統一處理「全區」和具體區域的勾選邏輯
 */

/**
 * 處理區域選擇的核心邏輯
 * @param currentDistricts 當前已選擇的區域陣列
 * @param availableDistricts 該城市所有可用的具體區域陣列（不含「全區」）
 * @param targetDistrict 被點擊的區域名稱（可能是「全區」或具體區域）
 * @param isChecked 勾選狀態（true=勾選, false=取消勾選）
 * @returns 新的區域陣列（已排序，「全區」永遠在第一位）
 */
export function handleDistrictSelection(
  currentDistricts: string[],
  availableDistricts: string[],
  targetDistrict: string,
  isChecked: boolean
): string[] {
  let newDistricts = [...currentDistricts];

  if (targetDistrict === '全區') {
    // 點擊「全區」
    if (isChecked) {
      // 勾選「全區」→ 勾選所有區域 + 全區
      newDistricts = ['全區', ...availableDistricts];
    } else {
      // 取消勾選「全區」→ 清空所有選擇
      newDistricts = [];
    }
  } else {
    // 點擊具體區域
    if (isChecked) {
      // 勾選具體區域
      if (!newDistricts.includes(targetDistrict)) {
        newDistricts.push(targetDistrict);
      }
      
      // 檢查是否所有具體區域都被選中
      const selectedSpecificDistricts = newDistricts.filter(d => d !== '全區');
      if (
        selectedSpecificDistricts.length === availableDistricts.length &&
        availableDistricts.every(d => selectedSpecificDistricts.includes(d))
      ) {
        // 所有具體區域都被選中 → 自動勾選「全區」
        if (!newDistricts.includes('全區')) {
          newDistricts.push('全區');
        }
      }
    } else {
      // 取消勾選具體區域
      newDistricts = newDistricts.filter(d => d !== targetDistrict);
      // 取消任何具體區域時，自動取消「全區」
      newDistricts = newDistricts.filter(d => d !== '全區');
    }
  }

  // 確保「全區」永遠在第一位
  return sortDistrictsWithAllFirst(newDistricts);
}

// ============================================================
// 多縣市選區狀態（HomePage 的地區篩選）。
//
// 為什麼要以縣市為 scope：舊的「不分縣市扁平 string[]」造成三個 bug——
// 「全區」是跨縣市共用字串（勾 A 市全區，B 市的全區也顯示已勾）、
// 取消一市的全區會連坐其他市、台灣多縣市同名區（中山區、東區…）
// 互相誤匹配。以 Record<縣市, 選區[]> 儲存後，每個縣市的「全區」與
// 區選擇天然獨立，單縣市內的勾選語意則沿用上面已有測試的
// handleDistrictSelection。
// ============================================================

export type DistrictSelectionByCity = Record<string, string[]>;

/** 勾/取消一個縣市。勾選時預設帶「全區＋該市所有區」；取消時整個 key 移除。 */
export function toggleCity(
  state: DistrictSelectionByCity,
  city: string,
  checked: boolean,
  availableDistricts: string[],
): DistrictSelectionByCity {
  const next = { ...state };
  if (checked) {
    next[city] = ['全區', ...availableDistricts];
  } else {
    delete next[city];
  }
  return next;
}

/** 勾/取消某縣市的一個區（或「全區」）。只影響該縣市，其他縣市原封不動。 */
export function toggleCityDistrict(
  state: DistrictSelectionByCity,
  city: string,
  availableDistricts: string[],
  district: string,
  checked: boolean,
): DistrictSelectionByCity {
  return {
    ...state,
    [city]: handleDistrictSelection(state[city] ?? [], availableDistricts, district, checked),
  };
}

/** 該縣市目前的選區清單（未選過的縣市回空陣列）。 */
export function cityDistricts(state: DistrictSelectionByCity, city: string): string[] {
  return state[city] ?? [];
}

/**
 * 篩選判定：某刊登（其縣市 + districts 陣列）是否通過該縣市的區選擇。
 * - 該市勾「全區」→ 全過。
 * - 該市勾具體區 → 有交集才過。
 * - 該市已勾但區清空（點掉全區）→ 視為「只按縣市篩」，全過。
 * - 刊登本身標「全區」→ 任何區選擇都過。
 */
export function listingMatchesDistricts(
  state: DistrictSelectionByCity,
  city: string,
  listingDistricts: string[],
): boolean {
  const selected = state[city] ?? [];
  if (selected.length === 0 || selected.includes('全區')) return true;
  if (listingDistricts.includes('全區')) return true;
  return listingDistricts.some((d) => selected.includes(d));
}

/**
 * 排序區域陣列，確保「全區」永遠在第一位
 * @param districts 區域陣列
 * @returns 排序後的區域陣列
 */
export function sortDistrictsWithAllFirst(districts: string[]): string[] {
  const hasAll = districts.includes('全區');
  const otherDistricts = districts.filter(d => d !== '全區');
  
  if (hasAll) {
    return ['全區', ...otherDistricts];
  }
  
  return otherDistricts;
}
