import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * 換一個值就重置錯誤狀態。App 餵的是目前路由路徑。
   *
   * 少了它，boundary 掛在 `<Routes>` 外層而 `hasError` 永不歸零＝**任何一頁
   * 的一次 render 錯誤，會鎖死整個 SPA session 的內容區**：使用者換到完全
   * 健康的頁面，看到的仍是後備畫面（2026-08-07 admin 事故的放大器——
   * chunk 取不到只該讓 /admin 壞，卻讓整個站看起來都壞了）。
   */
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  /** 上一次 render 時的 resetKey，用來判斷「換頁了沒」。 */
  resetKey?: string;
}

/**
 * 全站唯一的 render 錯誤防線。
 *
 * 這個 app 大量渲染外部形狀不受控的資料（public_listings 的 any、
 * localStorage 的 pendingUser JSON），任何一筆髒資料造成的 render throw，
 * 沒有 boundary 時就是整頁白屏且無恢復路徑。掛在 App 的 Routes 外層：
 * Navbar/Footer 保持存活，僅內容區換成後備畫面。
 *
 * 這裡的「重新整理」刻意用整頁 reload——會走到這裡代表 React 樹已經
 * 崩潰，SPA 內部狀態不可信，整頁重開是唯一可靠的恢復。
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): Pick<ErrorBoundaryState, 'hasError'> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): ErrorBoundaryState | null {
    // 只在 resetKey 真的變了才重置。同一頁重複 render 時維持後備畫面，
    // 否則會不斷重試同一個必爆的子樹，變成 render 迴圈。
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught a render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg mb-2">頁面發生錯誤</p>
          <p className="text-sm text-muted-foreground mb-6">
            很抱歉，頁面載入時發生問題。請重新整理後再試一次；若持續發生請聯繫客服。
          </p>
          <Button onClick={() => window.location.reload()}>重新整理</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
