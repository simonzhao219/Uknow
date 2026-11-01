import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAttemptScheduler } from './authRetryScheduler';

// useAuthBootstrap 的重試排程與在飛旗標（T1-B §2.3）：同一時間只允許一個排程或一個在飛請求，
// 換帳號、登出、卸載時一律 reset。
describe('createAttemptScheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('排程到點才執行，期間 busy 為真', () => {
    vi.useFakeTimers();
    const s = createAttemptScheduler();
    const fn = vi.fn();
    s.schedule(fn, 1_000);
    expect(s.busy).toBe(true);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.busy).toBe(false);
  });

  it('cancel 後排程不再執行', () => {
    vi.useFakeTimers();
    const s = createAttemptScheduler();
    const fn = vi.fn();
    s.schedule(fn, 1_000);
    s.cancel();
    vi.advanceTimersByTime(5_000);
    expect(fn).not.toHaveBeenCalled();
    expect(s.busy).toBe(false);
  });

  it('再次排程時取代前一個', () => {
    vi.useFakeTimers();
    const s = createAttemptScheduler();
    const a = vi.fn();
    const b = vi.fn();
    s.schedule(a, 1_000);
    s.schedule(b, 1_000);
    vi.advanceTimersByTime(1_000);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('在飛期間 busy 與 inFlight 為真，end 後歸零；reset 同時清排程與在飛', () => {
    vi.useFakeTimers();
    const s = createAttemptScheduler();
    s.begin();
    expect(s.inFlight).toBe(true);
    expect(s.busy).toBe(true);
    s.end();
    expect(s.busy).toBe(false);
    const fn = vi.fn();
    s.begin();
    s.schedule(fn, 1_000);
    s.reset();
    vi.advanceTimersByTime(1_000);
    expect(fn).not.toHaveBeenCalled();
    expect(s.busy).toBe(false);
  });
});
