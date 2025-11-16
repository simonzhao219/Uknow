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
