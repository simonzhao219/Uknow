// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { type Box, pickFlips, playFlips } from './flipReorder';

const box = (top: number, left = 0): Box => ({ top, left, width: 100, height: 90 });
const el = () => document.createElement('div');

describe('pickFlips', () => {
  it('位置沒變的卡不動畫', () => {
    const a = el();
    expect(pickFlips(new Map([[a, box(0)]]), new Map([[a, box(0)]]), 800)).toEqual([]);
  });

  it('位移量＝重排前位置減重排後位置', () => {
    const a = el();
    const flips = pickFlips(new Map([[a, box(0, 10)]]), new Map([[a, box(200, 40)]]), 800);
    expect(flips).toEqual([{ el: a, dx: -30, dy: -200 }]);
  });

  it('前後都在視窗上下各一屏之外的卡直接換、不動畫', () => {
    const near = el();
    const far = el();
    const flips = pickFlips(
      new Map([
        [near, box(0)],
        [far, box(5000)],
      ]),
      new Map([
        [near, box(100)],
        [far, box(5200)],
      ]),
      800,
    );
    expect(flips.map((f) => f.el)).toEqual([near]);
  });

  it('最多挑 40 張', () => {
    const els = Array.from({ length: 60 }, el);
    const before = new Map(els.map((e, i) => [e, box(i * 10)] as const));
    const after = new Map(els.map((e, i) => [e, box(i * 10 + 5)] as const));
    expect(pickFlips(before, after, 800)).toHaveLength(40);
  });

  it('只出現在其中一邊的卡忽略', () => {
    const a = el();
    expect(pickFlips(new Map(), new Map([[a, box(0)]]), 800)).toEqual([]);
  });
});

describe('playFlips', () => {
  const fakeAnimation = () => {
    let done!: () => void;
    const finished = new Promise<void>((r) => {
      done = r;
    });
    return { finished, cancel: vi.fn(), done };
  };

  it('對每張卡播 220ms ease-out 的 translate 動畫', () => {
    const a = el();
    const anim = fakeAnimation();
    a.animate = vi.fn(() => anim) as unknown as typeof a.animate;
    playFlips([{ el: a, dx: 5, dy: 50 }]);
    const [keyframes, options] = (a.animate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.stringify(keyframes)).toContain('translate(5px, 50px)');
    expect(options).toMatchObject({ duration: 220, easing: 'ease-out' });
  });

  it('cancel 會取消所有進行中的動畫', () => {
    const a = el();
    const anim = fakeAnimation();
    a.animate = vi.fn(() => anim) as unknown as typeof a.animate;
    playFlips([{ el: a, dx: 1, dy: 1 }]).cancel();
    expect(anim.cancel).toHaveBeenCalled();
  });

  it('全部播完 finished 才解析', async () => {
    const a = el();
    const anim = fakeAnimation();
    a.animate = vi.fn(() => anim) as unknown as typeof a.animate;
    const handle = playFlips([{ el: a, dx: 1, dy: 1 }]);
    let resolved = false;
    handle.finished.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    anim.done();
    await handle.finished;
    expect(resolved).toBe(true);
  });
});
