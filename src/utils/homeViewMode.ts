// 首頁「檢視方式」偏好的持久化 —— 手機首頁可在兩種列表密度間切換：
//   - 'photo'   ：3 欄照片牆（滿版拼貼、類別左上、名字左下），適合「只想刷照片」
//   - 'detailed'：2 欄資訊卡（照片 + 名稱 + 類別 + 地區），適合「想看細節」
//
// 偏好落 localStorage，讓「刷照片派」不必每次進首頁都重切一次；重整 / 回上頁
// 都能沿用上次選擇。設計沿用 formDraft.ts 的慣例：
//   1. 純函式核心（normalizeHomeViewMode）不碰任何全域，node 環境可直接測。
//   2. 儲存體以參數注入（StorageLike），預設用 localStorage —— 但所有存取都
//      包在 try/catch，Safari 無痕模式存取 localStorage 會直接拋錯。
//   3. 讀取一律經過 normalize：非法值收斂回預設，不讓髒資料害整頁炸掉。

export type HomeViewMode = 'photo' | 'detailed';

// 預設 3 欄照片牆：首頁定位是「快速瀏覽找人」，照片優先的密集網格最貼近需求；
// 想看細節的使用者一鍵切到 'detailed' 即可，且偏好會被記住。
export const DEFAULT_HOME_VIEW_MODE: HomeViewMode = 'photo';

export const HOME_VIEW_MODE_KEY = 'uknow:pref:home-view-mode';

// 只需要 get / set 兩個方法；注入假物件即可在 node 下測試（不需 jsdom）。
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// 把任意值收斂成合法的 HomeViewMode；無法辨識一律回預設。
export function normalizeHomeViewMode(raw: unknown): HomeViewMode {
  return raw === 'photo' || raw === 'detailed' ? raw : DEFAULT_HOME_VIEW_MODE;
}

// 解析預設儲存體：瀏覽器環境用 localStorage，其餘（SSR / 測試）回 null。
// 存取本身就可能拋錯（無痕模式），因此整段包 try/catch。
function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

// 讀取偏好。任何失敗（無儲存體 / 存取拋錯 / 髒資料）都安全地回預設模式。
export function readHomeViewMode(
  storage: StorageLike | null = defaultStorage(),
): HomeViewMode {
  if (!storage) return DEFAULT_HOME_VIEW_MODE;
  try {
    return normalizeHomeViewMode(storage.getItem(HOME_VIEW_MODE_KEY));
  } catch {
    return DEFAULT_HOME_VIEW_MODE;
  }
}

// 寫入偏好。寫入失敗（配額爆掉 / 無痕模式）靜默吞掉——偏好記不住是可接受的
// 降級，不該讓切換這個純 UI 動作拋錯中斷。
export function writeHomeViewMode(
  mode: HomeViewMode,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(HOME_VIEW_MODE_KEY, mode);
  } catch {
    /* 忽略：偏好無法持久化不影響本次切換 */
  }
}
