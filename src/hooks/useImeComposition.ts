// TDD 紅燈期的最小 stub —— 刻意保留修復前的行為(每次 input 都當成已定案),
// 讓型別過關而斷言仍紅。實作在綠燈 commit 補上。
import type React from 'react';

interface ImeCompositionOptions {
  onCompose: (raw: string) => void;
  onCommit: (value: string) => void;
}

export function useImeComposition<E extends HTMLInputElement | HTMLTextAreaElement>({
  onCommit,
}: ImeCompositionOptions) {
  return {
    onChange: (e: React.ChangeEvent<E>) => onCommit(e.target.value),
    onCompositionStart: () => {},
    onCompositionEnd: (_e: React.CompositionEvent<E>) => {},
  };
}
