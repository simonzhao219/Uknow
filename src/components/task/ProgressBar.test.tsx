// @vitest-environment jsdom
//
// S2b（D4）起進度填色用 --brand（S2e 起品牌色只剩引導鈕與重點與進度兩個用途）；軌道維持灰階，
// 才有「未完成」的可見落差（見 ProgressBar.tsx 的軌道註解）。
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

afterEach(cleanup);

describe('ProgressBar', () => {
  it('填色用 brand 品牌色，寬度等於完成百分比', () => {
    const { container } = render(<ProgressBar current={3} target={10} />);
    const fill = container.querySelector('.bg-brand') as HTMLElement | null;
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe('30%');
  });

  it('軌道維持灰階，不跟著填色變 brand', () => {
    const { container } = render(<ProgressBar current={3} target={10} />);
    expect(container.querySelector('.bg-muted-foreground\\/20')).not.toBeNull();
  });
});
