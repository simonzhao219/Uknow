// @vitest-environment jsdom
//
// 整頁主內容讀取失敗的共用黃框（ui-ux-guidelines §12.11）：標題、說明、重試鈕靠右、
// 重試後的焦點落點。StatusCallout 不轉發 ref，所以焦點落點是外層 tabIndex=-1 的 div。
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoadErrorCallout } from './LoadErrorCallout';

afterEach(cleanup);

describe('LoadErrorCallout', () => {
  it('渲染標題與說明，重試鈕預設寫「重新載入」', () => {
    render(
      <LoadErrorCallout title="暫時無法取得資料" description="請稍後再試" onRetry={() => {}} />,
    );
    expect(screen.getByText('暫時無法取得資料')).toBeTruthy();
    expect(screen.getByText('請稍後再試')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新載入' })).toBeTruthy();
  });

  it('點重試鈕時呼叫 onRetry', () => {
    const onRetry = vi.fn();
    render(<LoadErrorCallout title="失敗" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('retryLabel 可覆寫鈕上的字', () => {
    render(<LoadErrorCallout title="失敗" onRetry={() => {}} retryLabel="重試" />);
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });

  it('titleAs 指定標題層級，螢幕閱讀器依標題導覽找得到', () => {
    render(<LoadErrorCallout title="暫時無法載入" titleAs="h2" onRetry={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: '暫時無法載入' })).toBeTruthy();
  });

  it('ref 指到外層可程式聚焦的 div，且它包住整個提示框', () => {
    const ref = createRef<HTMLDivElement>();
    render(<LoadErrorCallout ref={ref} title="失敗" onRetry={() => {}} />);
    const wrapper = ref.current;
    expect(wrapper).toBeTruthy();
    expect(wrapper?.getAttribute('tabindex')).toBe('-1');
    expect(wrapper?.querySelector('[data-slot="status-callout"]')).toBeTruthy();
    wrapper?.focus();
    expect(document.activeElement).toBe(wrapper);
  });

  it('是 warning 黃框，重試鈕取 warning 容器色並靠右', () => {
    render(<LoadErrorCallout title="失敗" onRetry={() => {}} />);
    const callout = document.querySelector('[data-slot="status-callout"]');
    expect(callout?.classList.contains('bg-warning-subtle')).toBe(true);
    const button = screen.getByRole('button', { name: '重新載入' });
    expect(button.classList.contains('bg-warning')).toBe(true);
    expect(button.parentElement?.classList.contains('justify-end')).toBe(true);
  });
});
