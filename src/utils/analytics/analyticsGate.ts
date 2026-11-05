// 啟用判斷與錄影閘門——entry 靜態引用，所以刻意極小（不得 import SDK 或 analyticsConfig）。

/** 執行期：key 有值且不是佔位值才啟用（建置期 resolvePosthogTarget 已做完分支判斷）。 */
export function analyticsEnabled(_key: string | undefined): boolean {
  return true;
}

/** 這個路徑可不可以錄影。`/payment/*` 與 `/admin*` 一律不錄。 */
export function recordingAllowed(_pathname: string): boolean {
  return true;
}
