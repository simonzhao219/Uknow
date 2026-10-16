// @vitest-environment jsdom
//
// 批次匯款的勾選屬於「某一批資料」。資料換一批（接受的落地）時勾選就不再成立：留著會讓
// 「已選取 N 筆」指向已經不在畫面上的列，而下一步是不可回退的批次匯款。
//
// 這支測試記下**每一次 render** 看到的勾選數：靠落地後的 effect 清空的話，新資料第一次
// 出現的那個 render 仍帶著舊勾選——只看最後的畫面測不出這一格空窗。
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { type BatchSelection, useBatchSelection } from './useBatchSelection';

afterEach(cleanup);

function Recorder({
  version,
  sizes,
  handle,
}: {
  version: number;
  sizes: number[];
  handle: { current: BatchSelection | null };
}) {
  const selection = useBatchSelection(version);
  sizes.push(selection.selected.size);
  handle.current = selection;
  return null;
}

function setup(version = 1) {
  const sizes: number[] = [];
  const handle: { current: BatchSelection | null } = { current: null };
  const view = render(<Recorder version={version} sizes={sizes} handle={handle} />);
  const rerender = (next: number) =>
    view.rerender(<Recorder version={next} sizes={sizes} handle={handle} />);
  const selected = () => [...(handle.current?.selected ?? [])].sort();
  return { sizes, handle, rerender, selected };
}

describe('useBatchSelection', () => {
  it('逐筆切換：勾了再按一次就取消', () => {
    const { handle, selected } = setup();
    act(() => handle.current?.toggle('w1'));
    act(() => handle.current?.toggle('w2'));
    expect(selected()).toEqual(['w1', 'w2']);
    act(() => handle.current?.toggle('w1'));
    expect(selected()).toEqual(['w2']);
  });

  it('整頁取代與清空', () => {
    const { handle, selected } = setup();
    act(() => handle.current?.replace(['w1', 'w2', 'w3']));
    expect(selected()).toEqual(['w1', 'w2', 'w3']);
    act(() => handle.current?.clear());
    expect(selected()).toEqual([]);
  });

  it('資料版本一變，那一次 render 起勾選就是空的，不等 effect', () => {
    const { sizes, handle, rerender, selected } = setup();
    act(() => handle.current?.replace(['w1', 'w2']));
    expect(selected()).toEqual(['w1', 'w2']);
    sizes.length = 0;

    rerender(2);
    expect(sizes).toEqual([0]);
    expect(selected()).toEqual([]);
  });

  it('換版本後重新勾選，算在新版本上', () => {
    const { handle, rerender, selected } = setup();
    act(() => handle.current?.toggle('w1'));
    rerender(2);
    act(() => handle.current?.toggle('w2'));
    expect(selected()).toEqual(['w2']);
  });
});
