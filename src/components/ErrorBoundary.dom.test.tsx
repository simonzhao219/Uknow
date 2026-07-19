import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('boom');
}

beforeEach(() => {
  // 抑制 React 對 boundary 捕捉之錯誤的 console 噪音，讓測試輸出乾淨。
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('子元件正常時如實渲染子樹', () => {
    render(
      <ErrorBoundary>
        <div>正常內容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('正常內容')).toBeInTheDocument();
  });

  it('子元件 render 期 throw → 顯示還原 UI（role=alert），不白屏', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '回首頁' })).toBeInTheDocument();
  });

  it('可用自訂 fallback', () => {
    render(
      <ErrorBoundary fallback={(err) => <p>壞了：{err.message}</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('壞了：boom')).toBeInTheDocument();
  });
});
