import type { AdminBusy } from './adminBusy';
import type { AdminCache, AdminMutationEvent } from './adminCache';
import { classifyWriteFailure } from './writeOutcome';

/**
 * 後台寫入的協議，只寫這一次（業主 2026-10-07 裁決 G；S5 §2.7、§2.11）：
 *
 * 1. **鎖分頁只包住寫入請求**：`try { await submit() } finally { release() }`——結算後立即
 *    釋放、不等之後的重讀（重讀卡住時說明行不該謊稱在等寫入），也不會釋放兩次。
 * 2. **結果三分**：成功、後端拒絕（4xx，交易沒提交）、結果不明（其餘，可能已提交）。
 * 3. **先失效、再回報、最後重讀**：成功（且真的有東西提交）與結果不明都可能已提交，先讓
 *    快取失效——之前送出的讀取晚到也寫不回去（fence）；回報與重讀在同一個同步段，回報出現
 *    的那個 commit 裡列表已經在更新。後端拒絕不失效，但同樣重讀一次（D5），讓列表回到真實
 *    狀態。卸載後 hook 的重讀不再發請求。
 *
 * 回應形狀的檢查放在 `submit` 裡：2xx 但讀欄位會擲錯的回應，在那裡擲出就歸「結果不明」。
 */
export type AdminWriteOutcome<R> =
  | { kind: 'done'; result: R }
  | { kind: 'rejected' | 'unknown'; error: unknown };

export interface AdminWriteOptions<R> {
  busy: AdminBusy;
  cache?: AdminCache;
  /** 可能已提交時要失效的事件；`null`＝不入失效表的寫入（證件審核、告警）。 */
  event: AdminMutationEvent | null;
  submit: () => Promise<R>;
  /** 成功時是否真的有東西提交了（例：批次全數失敗＝沒有）。預設是。 */
  committed?: (result: R) => boolean;
  /** 回報：在失效之後、重讀之前呼叫。 */
  settle: (outcome: AdminWriteOutcome<R>) => void;
  /**
   * 重讀：一定在 `settle` 之後。收到結局，頁面可以決定要不要讀、讀什麼（例：會員頁後端拒絕
   * 且面板仍顯示該人時不重讀列表，既有行為）。
   */
  reload: (outcome: AdminWriteOutcome<R>) => unknown;
}

export async function runAdminWrite<R>({
  busy,
  cache,
  event,
  submit,
  committed,
  settle,
  reload,
}: AdminWriteOptions<R>): Promise<AdminWriteOutcome<R>> {
  const release = busy.startWrite();
  let outcome: AdminWriteOutcome<R>;
  try {
    outcome = { kind: 'done', result: await submit() };
  } catch (error) {
    outcome = { kind: classifyWriteFailure(error), error };
  } finally {
    release();
  }
  const mayHaveCommitted =
    outcome.kind === 'unknown' ||
    (outcome.kind === 'done' && (committed ? committed(outcome.result) : true));
  if (mayHaveCommitted && event) cache?.invalidate(event);
  settle(outcome);
  void reload(outcome);
  return outcome;
}
