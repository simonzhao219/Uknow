/**
 * 寫入失敗的兩種結局。
 *
 * - `rejected`（未提交）：錯誤物件帶數值 `status` 且為 4xx——後端明確拒絕（狀態機、權限），
 *   交易沒有提交，照後端原文說出來即可。
 * - `unknown`（結果不明）：其餘一切——網路斷在送出之後（沒有 status）、5xx、2xx 但回應解析
 *   失敗丟出的原生錯誤。交易可能已經提交；5xx 多半沒有，但歸「結果不明」是安全方向：錯的
 *   只會是描述。反過來把可能已提交的寫入說成「失敗」，admin 會再按一次（例：重複匯款）。
 *
 * 判斷用 duck-typing，不 import apiClient：後台元件只吃注入的取數函式。
 */
export type WriteFailure = 'rejected' | 'unknown';

export function classifyWriteFailure(err: unknown): WriteFailure {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? 'rejected' : 'unknown';
}
