// @vitest-environment jsdom
//
// 這支 hook 存在的唯一理由是一個瀏覽器行為:受控 input 在 IME 組字期間被
// React 寫回 `value`,WebKit(iOS Safari)會丟掉 composition range 卻不清掉
// IME 自己的緩衝,於是下一次按鍵把整個緩衝再插一次——注音符號累積殘留、
// 選出來的漢字接在垃圾後面(見 docs/plans/fix-ime-composition-input/fix.md)。
//
// jsdom 測得出**事件序列**的處置是否正確,測不出 WebKit 那個復原行為本身。
// 所以這裡釘的契約是「組字期間不碰值」,不是「iOS 上不會壞」——後者只有
// 真機 e2e 能證明,本專案沒有(已記 friction-log)。
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { useImeComposition } from './useImeComposition';

afterEach(cleanup);

// 用一個「會改寫值」的轉換當探針:把間隔號換成半形空格,與 CompleteProfile
// 的姓名轉換同形。轉換有沒有在錯的時機跑,看值就知道。
const convert = (raw: string) => raw.replace(/·/g, ' ');

function Field({
  onCompose,
  onCommit,
}: {
  onCompose: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState('');
  const handlers = useImeComposition<HTMLInputElement>({
    onCompose: (raw) => {
      onCompose(raw);
      setValue(raw); // 組字期間原樣收下——不收的話 React 會拿舊值寫回 DOM
    },
    onCommit: (raw) => {
      onCommit(raw);
      setValue(convert(raw));
    },
  });
  return <input aria-label="測試欄位" value={value} {...handlers} />;
}

function renderField() {
  const onCompose = vi.fn();
  const onCommit = vi.fn();
  render(<Field onCompose={onCompose} onCommit={onCommit} />);
  return {
    onCompose,
    onCommit,
    input: () => screen.getByLabelText('測試欄位') as HTMLInputElement,
  };
}

describe('useImeComposition', () => {
  it('沒有組字的一般輸入直接走 onCommit,轉換照常套用', () => {
    const { onCompose, onCommit, input } = renderField();
    fireEvent.change(input(), { target: { value: '谷辣斯·尤達卡' } });

    expect(onCommit).toHaveBeenCalledWith('谷辣斯·尤達卡');
    expect(onCompose).not.toHaveBeenCalled();
    expect(input().value).toBe('谷辣斯 尤達卡');
  });

  it('組字期間只走 onCompose,值原樣保留不被轉換', () => {
    const { onCompose, onCommit, input } = renderField();
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'ㄍㄨˇ' } });
    fireEvent.change(input(), { target: { value: 'ㄍㄨˇ·' } });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCompose).toHaveBeenCalledTimes(2);
    // 關鍵斷言:間隔號還在。組字中值一旦被改寫,iOS 的組字狀態就毀了。
    expect(input().value).toBe('ㄍㄨˇ·');
  });

  it('compositionend 後走 onCommit,轉換套用在最終值上', () => {
    const { onCommit, input } = renderField();
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'ㄍㄨˇ·' } });
    fireEvent.compositionEnd(input(), { target: { value: '谷辣斯·尤達卡' } });

    expect(onCommit).toHaveBeenCalledWith('谷辣斯·尤達卡');
    expect(input().value).toBe('谷辣斯 尤達卡');
  });

  it('組字結束後的下一次輸入回到 onCommit,不會卡在組字狀態', () => {
    const { onCompose, onCommit, input } = renderField();
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'ㄍㄨˇ' } });
    fireEvent.compositionEnd(input(), { target: { value: '谷' } });
    onCompose.mockClear();

    fireEvent.change(input(), { target: { value: '谷·辣' } });

    expect(onCompose).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenLastCalledWith('谷·辣');
    expect(input().value).toBe('谷 辣');
  });

  it('compositionend 早於最後一次 input 時仍以最終值收斂', () => {
    // Chrome/Android 的 compositionend 早於最後一次 input 事件,Safari 相反。
    // 轉換是 idempotent 的,所以兩種順序都必須收斂到同一個值。
    const { onCommit, input } = renderField();
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'ㄍㄨˇ' } });
    fireEvent.compositionEnd(input(), { target: { value: '谷·辣' } });
    fireEvent.change(input(), { target: { value: '谷·辣' } });

    expect(onCommit).toHaveBeenLastCalledWith('谷·辣');
    expect(input().value).toBe('谷 辣');
  });
});
