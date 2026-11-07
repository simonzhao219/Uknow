import { describe, expect, it, vi } from 'vitest';
import { scheduleAnalytics } from './scheduleAnalytics';

function deps(isRedirecting: boolean) {
  const order: string[] = [];
  let loadedCb: () => void = () => {};
  let idleCb: () => void = () => {};
  return {
    order,
    fireLoaded: () => loadedCb(),
    fireIdle: () => idleCb(),
    d: {
      isRedirecting,
      whenLoaded: (cb: () => void) => {
        order.push('whenLoaded');
        loadedCb = cb;
      },
      idle: (cb: () => void) => {
        order.push('idle');
        idleCb = cb;
      },
      start: vi.fn(() => order.push('start')),
    },
  };
}

describe('scheduleAnalytics', () => {
  it('canonical redirect 時完全不排程也不啟動', () => {
    const t = deps(true);
    scheduleAnalytics(t.d);
    expect(t.order).toEqual([]);
    expect(t.d.start).not.toHaveBeenCalled();
  });

  it('先等文件載入、再等 idle，最後才啟動', () => {
    const t = deps(false);
    scheduleAnalytics(t.d);
    expect(t.d.start).not.toHaveBeenCalled();
    t.fireLoaded();
    expect(t.d.start).not.toHaveBeenCalled();
    t.fireIdle();
    expect(t.order).toEqual(['whenLoaded', 'idle', 'start']);
    expect(t.d.start).toHaveBeenCalledTimes(1);
  });
});
