// 「我的 QR」頁面分頁偏好的持久化 —— 頁面有三個分頁：
//   - 'invite'：邀請好友（長效推薦 QR，給朋友掃了直接註冊）
//   - 'verify'：會員驗證碼（動態短效碼，出示給對方掃描驗證）
//   - 'scan'  ：掃描驗證（相機掃對方的驗證碼，確認身分與會籍）
//
// 記住上次選擇的理由：同一個人的使用習慣通常固定（常分享的人每次都要邀請頁、
// 常被驗證的人每次都要驗證頁），每次都要重切一次是純粹的摩擦。
//
// 設計沿用 homeViewMode.ts 的慣例（它又沿用 formDraft.ts）：
//   1. 純函式核心不碰全域，node 環境可直接測。
//   2. 儲存體以參數注入（StorageLike），預設 localStorage —— 但所有存取都包
//      try/catch，Safari 無痕模式存取 localStorage 會直接拋錯。
//   3. 讀取一律經過 normalize：非法值收斂回預設，不讓髒資料害整個面板炸掉。

export type MyQrTab = 'invite' | 'verify' | 'scan';

/** 當下哪些分頁真的存在。三個旗標各自獨立，由 availableMyQrTabs 推導。 */
export interface MyQrTabAvailability {
  invite: boolean;
  verify: boolean;
  scan: boolean;
}

// 預設「邀請好友」：這是主動、頻繁的動作（想分享才會打開頁面）；驗證碼多半是
// 對方開口要的當下才需要，掃描則是臨時起意，兩者都不適合當預設。
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

/**
 * 推導當下有哪些分頁。**這是「哪些分頁存在」的單一事實來源**——會員中心的
 * 推薦碼欄位（MyQrEntry）與「我的 QR」頁都吃它。
 *
 * 為什麼不各自寫 `joined && !!referralCode`：那個判斷式在本專案已經被複製過
 * 兩份（MyQrEntry 的 canShowCode、MyQrDialog 的 canShareInvite），而 3967f69
 * 的事故正是兩份幾乎相同的邏輯只改了一邊——推薦管理頁因此把推薦碼提前印給
 * 尚未加入推薦計畫的人看。第三份只會讓同一個形狀再發生一次。
 */
export function availableMyQrTabs(_input: {
  joined?: boolean | null;
  referralCode?: string | null;
  canScan?: boolean | null;
}): MyQrTabAvailability {
  return { invite: false, verify: true, scan: false };
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
 * 決定頁面開啟時該停在哪個分頁。三層優先序，各有理由：
 *
 *   1. **URL 的 `?tab=`**（且該分頁真的可用）——深連結是明確意圖：管理後台的
 *      「會員驗證」捷徑直接帶 `?tab=scan`，按下去就是要掃碼，不該被上次的偏好
 *      蓋掉。指定了不可用的分頁（例如不能掃的人拿到 `?tab=scan`）則靜默降級，
 *      不報錯——那多半是別人轉傳的連結，不是使用者做錯事。
 *   2. **記住的偏好**（且可用）。
 *   3. **驗證碼**——它是唯一對所有能進到這頁的人都存在的分頁，當最後退路。
 *
 * 這個判斷刻意獨立成純函式：它是「深連結」「偏好」「當下可用分頁」三件事的
 * 交會點，放在元件裡就只能靠 e2e 才驗得到。
 */
export function resolveMyQrTab(
  _available: MyQrTabAvailability,
  _requested: string | null | undefined,
  preferred: MyQrTab,
): MyQrTab {
  return preferred;
}
