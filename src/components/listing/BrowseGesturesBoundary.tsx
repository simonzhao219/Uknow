import { Component, type ReactNode } from 'react';

/**
 * 換篇手勢 chunk（BrowseGestures）載入失敗時的降級：只丟掉滑動與鍵盤，詳情頁與「‹ ›」按鈕照常。
 * 刻意靜默（fallback=null，只寫 console.error）：按鈕仍可換篇，不需要為少了手勢打擾使用者。
 * 與整頁用的 ErrorBoundary 職責不同，不參數化重用；必須留在 entry（包在動態 chunk 之外）。
 * React.lazy 會快取拒絕結果，失敗後同一次造訪不再重試，重新整理才會恢復。
 */
export class BrowseGesturesBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('❌ 換篇手勢載入失敗，已降級為只有按鈕換篇:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
