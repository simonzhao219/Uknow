// 「我的 QR」面板分頁偏好的持久化 —— 面板有兩個分頁：
//   - 'invite'：邀請好友（長效推薦 QR，給朋友掃了直接註冊）
//   - 'verify'：會員核身碼（動態短效碼，出示給店家掃描核身）
//
// 記住上次選擇的理由：同一個人的使用習慣通常固定（常分享的人每次都要邀請頁、
// 常被核身的人每次都要核身頁），每次都要重切一次是純粹的摩擦。
//
// 設計沿用 homeViewMode.ts 的慣例（它又沿用 formDraft.ts）：
//   1. 純函式核心不碰全域，node 環境可直接測。
//   2. 儲存體以參數注入（StorageLike），預設 localStorage —— 但所有存取都包
//      try/catch，Safari 無痕模式存取 localStorage 會直接拋錯。
//   3. 讀取一律經過 normalize：非法值收斂回預設，不讓髒資料害整個面板炸掉。

export type MyQrTab = 'invite' | 'verify';

// 預設「邀請好友」：這是主動、頻繁的動作（想分享才會打開面板）；核身碼則多半是
// 店家開口要的當下才需要，且未加入推薦計畫的人根本看不到邀請分頁（那時只剩核身碼，
// resolveMyQrTab 會處理）。
export const DEFAULT_MY_QR_TAB: MyQrTab = 'invite';

export const MY_QR_TAB_KEY = 'uknow:pref:my-qr-tab';

// 只需要 get / set；注入假物件即可在 node 下測試（不需 jsdom）。
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 把任意值收斂成合法的 MyQrTab；無法辨識一律回預設。 */
export function normalizeMyQrTab(raw: unknown): MyQrTab {
  return raw === 'invite' || raw === 'verify' ? raw : DEFAULT_MY_QR_TAB;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 讀取偏好。任何失敗（無儲存體／存取拋錯／髒資料）都安全地回預設。 */
export function readMyQrTab(storage: StorageLike | null = defaultStorage()): MyQrTab {
  if (!storage) return DEFAULT_MY_QR_TAB;
  try {
    return normalizeMyQrTab(storage.getItem(MY_QR_TAB_KEY));
  } catch {
    return DEFAULT_MY_QR_TAB;
  }
}

/** 寫入偏好。失敗（配額爆掉／無痕模式）靜默吞掉——記不住偏好不該中斷切換。 */
export function writeMyQrTab(tab: MyQrTab, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(MY_QR_TAB_KEY, tab);
  } catch {
    /* 忽略：偏好無法持久化不影響本次切換 */
  }
}

/**
 * 決定面板開啟時該停在哪個分頁。
 *
 * 未加入推薦計畫（或還沒有推薦碼）時**只有核身碼一個分頁**，這時不論偏好記的是
 * 什麼都必須回 'verify'——否則會停在一個根本不存在的分頁上，畫面空白。
 * 這個判斷刻意獨立成純函式：它是「偏好」與「當下可用分頁」兩件事的交會點，
 * 放在元件裡就只能靠 e2e 才驗得到。
 */
export function resolveMyQrTab(canInvite: boolean, preferred: MyQrTab): MyQrTab {
  return canInvite ? preferred : 'verify';
}
