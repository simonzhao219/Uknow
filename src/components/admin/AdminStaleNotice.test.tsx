// @vitest-environment jsdom
//
// 有舊資料時的「更新失敗／更新較久」提示（列表上方）。讀取失敗不上紅（規格書
// §13 第 4 條），所以是 warning；失敗時以 alert 打斷一次，逾時不打斷。手動重新
// 整理或重試觸發的失敗也不帶 alert——狀態文字已經播過「更新失敗」，不念第二次。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AdminStaleNotice } from './AdminStaleNotice';

afterEach(cleanup);

describe('AdminStaleNotice', () => {
  it('更新失敗時說出資料時間與原因，帶次要重試', () => {
    const onRetry = vi.fn();
    render(<AdminStaleNotice kind="failed" age="3 分鐘前" reason="連線中斷" onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('更新失敗，以下是 3 分鐘前的資料');
    expect(alert.textContent).toContain('連線中斷');
    const retry = within(alert).getByRole('button', { name: '重試' });
    expect(retry.className).toContain('bg-card');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('不到 1 分鐘的資料寫「剛剛」', () => {
    render(<AdminStaleNotice kind="failed" age="剛剛" onRetry={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('更新失敗，以下是剛剛的資料');
  });

  it('手動重新整理觸發的失敗不再帶 alert，文字照樣在', () => {
    render(<AdminStaleNotice kind="failed" age="剛剛" onRetry={vi.fn()} announce={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/更新失敗，以下是剛剛的資料/)).toBeTruthy();
  });

  it('更新較久時不帶任何 live 角色，不打斷', () => {
    render(<AdminStaleNotice kind="slow" age="3 分鐘前" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/更新較久，以下是 3 分鐘前的資料/)).toBeTruthy();
  });

  it('逾時的提示只有給了 onRetry 才放重試鈕', () => {
    const { rerender } = render(<AdminStaleNotice kind="slow" age="剛剛" />);
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
    rerender(<AdminStaleNotice kind="slow" age="剛剛" onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });

  it('提領頁另說明收款資訊已隱藏', () => {
    render(
      <AdminStaleNotice
        kind="failed"
        age="剛剛"
        onRetry={vi.fn()}
        hidden="收款資訊已隱藏，重試後顯示"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('收款資訊已隱藏，重試後顯示');
  });

  // 重試期間遮罩不解開（業主 2026-10-07 裁決 A）：提示留在原位、說出正在更新；狀態文字已在播
  // 「正在更新」，不再以 alert 打斷。鈕留著（焦點不掉到 body）但顯示進行中、按了不重送。
  it('重讀進行中寫「正在更新…」、不帶 live 角色，重試鈕顯示進行中且按了不重送', () => {
    const onRetry = vi.fn();
    render(
      <AdminStaleNotice
        kind="updating"
        age="3 分鐘前"
        reason="連線中斷"
        hidden="收款資訊已隱藏，更新完成後顯示"
        onRetry={onRetry}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('正在更新…')).toBeTruthy();
    expect(screen.queryByText('連線中斷')).toBeNull();
    expect(screen.getByText('收款資訊已隱藏，更新完成後顯示')).toBeTruthy();
    const retry = screen.getByRole('button', { name: '重試' });
    expect(retry.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
