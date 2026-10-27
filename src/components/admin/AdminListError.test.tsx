// @vitest-environment jsdom
//
// 沒有任何資料時的讀取失敗。錯誤字用中性色（規格書 §13 第 4 條：區塊讀取失敗
// 用中性字，紅字留給使用者造成的錯誤）；重試鈕的分量依 ui-ux §12.11——整區
// 失敗時重試是唯一出路，用流程鈕；同頁另有流程鈕（公告的「發布公告」）時用次要。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AdminListError } from './AdminListError';

afterEach(cleanup);

describe('AdminListError', () => {
  it('以 alert 說出原因，字是中性色', () => {
    render(<AdminListError message="連線失敗" retryLabel="重試" tone="flow" onRetry={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('連線失敗').className).toContain('text-muted-foreground');
  });

  it('重試鈕的名稱由頁面決定，按下呼叫 onRetry', () => {
    const onRetry = vi.fn();
    render(
      <AdminListError message="載入告警失敗" retryLabel="重新載入" tone="flow" onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('整區失敗時重試是流程鈕，同頁另有流程鈕時用次要', () => {
    const { rerender } = render(
      <AdminListError message="x" retryLabel="重試" tone="flow" onRetry={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '重試' }).className).toContain('bg-primary');
    rerender(<AdminListError message="x" retryLabel="重試" tone="secondary" onRetry={vi.fn()} />);
    const retry = screen.getByRole('button', { name: '重試' });
    expect(retry.className).toContain('bg-card');
    expect(retry.className).not.toContain('bg-primary');
  });

  it('id 掛在外層，停用的匯出鈕才指得過來', () => {
    render(
      <AdminListError
        id="list-error"
        message="x"
        retryLabel="重試"
        tone="flow"
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').id).toBe('list-error');
  });

  // 按下重試後區塊留在原位（焦點不掉到 body），說出正在更新；狀態文字已在播「正在更新」，
  // 不再以 alert 打斷。鈕顯示進行中、按了不重送（業主 2026-10-07 裁決 A）。
  it('重試進行中寫「正在更新…」、不以 alert 打斷，重試鈕顯示進行中且按了不重送', () => {
    const onRetry = vi.fn();
    render(
      <AdminListError
        message="連線失敗"
        retryLabel="重試"
        tone="flow"
        onRetry={onRetry}
        retrying
      />,
    );
    // 不切任何 live 角色：播報交給頁面常駐的狀態容器（工具列的狀態文字，或沒有工具列的頁面自己的那一個；
    // 業主 R4）。
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('正在更新…')).toBeTruthy();
    expect(screen.queryByText('連線失敗')).toBeNull();
    const retry = screen.getByRole('button', { name: '重試' });
    expect(retry.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
