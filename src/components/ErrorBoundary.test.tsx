// @vitest-environment jsdom
//
// 全站唯一的 render 錯誤防線。這個 app 大量渲染外部形狀不受控的資料
// （public_listings 的 any、localStorage 的 pendingUser JSON），任何一筆
// 髒資料造成的 render throw，在沒有 ErrorBoundary 時就是整頁白屏且無
// 恢復路徑——付費金流平台的最壞情境。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('boom');
}

// vitest 沒開 globals，testing-library 的自動 cleanup 不會掛上——不自己清
// 的話每個 it 的 DOM 會疊在同一個 document.body，跨測試查詢到彼此的節點。
afterEach(cleanup);

describe('ErrorBoundary', () => {
  it('子樹 render 拋錯時顯示後備畫面與重新整理按鈕，而非白屏', () => {
    // React 會把 boundary 捕捉到的錯誤照樣印到 console，靜音避免測試噪音
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
      expect(screen.getByText('頁面發生錯誤')).toBeTruthy();
      expect(screen.getByRole('button', { name: '重新整理' })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('resetKey 改變時清掉錯誤狀態，換頁後不再卡在後備畫面', () => {
    // boundary 掛在 <Routes> 外層，換頁不會讓它 unmount。少了這個重置，
    // 任何一頁的一次錯誤就鎖死整個 SPA session 的內容區。
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { rerender } = render(
        <ErrorBoundary resetKey="/">
          <Bomb />
        </ErrorBoundary>,
      );
      expect(screen.getByText('頁面發生錯誤')).toBeTruthy();

      rerender(
        <ErrorBoundary resetKey="/admin">
          <div>後台內容</div>
        </ErrorBoundary>,
      );
      expect(screen.getByText('後台內容')).toBeTruthy();
      expect(screen.queryByText('頁面發生錯誤')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('resetKey 不變時維持後備畫面，不會反覆重試必爆的子樹', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { rerender } = render(
        <ErrorBoundary resetKey="/">
          <Bomb />
        </ErrorBoundary>,
      );
      rerender(
        <ErrorBoundary resetKey="/">
          <Bomb />
        </ErrorBoundary>,
      );
      expect(screen.getByText('頁面發生錯誤')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('正常子樹原樣渲染、不加任何包裝', () => {
    render(
      <ErrorBoundary>
        <div>正常內容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('正常內容')).toBeTruthy();
  });
});
