// ============================================================
// PayUni 交易查詢（/api/trade/query）解密後的結果列解析（W7-16）。
//
// 官方「交易查詢 Ver 2.0」（docs.payuni.com.tw #/7/164，2026-11-25 以瀏覽器渲染讀取）：
//   「由於可能多筆紀錄，故回傳資料統一為 Result 陣列 (由 0 開始)」
// 而 EncryptInfo 的明文是 PHP http_build_query 產生的 query string（官方 PHP 範例的
// Encrypt 用 http_build_query、SDK 的 Decrypt 用 parse_str）。巢狀陣列經
// http_build_query 會變成 `Result%5B0%5D%5BMerTradeNo%5D=…`，URLSearchParams 解開後的
// 鍵名是 `Result[0][MerTradeNo]`——**不是** JSON 字串的 `Result` 欄，也不是平鋪欄位。
// 第 6 波起的解析只認後兩種，所以 develop 正控對已付款的單一直 no_matching_trade，
// 對帳查到已付款的單也只會落 unknown／missing_field（自癒路徑實際不通）。
//
// 這裡三種形狀都接（之前的兩種保留，免得 PayUni 某些情況真的回那兩種時退化）：
//   1. `Result[i][欄位]` 鍵名（官方形狀）→ 依 i 數值排序成陣列
//   2. `Result` 是 JSON 陣列字串 → 陣列
//   3. 都沒有 → null，呼叫端把解密結果本身當單筆（平鋪）
// 對帳（queryPayUniTradeStatus）與正控（evaluateControlResponse）共用；同號比對與
// 「單筆缺 MerTradeNo」的寬容規則仍由各呼叫端決定（兩邊嚴格度不同）。
// ============================================================

const RESULT_KEY = /^Result\[(\d+)\]\[([^[\]]+)\]$/;

/** 解出結果列；沒有任何 Result 形狀時回 null。值一律轉字串。 */
export function extractPayUniTrades(
  decrypted: Record<string, string>,
): Record<string, string>[] | null {
  const byIndex = new Map<number, Record<string, string>>();
  for (const [key, value] of Object.entries(decrypted)) {
    const m = RESULT_KEY.exec(key);
    if (!m) continue;
    const i = Number(m[1]);
    const row = byIndex.get(i) ?? {};
    row[m[2]] = String(value ?? '');
    byIndex.set(i, row);
  }
  if (byIndex.size > 0) {
    return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  }

  if (decrypted.Result) {
    try {
      const list = JSON.parse(decrypted.Result);
      if (Array.isArray(list)) {
        return list
          .filter((t) => t && typeof t === 'object')
          .map((t) =>
            Object.fromEntries(
              Object.entries(t as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
            )
          );
      }
    } catch { /* Result 不是 JSON → 當平鋪 */ }
  }
  return null;
}

/**
 * 查詢回應的付款時間欄位是 `PaymentDay`（YYYY-MM-DD HH:II:SS），notify／return 是
 * `PayTime`／`AuthDay`+`AuthTime`；`payuni_paid_at`（SQL）只認後者，經查詢收斂的單會
 * 退回用建單時間當付款時點。交給 resolveOrderFromPayUni 前補一個 PayTime（已有就不動）。
 */
export function withQueryPayTime(trade: Record<string, string>): Record<string, string> {
  const payTime = (trade.PayTime ?? '').trim();
  const paymentDay = (trade.PaymentDay ?? '').trim();
  if (payTime || !paymentDay) return trade;
  return { ...trade, PayTime: paymentDay };
}

/**
 * 取證用（W7-16）：只描述解密結果的**鍵名與結構**，不含任何值。給正控失敗的 reason 用，
 * 下次形狀又對不上時不必猜。長度有上限。
 */
export function describeDecryptedShape(decrypted: Record<string, string>): string {
  const MAX_KEYS = 40;
  const keys = Object.keys(decrypted).sort();
  const shown = keys.slice(0, MAX_KEYS).map((k) => k.slice(0, 40));
  const keyPart = `keys=${shown.join(',')}${
    keys.length > MAX_KEYS ? `,…(+${keys.length - MAX_KEYS})` : ''
  }`;

  let resultPart = 'Result=absent';
  if ('Result' in decrypted) {
    try {
      const parsed = JSON.parse(decrypted.Result);
      if (Array.isArray(parsed)) {
        const first = parsed[0];
        const firstKeys = first && typeof first === 'object'
          ? Object.keys(first).sort().join(',')
          : '';
        resultPart = `Result=array(${parsed.length})${firstKeys ? `:${firstKeys}` : ''}`;
      } else {
        resultPart = `Result=json-${parsed === null ? 'null' : typeof parsed}`;
      }
    } catch {
      resultPart = 'Result=not-json';
    }
  }
  return `${keyPart} ${resultPart}`.slice(0, 560);
}
