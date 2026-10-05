// @vitest-environment jsdom
//
// 給使用者確認的 Email 不截斷、只換行（業主裁決，#354 範圍外發現第 2 條）：
// @ 後放 <wbr> 讓長 Email 優先在網域前斷開，再加 wrap-anywhere 保底——
// 網域本身也比一行長時才在任意字元斷。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BreakableEmail } from './BreakableEmail';

afterEach(cleanup);

describe('BreakableEmail', () => {
  it('在 @ 後插入 wbr，長 Email 優先在網域前換行', () => {
    const { container } = render(<BreakableEmail email="someone@example.com.tw" />);
    expect(container.innerHTML).toContain('someone@<wbr>example.com.tw');
    expect(container.textContent).toBe('someone@example.com.tw');
  });

  it('帶 wrap-anywhere 保底且不截斷', () => {
    const { container } = render(<BreakableEmail email="someone@example.com.tw" />);
    const span = container.querySelector('span');
    expect(span?.classList.contains('wrap-anywhere')).toBe(true);
    expect(span?.classList.contains('truncate')).toBe(false);
  });

  it('沒有 Email 時不渲染任何東西', () => {
    const { container } = render(<BreakableEmail email={undefined} />);
    expect(container.innerHTML).toBe('');
  });
});
