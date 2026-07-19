// 「上一頁」返回目標的決策 —— 抽成純函式的單一決策來源。
//
// 事故：法遵文件頁（MarkdownContent）的返回鈕寫死 navigate(-1)，它假設「一定是
// 從 App 內導頁進來、歷史堆疊裡有上一頁可回」。但這假設在三種入口下都不成立：
//   1. 用 target="_blank" 從對話框開新分頁（推薦計畫的兩份文件正是如此）。
//   2. 直接貼網址 / 分享連結開啟。
//   3. 在文件頁按 F5 重整。
// 這些情況下該頁就是分頁歷史的「第一筆」，navigate(-1) 無處可回 → 返回鈕變死鈕。
//
// React Router 對「初次進入、前面沒有 App 內導航」的 location 會給 key === 'default'。
// 據此判斷：有 in-app 歷史才 pop（-1），否則退回安全的首頁，返回鈕永遠有作用。
//
// 註：更治本的方向是「文件用就地彈窗閱讀、根本不需要返回鈕」（見 LegalDialog）；
// 此函式負責的是「仍以獨立路由存在的文件頁」那條路的健壯性。

export const INITIAL_LOCATION_KEY = 'default';

/**
 * @param locationKey  useLocation().key
 * @param fallback     沒有可回的歷史時的去處，預設首頁
 * @returns navigate() 的引數：-1（回上一頁）或 fallback 路徑字串
 */
export function resolveDocBackTarget(
  locationKey: string | undefined,
  fallback: string = '/',
): number | string {
  return locationKey && locationKey !== INITIAL_LOCATION_KEY ? -1 : fallback;
}
