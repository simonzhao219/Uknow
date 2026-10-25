// @vitest-environment jsdom
//
// 世代 chip／小圓點（ui-ux-guidelines §12.3、plan.md §4 第 9 點）：會員區提到「代」的地方
// （推薦詳情、獎勵明細）一律用這組元件。世代色 teal／violet／pink 是核准的唯一例外，
// 底與字色都隨世代（一個共用 foreground token 配不了三個色相）。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GenerationChip, GenerationDot, generationLabel } from './GenerationChip';

afterEach(cleanup);

describe('generationLabel', () => {
  it('一到三代寫「一代／二代／三代」，不寫「第 N 代」', () => {
    expect([1, 2, 3].map(generationLabel)).toEqual(['一代', '二代', '三代']);
  });

  it('超出三代時退回「第 N 代」', () => {
    expect(generationLabel(4)).toBe('第 4 代');
  });
});

describe('GenerationChip', () => {
  for (const [gen, label] of [
    [1, '一代'],
    [2, '二代'],
    [3, '三代'],
  ] as const) {
    it(`${label}用 badge-${gen} 的底與 badge-foreground-${gen} 的字`, () => {
      render(<GenerationChip generation={gen} />);
      const chip = screen.getByText(label);
      expect(chip.className).toContain(`bg-[var(--tree-gen-badge-${gen})]`);
      expect(chip.className).toContain(`text-[var(--tree-gen-badge-foreground-${gen})]`);
    });
  }

  it('超出一到三代時用中性灰，不借用世代色', () => {
    render(<GenerationChip generation={4} />);
    const chip = screen.getByText('第 4 代');
    expect(chip.className).toContain('bg-muted');
    expect(chip.className).not.toContain('--tree-gen-badge');
  });

  it('className 可追加，不覆蓋世代色', () => {
    render(<GenerationChip generation={2} className="ml-2" />);
    const chip = screen.getByText('二代');
    expect(chip.classList.contains('ml-2')).toBe(true);
    expect(chip.className).toContain('--tree-gen-badge-2');
  });
});

describe('GenerationDot', () => {
  it('用該世代的頭像色，且不進可及樹（世代文字由旁邊的 chip 承擔）', () => {
    const { container } = render(<GenerationDot generation={3} />);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(dot.className).toContain('bg-[var(--tree-gen-avatar-3)]');
  });
});
