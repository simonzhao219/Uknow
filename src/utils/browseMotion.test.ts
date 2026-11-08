// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPRING_MS, springTo } from './browseMotion';

describe('springTo', () => {
  const stubReduced = (reduced: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
    }));
  const makeEl = () => {
    const el = document.createElement('div');
    const animate = vi.fn();
    el.animate = animate as unknown as typeof el.animate;
    return { el, animate };
  };
  afterEach(() => vi.unstubAllGlobals());

  it('從目前位移動畫回 0，並清掉 inline transform', () => {
    stubReduced(false);
    const { el, animate } = makeEl();
    el.style.transform = 'translateX(-30px)';
    springTo(el, 'translateX(-30px)');
    expect(el.style.transform).toBe('');
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animate.mock.calls[0];
    expect(keyframes).toEqual([{ transform: 'translateX(-30px)' }, { transform: 'translateX(0)' }]);
    expect(options).toMatchObject({ duration: SPRING_MS });
  });

  it('偏好減少動態時只清掉 transform，不做動畫', () => {
    stubReduced(true);
    const { el, animate } = makeEl();
    el.style.transform = 'translateX(-30px)';
    springTo(el, 'translateX(-30px)');
    expect(el.style.transform).toBe('');
    expect(animate).not.toHaveBeenCalled();
  });

  it('沒有位移時不做動畫', () => {
    stubReduced(false);
    const { el, animate } = makeEl();
    springTo(el, '');
    expect(animate).not.toHaveBeenCalled();
  });
});
