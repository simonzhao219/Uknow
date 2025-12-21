import { useNavigate, useLocation } from 'react-router-dom';

/**
 * 智能返回導航 Hook
 * 
 * @returns handleBack - 返回函數，如果有上一頁則返回上一頁，否則導航到首頁
 * 
 * @example
 * ```tsx
 * const handleBack = useBackNavigation();
 * 
 * <Button onClick={handleBack}>
 *   <ArrowLeft />
 * </Button>
 * ```
 */
export function useBackNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // 檢查是否有上一頁可以返回
    // 使用 window.history.state.idx 判斷：
    // - idx === 0 或不存在：表示這是第一個頁面（直接訪問）
    // - idx > 0：表示有上一頁可以返回
    const idx = window.history.state?.idx;
    const canGoBack = idx !== null && idx !== undefined && idx > 0;
    
    if (!canGoBack) {
      // 沒有可返回的歷史記錄，導航到首頁
      navigate('/', { replace: true });
    } else {
      // 有上一頁，返回上一頁
      navigate(-1);
    }
  };

  return handleBack;
}