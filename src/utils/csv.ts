// CSV 產生的共用工具。
//
// 存在理由:後台的提領匯出是拿去做銀行匯款的清單,欄位裡只要出現逗號或
// 引號就會整份錯位——而錯位的匯款清單比匯不出來危險得多。

export function escapeCsvField(value: string | number | null | undefined): string {
  return '';
}

export function buildCsvContent(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return '';
}
