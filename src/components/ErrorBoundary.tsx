import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 自訂 fallback；不給則用預設的還原 UI。 */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 全域錯誤邊界。
 *
 * 沒有它的話，任何 render 期的 throw 會讓整個 SPA 白屏——對金流/獎勵這種
 * 應用尤其致命。這裡攔截子樹的例外，改顯示可還原的畫面（重試 / 回首頁），
 * 並在 console 記錄，讓使用者不至於卡在一片空白。
 *
 * 用 class component 是因為錯誤邊界目前只能由 class 的 getDerivedStateFromError
 * / componentDidCatch 實作（React 尚無 hook 版）。
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] 捕捉到未處理的 render 例外:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div
          role="alert"
          className="max-w-md mx-auto mt-16 text-center space-y-4 p-6 border rounded-lg bg-card"
        >
          <h2 className="text-xl font-bold">發生了一點問題</h2>
          <p className="text-sm text-muted-foreground">
            畫面遇到未預期的錯誤。您可以重試，或回到首頁。
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={this.reset}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
            >
              重試
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-md border text-sm"
            >
              回首頁
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
