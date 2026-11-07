// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { trackPageview } = vi.hoisted(() => ({ trackPageview: vi.fn() }));
vi.mock('../utils/analytics/analyticsRuntime', () => ({ trackPageview }));

import { usePageview } from './usePageview';

afterEach(() => {
  cleanup();
  trackPageview.mockClear();
});

let go: (to: string) => void = () => {};
function Probe() {
  usePageview();
  go = useNavigate();
  return null;
}

describe('usePageview', () => {
  it('首次掛載就以 pathname（不含 query）通知一次', () => {
    render(
      <MemoryRouter initialEntries={['/service-providers/7?from=home#x']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(trackPageview.mock.calls).toEqual([['/service-providers/7']]);
  });

  it('路由變更時再通知，同一路徑只改 query 不重複通知', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Probe />
      </MemoryRouter>,
    );
    act(() => go('/rewards'));
    act(() => go('/rewards?tab=2'));
    act(() => go('/payment/result'));
    expect(trackPageview.mock.calls.map((c) => c[0])).toEqual(['/', '/rewards', '/payment/result']);
  });
});
