// T1-B stub
export function createAttemptScheduler() {
  return {
    busy: false,
    inFlight: false,
    schedule(_fn: () => void, _ms: number) {},
    cancel() {},
    begin() {},
    end() {},
    reset() {},
  };
}
