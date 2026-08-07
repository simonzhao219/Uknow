// 觸覺回饋（Vibration API）的共用封裝。
//
// 使用情境是掃碼核身：櫃檯人員舉著手機對客人出示的碼，眼睛看的是客人不是
// 螢幕。震動是那一刻唯一能到達的通道，而且**必須能分辨結果**——只回饋
// 「掃到了」而不回饋「有沒有問題」，等於把人再叫回螢幕前，等於沒做。
//
// 刻意不做提示音：AudioContext 要使用者手勢才解鎖（掃碼是自動觸發的，
// 沒有手勢可用），而且櫃檯是安靜場所。這是取捨，不是遺漏。
//
// 支援度是不對稱的：Android Chrome 支援，**iOS Safari 完全不支援**。
// 所以震動是加分而非主線——結果本身仍必須在畫面上看得見。

/** 成功：單次短震。 */
const PATTERN_SUCCESS = 60;

/** 警示：兩短一停的雙震——刻意與成功「長度不同、節奏不同」，隔著口袋也分得出。 */
const PATTERN_ALERT = [60, 80, 60];

/**
 * 送出震動；不支援或被拒時靜默略過。
 *
 * 兩種失敗方式都要吞：API 不存在（iOS Safari、桌機），以及呼叫時擲錯
 * （部分瀏覽器在缺少使用者手勢的情境下如此）。核身結果是主線功能，
 * 不能因為震不動而中斷。
 */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 震動失敗不影響任何主線行為，無需回報。
  }
}

export function hapticSuccess(): void {
  vibrate(PATTERN_SUCCESS);
}

export function hapticAlert(): void {
  vibrate(PATTERN_ALERT);
}
