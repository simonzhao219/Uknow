// @vitest-environment jsdom
//
// 「需要注意」區（ui-ux-guidelines §13 第 3 條）：沒事整塊不渲染；有事時是
// warning 框、標題為 h2，每條是一個指向處理頁的連結。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AttentionCallout } from './AttentionCallout';

afterEach(cleanup);

describe('AttentionCallout', () => {
  it('沒有項目時不渲染任何內容', () => {
    const { container } = render(
      <MemoryRouter>
        <AttentionCallout items={[]} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('每個項目是一條連到處理頁的墨色底線連結', () => {
    render(
      <MemoryRouter>
        <AttentionCallout
          items={[
            { key: 'a', to: '/referrals', label: '2 位下線即將到期' },
            { key: 'b', to: '/rewards', label: '1 筆提領待查收' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: '需要注意' })).toBeTruthy();
    const link = screen.getByRole('link', { name: '2 位下線即將到期' });
    expect(link.getAttribute('href')).toBe('/referrals');
    expect(link.classList.contains('text-primary')).toBe(true);
    expect(link.classList.contains('underline')).toBe(true);
    expect(screen.getByRole('link', { name: '1 筆提領待查收' }).getAttribute('href')).toBe(
      '/rewards',
    );
  });
});
