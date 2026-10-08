// @vitest-environment jsdom
//
// 提領頁的動作回報（工具列正下方）。兩個兄弟節點，不巢狀：
//   * 狀態容器：常駐（live region 要先在才念得出來）、空時不佔高、role="status"；
//     裡面的 StatusCallout 不再帶 role——可見字與播報字是同一個節點，文字在 DOM 裡只
//     出現一次（e2e 與 journey 以 get_by_text 找它，重複就 strict mode violation）。
//   * 失敗容器：只在有失敗時渲染、role="alert"；剛按下的動作失敗時捲進視線並取得焦點。
// 兩者都帶 scroll-mt-20：導覽列是 sticky、高 64px，不加就會被蓋住。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminActionReport } from './AdminActionReport';

// jsdom 沒有 scrollIntoView；先補一個空的，個別測試再監看它。
HTMLElement.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminActionReport', () => {
  it('成功回報放在常駐的 status 容器裡，文字在 DOM 裡只出現一次', () => {
    render(
      <AdminActionReport
        status={{ tone: 'success', text: '已退件：王小明' }}
        failure={null}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getAllByText('已退件：王小明')).toHaveLength(1);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('已退件：王小明');
    expect(status.querySelectorAll('[role]')).toHaveLength(0);
  });

  it('狀態容器常駐，沒有內容時是空的', () => {
    render(<AdminActionReport status={null} failure={null} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('批次被取消用 warning 變體', () => {
    render(
      <AdminActionReport
        status={{ tone: 'warning', text: '列表已更新，請重新勾選' }}
        failure={null}
        onDismiss={vi.fn()}
      />,
    );
    const callout = screen
      .getByText('列表已更新，請重新勾選')
      .closest('[data-slot="status-callout"]');
    expect(callout?.className).toContain('bg-warning-subtle');
  });

  it('失敗容器只在有失敗時渲染，帶 alert，與狀態容器是兄弟節點', () => {
    const { rerender } = render(
      <AdminActionReport status={null} failure={null} onDismiss={vi.fn()} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(
      <AdminActionReport
        status={{ tone: 'success', text: '已退件：王小明' }}
        failure="李小華：這筆已被其他管理員處理"
        onDismiss={vi.fn()}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('李小華：這筆已被其他管理員處理');
    expect(screen.getByRole('status').contains(alert)).toBe(false);
    expect(alert.contains(screen.getByRole('status'))).toBe(false);
  });

  it('兩個容器都帶 scroll-mt-20，捲進視線時不被 sticky 導覽列蓋住', () => {
    render(
      <AdminActionReport
        status={{ tone: 'success', text: '已退件：王小明' }}
        failure="失敗"
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').className).toContain('scroll-mt-20');
    expect(screen.getByRole('alert').className).toContain('scroll-mt-20');
  });

  it('剛按下的動作失敗時捲進視線並取得焦點', () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    render(<AdminActionReport status={null} failure="失敗了" focusFailure onDismiss={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(scroll).toHaveBeenCalled();
  });

  it('晚到的失敗不搶焦點', () => {
    render(<AdminActionReport status={null} failure="失敗了" onDismiss={vi.fn()} />);
    expect(document.activeElement).not.toBe(screen.getByRole('alert'));
  });

  it('按「知道了」收起回報', () => {
    const onDismiss = vi.fn();
    render(
      <AdminActionReport
        status={{ tone: 'success', text: '已退件：王小明' }}
        failure={null}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
