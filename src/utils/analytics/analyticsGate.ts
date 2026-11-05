// 啟用判斷與錄影閘門——entry 靜態引用，所以刻意極小（不得 import SDK 或 analyticsConfig）。

// 與 config/posthogTarget.ts 的 PLACEHOLDER_POSTHOG_KEY 同前綴（src 不 import config/；
// 兩處一致性的交叉測試在階段 3 補上）。
const PLACEHOLDER_PREFIX = 'phc_PLACEHOLDER';

/** 錄影一律不啟動的路徑第一段（W4-37 付款頁、W5-36① 後台）。 */
const NO_RECORDING_SEGMENTS = new Set(['payment', 'admin']);

/** 執行期：key 有值且不是佔位值才啟用（建置期 resolvePosthogTarget 已做完分支判斷）。 */
export function analyticsEnabled(key: string | undefined): boolean {
  return Boolean(key) && !key?.startsWith(PLACEHOLDER_PREFIX);
}

/** 這個路徑可不可以錄影。`/payment/*` 與 `/admin*` 一律不錄；只比第一段、不分大小寫。 */
export function recordingAllowed(pathname: string): boolean {
  const raw = pathname.split('/')[1] ?? '';
  // React Router 會把百分比編碼解碼後再比對路由（/%61dmin 會進後台頁），所以這裡也先解碼。
  let first = raw;
  try {
    first = decodeURIComponent(raw);
  } catch {
    // 格式錯誤的編碼：路由比對不到禁錄頁，沿用原字串即可。
  }
  return !NO_RECORDING_SEGMENTS.has(first.toLowerCase());
}
