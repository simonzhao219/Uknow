// @vitest-environment jsdom
//
// 列表的狀態行：「已顯示 X / Y 筆」（不得靜默截斷，ui-ux §5），後面接停用的原因。
// 被閘的入口以 aria-describedby 指向它，所以 id 要掛在這一行上。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdminListStatus } from './AdminListStatus';

afterEach(cleanup);

describe('AdminListStatus', () => {
  it('說出已顯示幾筆、總共幾筆，id 掛在這一行上', () => {
    render(<AdminListStatus id="list-status" shown={2} total={37} state="ready" />);
    const line = screen.getByText('已顯示 2 / 37 筆');
    expect(line.id).toBe('list-status');
  });

  it('有原因時以「・」接在筆數後面，筆數本身不變', () => {
    render(
      <AdminListStatus
        id="list-status"
        shown={2}
        total={37}
        state="ready"
        suffix="更新中，暫停匯款相關操作"
      />,
    );
    const line = screen.getByText('已顯示 2 / 37 筆');
    expect(line.textContent).toBe('已顯示 2 / 37 筆・更新中，暫停匯款相關操作');
  });

  it('載入中只保留高度的佔位，不寫數字', () => {
    const { container } = render(<AdminListStatus shown={0} total={0} state="loading" />);
    const placeholder = container.firstElementChild;
    expect(placeholder?.getAttribute('aria-hidden')).toBe('true');
    expect(placeholder?.textContent).toBe('');
  });

  it('沒有資料的錯誤時整行不顯示', () => {
    const { container } = render(<AdminListStatus shown={0} total={0} state="hidden" />);
    expect(container.firstElementChild).toBeNull();
  });
});
