import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { MAINTENANCE_NOTICE } from '../utils/constants';
import { isAuthenticated } from '../utils/auth';

/**
 * 系統維護預告橫幅組件
 * 
 * 顯示邏輯：
 * 1. enabled 必須為 true
 * 2. 只對會員相關用戶顯示：
 *    - 已登入用戶（在任何頁面都顯示，除了首頁）
 *    - 在註冊/登入頁面的訪客
 * 3. 用戶可以點擊關閉，本次 session 不再顯示
 */
export function MaintenanceBanner() {
  const location = useLocation();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // 檢查是否已關閉
    const dismissed = sessionStorage.getItem('maintenanceBannerDismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }

    // 檢查登入狀態
    isAuthenticated().then(setIsLoggedIn);
  }, []);

  // 如果維護預告未啟用，不顯示
  if (!MAINTENANCE_NOTICE.enabled) {
    return null;
  }

  // 如果用戶已關閉，不顯示
  if (isDismissed) {
    return null;
  }

  // 判斷是否應該顯示橫幅
  const shouldDisplay = () => {
    const currentPath = location.pathname;
    
    // 首頁不顯示（除非已登入）
    if (currentPath === '/' && !isLoggedIn) {
      return false;
    }
    
    // 刊登詳情頁不顯示（除非已登入）
    if (currentPath.startsWith('/service-providers/') && !isLoggedIn) {
      return false;
    }
    
    // 其他情況：
    // - 已登入用戶在任何頁面都顯示
    // - 在註冊/登入相關頁面的訪客也顯示
    if (isLoggedIn) {
      return true;
    }
    
    const authPaths = ['/login', '/register', '/auth/', '/forgot-password'];
    return authPaths.some(path => currentPath.startsWith(path));
  };

  if (!shouldDisplay()) {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem('maintenanceBannerDismissed', 'true');
    setIsDismissed(true);
  };

  // 根據嚴重程度設定樣式
  const severityStyles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800'
  };

  const iconStyles = {
    info: 'text-blue-600',
    warning: 'text-yellow-600'
  };

  const style = severityStyles[MAINTENANCE_NOTICE.severity] || severityStyles.info;
  const iconStyle = iconStyles[MAINTENANCE_NOTICE.severity] || iconStyles.info;

  return (
    <div className={`border-b ${style} animate-in fade-in duration-300`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-3 py-3">
          {/* 圖標 */}
          <Info className={`h-5 w-5 shrink-0 ${iconStyle}`} />
          
          {/* 內容 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-relaxed">
              <span className="font-semibold">{MAINTENANCE_NOTICE.title}</span>
              <span className="mx-2">·</span>
              <span>{MAINTENANCE_NOTICE.message}</span>
            </p>
          </div>
          
          {/* 關閉按鈕 */}
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
            aria-label="關閉維護預告"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
