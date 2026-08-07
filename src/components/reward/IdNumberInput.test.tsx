// @vitest-environment jsdom
//
// 這個元件把使用者打的字轉大寫再回拋給父層。轉大寫對注音與漢字是 identity,
// 所以中文 IME 打不中它——但**全形英數**打得中(Ａ → ａ 是真的變了),而
// 全形模式是中文輸入法的標準功能。組字期間值一被改寫,iOS Safari 就會丟失
// 組字狀態(見 docs/plans/friction-log.md 的 2026-08-07 條)。
//
// 規則本身不容許「這個欄位大概沒人用 IME」這種例外:那種判斷無法機械把關,
// 而 scripts/check-ime-safe-inputs.py 守的正是「onChange 有沒有原樣接受
// e.target.value」這個看得出來的形狀。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../utils/apiClient', () => ({
  // 打不到後端:本檔測的是輸入路徑,不是驗證流程。刻意**永不 resolve**,
  // 避免測試結束、jsdom 已拆掉之後才 setState。
  apiRequestJson: () => new Promise<never>(() => {}),
  buildApiUrl: (p: string) => p,
}));

const { IdNumberInput } = await import('./IdNumberInput');

afterEach(cleanup);

function renderInput() {
  const onChange = vi.fn();
  render(<IdNumberInput value="" onChange={onChange} onVerified={vi.fn()} />);
  return { onChange, input: () => screen.getByLabelText('身分證字號') as HTMLInputElement };
}

describe('IdNumberInput', () => {
  it('一般輸入照常轉大寫回拋給父層', () => {
    const { onChange, input } = renderInput();
    fireEvent.change(input(), { target: { value: 'a123456789' } });
    expect(onChange).toHaveBeenCalledWith('A123456789');
  });

  it('組字期間原樣回拋,不轉大寫', () => {
    const { onChange, input } = renderInput();
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'ａ１２３' } });
    // 全形小寫 ａ 若被轉成 Ａ,受控值就與瀏覽器的組字文字不同,React 會寫回
    // DOM——正是毀掉 iOS 組字狀態的那個動作。
    expect(onChange).toHaveBeenLastCalledWith('ａ１２３');
  });

  it('compositionend 後才套用轉大寫', () => {
    const { onChange, input } = renderInput();
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'ａ' } });
    fireEvent.compositionEnd(input(), { target: { value: 'a123456789' } });
    expect(onChange).toHaveBeenLastCalledWith('A123456789');
  });
});
