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

export function refusal(message: string): Error {
  return new Error(message);
}

/**
 * 結果不明的固定文案：不斷言斷線（5xx 也歸這類），只說「沒收到確認」與下一步該看哪裡。
 * 讀取失敗的錯誤字維持後端原文——固定文案只用在寫入結果不明。
 */
export const UNKNOWN_OUTCOME = {
  /** 退件與代為完成：沒有轉帳，只請 admin 回頭確認那一筆。 */
  withdrawal: (name: string) => `${name}：未收到伺服器確認，結果不明，列表更新後請確認該筆狀態`,
  /**
   * 標記已匯款是網銀轉出**之後**才按的：重讀後若仍顯示待處理，最可能的誤判是「沒匯成」而
   * 再匯一次（業主 2026-10-07 裁決 E）。
   */
  withdrawalPaid: (name: string) =>
    `${name}：未收到伺服器確認，結果不明。若款項已匯出請勿重匯，確認狀態後再補標記`,
  withdrawalBatch:
    '批次匯款未收到伺服器確認，結果不明。若款項已匯出請勿重匯，逐筆確認狀態後再補標記',
  /** 會員停權／恢復、授予／撤銷：面板仍顯示該人時一併重讀詳情（K3），請 admin 從詳情確認。 */
  member: (name: string) => `${name}：未收到伺服器確認，結果不明，詳情更新後請確認`,
  /** 證件審核通過／退回：佇列重讀一次（E4），請 admin 從佇列確認。 */
  idReview: (name: string) => `${name}：未收到伺服器確認，結果不明，佇列更新後請確認`,
  /** 公告建立：列表重讀一次（K3）；表單不清，確認列表上沒有這則再重發。 */
  announcementCreate: '未收到伺服器確認，結果不明，請確認公告列表後再決定是否重發',
  /** 公告刪除：列表重讀一次（K3）。刪除沒有「重發」可言，與建立分開。 */
  announcementDelete: '未收到伺服器確認，結果不明，請確認公告列表',
  /** 告警標記已處理：列表重讀一次（K3）。 */
  alertResolve: '未收到伺服器確認，結果不明，請確認告警列表',
};
