// @vitest-environment jsdom
//
// 後台四頁共用的列表骨架。守的是定位器契約：
//   * 外層是帶名稱、aria-busy 的 status——e2e 與 journey 的 page object 以
//     `get_by_role("status", name="載入提領申請中")` 等它出現與消失；
//   * 內部只用 div，不得出現 table／row 角色——page object 會把骨架當成終態的表格；
//   * 慢更新的提示放在 status 之外：busy 的 live region 暫不播報新增的文字。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdminListSkeleton } from './AdminListSkeleton';

afterEach(cleanup);

describe('AdminListSkeleton', () => {
  it('外層是帶名稱、忙碌中的 status', () => {
    render(<AdminListSkeleton label="載入提領申請中" variant="rows" />);
    const status = screen.getByRole('status', { name: '載入提領申請中' });
    expect(status.getAttribute('aria-busy')).toBe('true');
  });

  it('內部只有骨架塊，不出現表格或列的角色', () => {
    render(<AdminListSkeleton label="載入提領申請中" variant="rows" count={4} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('row')).toBeNull();
    const blocks = screen.getByRole('status').querySelectorAll('[data-slot="skeleton"]');
    expect(blocks).toHaveLength(4);
  });

  it('手機用卡片形、桌機用列形', () => {
    const { rerender } = render(<AdminListSkeleton label="載入中" variant="cards" />);
    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('cards');
    rerender(<AdminListSkeleton label="載入中" variant="rows" />);
    expect(screen.getByRole('status').getAttribute('data-variant')).toBe('rows');
  });

  it('慢更新的提示放在 status 之外的獨立段落', () => {
    render(
      <AdminListSkeleton
        label="載入提領申請中"
        variant="rows"
        message="更新較久，仍在等待伺服器回應"
      />,
    );
    const note = screen.getByText('更新較久，仍在等待伺服器回應');
    expect(screen.getByRole('status').contains(note)).toBe(false);
  });
});
