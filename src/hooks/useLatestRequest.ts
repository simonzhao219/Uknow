import { useRef } from 'react';

/**
 * 「最後意圖勝出」的請求序號，與全 repo 唯一的整數戳。
 *
 * **序號**擋的是晚到覆蓋：發請求前 `begin()`，結算時 `isLatest(ticket)` 不成立就整個丟掉——
 * 連換篩選、載入更多與重讀交錯時，畫面只認最後一次意圖。每個使用者各自一個實例，互不相干。
 *
 * **戳記**（`nextStamp()`）回答的是另一個問題：後台快取的失效 fence 要判斷「這個請求是不是在
 * 失效之前送出的」。只有請求戳與失效戳取自**同一條**序列，`請求戳 < fence` 才有這個意思——所以
 * 計數器在模組層級，不跟著實例走；各實例從 0 起算的話，比較會靜默失效。
 *
 * `markChanged`／`changedSince` 給「讀取在途時對象被寫過」的情境用：讀取落地時對象若在 ticket
 * 發出後變過，那份結果可能早於變更，該丟掉再讀一次。
 */
export interface Ticket {
  seq: number;
  stamp: number;
  entityId?: string;
  entityVersion?: number;
}

export interface LatestRequest {
  /** 遞增序號、作廢之前的 ticket；同刻以 `nextStamp()` 取戳。 */
  begin(entityId?: string): Ticket;
  /** 目前的 ticket，不遞增。 */
  peek(): Ticket;
  isLatest(t: Ticket): boolean;
  /** 該對象的版本 +1。 */
  markChanged(entityId: string): void;
  /** `t` 發出後它帶的對象是否被標記過；沒帶對象的 ticket 恆為 false。 */
  changedSince(t: Ticket): boolean;
}

let lastStamp = 0;

/** 全 repo 唯一的單調整數戳（請求與快取失效共用這一條序列）。 */
export function nextStamp(): number {
  lastStamp += 1;
  return lastStamp;
}

export function createLatestRequest(): LatestRequest {
  let current: Ticket = { seq: 0, stamp: 0 };
  const versions = new Map<string, number>();
  const versionOf = (entityId: string) => versions.get(entityId) ?? 0;

  return {
    begin(entityId) {
      const seq = current.seq + 1;
      current =
        entityId === undefined
          ? { seq, stamp: nextStamp() }
          : { seq, stamp: nextStamp(), entityId, entityVersion: versionOf(entityId) };
      return current;
    },
    peek: () => current,
    isLatest: (t) => t.seq === current.seq,
    markChanged(entityId) {
      versions.set(entityId, versionOf(entityId) + 1);
    },
    changedSince(t) {
      if (t.entityId === undefined) return false;
      return versionOf(t.entityId) !== t.entityVersion;
    },
  };
}

/** 元件生命週期內持有同一份核心。 */
export function useLatestRequest(): LatestRequest {
  const ref = useRef<LatestRequest | null>(null);
  if (ref.current === null) ref.current = createLatestRequest();
  return ref.current;
}
