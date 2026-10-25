// @vitest-environment jsdom
//
// 重試後的焦點落點（ui-ux-guidelines §9）：錯誤框一換成載入中，按下的重試鈕就卸載了，
// 焦點掉到 body。落地時若焦點仍在 body，失敗交給錯誤框、成功交給頁面標題；
// 首次載入不搶焦點，焦點已在別處也不搶。
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRetryFocus } from './useRetryFocus';

afterEach(cleanup);

function Harness({
  loading,
  failed,
  onRetry = () => {},
}: {
  loading: boolean;
  failed: boolean;
  onRetry?: () => void;
}) {
  const { errorRef, headingRef, retry } = useRetryFocus({ loading, failed });
  if (loading) return <p>載入中</p>;
  return (
    <div>
      <input aria-label="別處的輸入框" />
      <h1 ref={headingRef} tabIndex={-1}>
        頁面標題
      </h1>
      {failed ? (
        <div ref={errorRef} tabIndex={-1} data-testid="error-box">
          <button type="button" onClick={() => retry(onRetry)}>
            重試
          </button>
        </div>
      ) : (
        <p>內容</p>
      )}
    </div>
  );
}

function pressRetry(view: ReturnType<typeof render>) {
  const button = screen.getByRole('button', { name: '重試' });
  act(() => button.focus());
  fireEvent.click(button);
  view.rerender(<Harness loading failed={false} />);
}

describe('useRetryFocus', () => {
  it('重試後仍失敗時，焦點落到錯誤框', () => {
    const view = render(<Harness loading={false} failed />);
    pressRetry(view);
    view.rerender(<Harness loading={false} failed />);
    expect(document.activeElement).toBe(screen.getByTestId('error-box'));
  });

  it('重試成功時，焦點落到頁面標題', () => {
    const view = render(<Harness loading={false} failed />);
    pressRetry(view);
    view.rerender(<Harness loading={false} failed={false} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '頁面標題' }));
  });

  it('重試進行中不移動焦點，落地才移動', () => {
    const view = render(<Harness loading={false} failed />);
    pressRetry(view);
    expect(document.activeElement).toBe(document.body);
    view.rerender(<Harness loading={false} failed={false} />);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('首次載入不搶焦點', () => {
    const view = render(<Harness loading failed={false} />);
    view.rerender(<Harness loading={false} failed={false} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('焦點在重試落地前已移到別處時，不搶回來', () => {
    const view = render(<Harness loading={false} failed />);
    pressRetry(view);
    view.rerender(<Harness loading={false} failed={false} />);
    const input = screen.getByRole('textbox', { name: '別處的輸入框' });
    act(() => input.focus());
    view.rerender(<Harness loading={false} failed />);
    expect(document.activeElement).toBe(input);
  });

  it('retry 會呼叫傳入的重發函式', () => {
    let called = 0;
    render(<Harness loading={false} failed onRetry={() => (called += 1)} />);
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(called).toBe(1);
  });
});
