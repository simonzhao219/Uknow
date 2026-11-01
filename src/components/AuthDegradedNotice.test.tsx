// @vitest-environment jsdom
//
// degraded 提示（T1-B §4.1，W4-15／W4-16）：純呈現元件，守衛與結帳頁共用。
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthDegradedNotice } from './AuthDegradedNotice';

afterEach(cleanup);

const props = (over: Partial<Parameters<typeof AuthDegradedNotice>[0]> = {}) => ({
  onRetry: vi.fn(),
  onSignOut: vi.fn(),
  isRetrying: false,
  failedAgain: false,
  ...over,
});

describe('AuthDegradedNotice', () => {
  it('顯示網路不穩的標題（h2）與「請稍後按重試」', () => {
    render(<AuthDegradedNotice {...props()} />);
    expect(screen.getByRole('heading', { level: 2, name: '網路不穩，正在重新連線' })).toBeTruthy();
    expect(screen.getByText('請稍後按重試')).toBeTruthy();
    expect(screen.getByTestId('auth-degraded')).toBeTruthy();
  });

  it('重試又失敗後說明換成「仍無法連線」', () => {
    render(<AuthDegradedNotice {...props({ failedAgain: true })} />);
    expect(screen.getByText('仍無法連線，請稍後按重試')).toBeTruthy();
  });

  it('按重試呼叫 onRetry、按登出呼叫 onSignOut', () => {
    const p = props();
    render(<AuthDegradedNotice {...p} />);
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    fireEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    expect(p.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('重試中鈕文字改「重新連線中…」、aria-disabled，再按不重複呼叫', () => {
    const p = props({ isRetrying: true });
    render(<AuthDegradedNotice {...p} />);
    const btn = screen.getByRole('button', { name: '重新連線中…' });
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(btn);
    expect(p.onRetry).not.toHaveBeenCalled();
  });

  it('登出鈕連點只呼叫一次，進行中為 aria-disabled', () => {
    const p = props({ onSignOut: vi.fn(() => new Promise<void>(() => {})) });
    render(<AuthDegradedNotice {...p} />);
    const btn = screen.getByRole('button', { name: '登出' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(p.onSignOut).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('首次出現不搶焦點', () => {
    render(<AuthDegradedNotice {...props()} />);
    expect(document.activeElement).toBe(document.body);
  });
});
