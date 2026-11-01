// useAuthBootstrap 的重試排程與在飛旗標（T1-B auth-transient-resilience §2.3）。
//
// 「排程中」與「在飛」是同一個來源：同一時間只允許一個自動重試計時器或一個在飛的
// /profile 請求。SIGNED_IN 重播、手動重試、online／focus 事件都先看 busy／inFlight，
// 不會並行出第二條請求（並行的那條若不帶 ?retry=1 會再跑一次 heal／repair）。
// 換帳號、登出、卸載時 reset。純邏輯、不 import React，可獨立測。

export interface AttemptScheduler {
  /** 有排程或有在飛請求。 */
  readonly busy: boolean;
  readonly inFlight: boolean;
  /** 排一個延遲執行；已有排程時取代之。 */
  schedule(fn: () => void, ms: number): void;
  cancel(): void;
  begin(): void;
  end(): void;
  reset(): void;
}

export function createAttemptScheduler(): AttemptScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    get busy() {
      return timer !== null || inFlight;
    },
    get inFlight() {
      return inFlight;
    },
    schedule(fn, ms) {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, ms);
    },
    cancel,
    begin() {
      inFlight = true;
    },
    end() {
      inFlight = false;
    },
    reset() {
      cancel();
      inFlight = false;
    },
  };
}
