// CSV 產生的共用工具。
//
// 存在理由:後台的提領匯出是拿去做銀行匯款的清單,欄位裡只要出現逗號或
// 引號就會整份錯位——而錯位的匯款清單比匯不出來危險得多。

// 試算表會把以這些字元開頭的儲存格當公式執行(CSV injection)。加一個前導
// 單引號讓它退回純文字;單引號本身不會顯示在儲存格裡。
// `\t` 與 `\r` 一併納入:Excel 會先修剪前置空白再判斷是不是公式。
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

// RFC 4180:欄位含分隔符、引號或換行時必須以雙引號包起。
const NEEDS_QUOTING = /[",\n\r]/;

// Excel 開 UTF-8 CSV 需要 BOM,否則中文全變亂碼。
const BOM = '﻿';

/**
 * 把單一欄位值轉成安全的 CSV 欄位。
 *
 * **數字型別刻意不套公式跳脫**——匯出的金額欄要維持可計算,把 `-15` 變成
 * `'-15` 會讓整欄變文字、加總失效。公式注入的來源是使用者可控的字串
 * (姓名、備註、銀行帳號),不是程式算出來的數字。
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);

  // 順序有意義:先擋公式,再決定要不要包引號——前導單引號本身不觸發
  // 包引號,但原值裡的逗號仍然會,兩者要能同時套用。
  const guarded = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  if (!NEEDS_QUOTING.test(guarded)) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** 組出完整 CSV 內容(含 BOM)。標題與資料列都會逐欄跳脫。 */
export function buildCsvContent(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [headers.map((h) => escapeCsvField(h)).join(',')];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvField(cell)).join(','));
  }
  return BOM + lines.join('\n');
}
