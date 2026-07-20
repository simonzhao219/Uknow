// @vitest-environment jsdom
//
// 全站唯一的 render 錯誤防線。這個 app 大量渲染外部形狀不受控的資料
// （public_listings 的 any、localStorage 的 pendingUser JSON），任何一筆
// 髒資料造成的 render throw，在沒有 ErrorBoundary 時就是整頁白屏且無
// 恢復路徑——付費金流平台的最壞情境。
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('子樹 render 拋錯時顯示後備畫面與重新整理按鈕，而非白屏', () => {
    // React 會把 boundary 捕捉到的錯誤照樣印到 console，靜音避免測試噪音
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      expect(screen.getByText('頁面發生錯誤')).toBeTruthy();
      expect(screen.getByRole('button', { name: '重新整理' })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('正常子樹原樣渲染、不加任何包裝', () => {
    render(
      <ErrorBoundary>
        <div>正常內容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('正常內容')).toBeTruthy();
  });
});
