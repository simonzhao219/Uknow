/**
 * 推薦碼正規化——「什麼算同一個碼」的單一事實來源。
 *
 * NFKC 把全形英數摺成半形(８→8、Ａ→A),再轉小寫、去頭尾空白。
 * 順序不可顛倒:U+3000(全形空白)要先被 NFKC 摺成半形空白,才接得到 trim。
 *
 * **為什麼不能只用 `toLowerCase()`**:它只處理大小寫,對全形數字是
 * identity(`'８'.toLowerCase() === '８'`)。而全形是中文輸入法的標準模式,
 * 推薦碼自 2026-09 起是純數字流水號(規格書 §7.1)——碼短、可口述,手動
 * 輸入是主要路徑。少了這步,全形碼會靜默變成「推薦碼不存在或已失效」,
 * 與使用者真的打錯碼在系統中完全同形,任何閘門都分不出來。
 *
 * **idempotent**,可安全放進 `useImeComposition` 的 `onCommit`——組字結束後
 * 依瀏覽器不同會被連呼兩次(見該 hook 的檔頭)。
 *
 * **正規化必須落在 state 層,不能只在送出時做**:`CompleteProfile` 用
 * `formData.referralCode === verifiedReferralCode` 判斷「驗證後有沒有被改過」。
 * 只在送出處正規化的話,state 存原始值、送出送正規化值,這個判準會永遠
 * 不成立,使用者卡在「請先驗證推薦碼」出不去。
 *
 * 後端 `supabase/functions/api/index.ts` 有同語意的正規化——Deno 與 Vite 是
 * 獨立 runtime,無法共用模組,兩邊要一起改。
 */
export function normalizeReferralCode(raw: string | null | undefined): string {
  return (raw ?? '').normalize('NFKC').toLowerCase().trim();
}
