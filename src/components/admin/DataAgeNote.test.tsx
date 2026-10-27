// @vitest-environment jsdom
//
// 資料時間：「資料更新於 N 分鐘前」。快取讓畫面上可能是「上次看到的樣子」，
// 照著它去網銀匯款前，admin 要看得到它有多舊；停太久就提示先重新整理。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DataAgeNote, formatDataAge } from './DataAgeNote';

afterEach(cleanup);

const MIN = 60_000;

describe('formatDataAge', () => {
  it.each([
    [0, '剛剛'],
    [MIN - 1, '剛剛'],
    [MIN, '1 分鐘前'],
    [10 * MIN - 1, '9 分鐘前'],
    [125 * MIN, '125 分鐘前'],
  ])('經過 %i 毫秒寫「%s」', (elapsed, expected) => {
    expect(formatDataAge(1_000_000, 1_000_000 + elapsed)).toBe(expected);
  });

  it('時鐘倒退（裝置校時）時當成剛剛，不寫負數', () => {
    expect(formatDataAge(1_000_000, 1_000_000 - 5 * MIN)).toBe('剛剛');
  });
});

describe('DataAgeNote', () => {
  it('不到 1 分鐘寫「剛剛更新」', () => {
    render(<DataAgeNote fetchedAt={1_000_000} now={1_000_000 + 30_000} />);
    expect(screen.getByText('剛剛更新')).toBeTruthy();
  });

  it('寫「資料更新於 N 分鐘前」', () => {
    render(<DataAgeNote fetchedAt={1_000_000} now={1_000_000 + 3 * MIN} />);
    expect(screen.getByText('資料更新於 3 分鐘前')).toBeTruthy();
  });

  it('滿 10 分鐘改成提示先重新整理', () => {
    render(<DataAgeNote fetchedAt={1_000_000} now={1_000_000 + 10 * MIN} />);
    expect(screen.getByText('資料更新於 10 分鐘前，建議先重新整理')).toBeTruthy();
  });

  it('沒有資料時間時不顯示', () => {
    const { container } = render(<DataAgeNote fetchedAt={null} now={1_000_000} />);
    expect(container.firstElementChild).toBeNull();
  });

  it('可以 span 嵌進對話框的說明段落（段落裡不能再放段落）', () => {
    render(<DataAgeNote as="span" fetchedAt={1_000_000} now={1_000_000} />);
    expect(screen.getByText('剛剛更新').tagName).toBe('SPAN');
  });
});
