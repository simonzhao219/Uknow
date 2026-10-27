import { describe, expect, it } from 'vitest';
import { centeredSquare, clampCrop, fitWithin, outputEdge, scaleCrop } from './imageGeometry';

describe('fitWithin', () => {
  it('最長邊超過上限時等比縮到上限', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin({ width: 3000, height: 4000 }, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('沒超過上限時原樣回傳，不放大', () => {
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('縮出來的邊至少 1px 且為整數', () => {
    const r = fitWithin({ width: 10000, height: 3 }, 1600);
    expect(r.width).toBe(1600);
    expect(r.height).toBe(1);
  });
});

describe('centeredSquare', () => {
  it('橫圖取置中的最大正方形', () => {
    expect(centeredSquare({ width: 4000, height: 3000 })).toEqual({
      x: 500,
      y: 0,
      width: 3000,
      height: 3000,
    });
  });

  it('直圖取置中的最大正方形', () => {
    expect(centeredSquare({ width: 3000, height: 4001 })).toEqual({
      x: 0,
      y: 500,
      width: 3000,
      height: 3000,
    });
  });
});

describe('clampCrop', () => {
  const source = { width: 1000, height: 800 };

  it('超出來源範圍的裁切框被夾回範圍內', () => {
    expect(clampCrop({ x: -50, y: 700, width: 400, height: 400 }, source)).toEqual({
      x: 0,
      y: 400,
      width: 400,
      height: 400,
    });
  });

  it('小數取整，寬高至少 1px', () => {
    expect(clampCrop({ x: 10.6, y: 20.2, width: 0.2, height: 99.7 }, source)).toEqual({
      x: 11,
      y: 20,
      width: 1,
      height: 100,
    });
  });

  it('框比來源還大時縮到來源大小', () => {
    expect(clampCrop({ x: 0, y: 0, width: 5000, height: 5000 }, source)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    });
  });
});

describe('scaleCrop', () => {
  it('依來源與目標尺寸的比例換算裁切框', () => {
    expect(
      scaleCrop(
        { x: 500, y: 0, width: 3000, height: 3000 },
        { width: 4000, height: 3000 },
        { width: 1600, height: 1200 },
      ),
    ).toEqual({ x: 200, y: 0, width: 1200, height: 1200 });
  });

  it('同尺寸時原樣回傳（取整）', () => {
    const s = { width: 800, height: 600 };
    expect(scaleCrop({ x: 10, y: 20, width: 300, height: 300 }, s, s)).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 300,
    });
  });
});

describe('outputEdge', () => {
  it('裁切框大於上限時輸出上限', () => {
    expect(outputEdge({ x: 0, y: 0, width: 3000, height: 3000 }, 1600)).toBe(1600);
  });

  it('裁切框小於上限時不放大', () => {
    expect(outputEdge({ x: 0, y: 0, width: 800, height: 800 }, 1600)).toBe(800);
  });

  it('框不是正方形時取較短邊（輸出恆為 1:1）', () => {
    expect(outputEdge({ x: 0, y: 0, width: 900, height: 700 }, 1600)).toBe(700);
  });
});
