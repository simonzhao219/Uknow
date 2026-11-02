// 登出與換帳號時，清掉本機「屬於某個帳號」的狀態。
//
// 與模組層快取（clearCache、resetHomeListingsCache）分開：這裡只處理 storage 鍵。
// 不清邀請 token／待用推薦碼（訪客帶進來的，登出不該丟）、也不清與帳號無關的偏好
// （首頁檢視模式、推薦網路排序、QR 分頁、公告已讀）。
import { clearProfileDraft } from './formDraft';

/** 含個資或會被下一位使用者誤用的 localStorage 鍵。 */
const ACCOUNT_KEYS = [
  // 提領成功後記下的銀行代碼與帳號（鍵不含 uid；共用裝置會預填給下一位，錢匯錯人）。
  'withdrawalBankData',
  // 註冊／結帳流程暫存的個資 JSON。
  'pendingUser',
  // 升版前的殘留鍵（write-only、零讀者）。
  'user',
  'pendingSession',
];

export function clearAccountLocalState(storage: Storage | null = safeLocal()): void {
  if (storage) {
    for (const key of ACCOUNT_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // 清除失敗無妨：隱私模式下本來就寫不進去。
      }
    }
  }
  // 完善資料頁的草稿（sessionStorage，含姓名電話生日）。
  clearProfileDraft();
}

function safeLocal(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
