import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../utils/apiClient';
import type { Announcement } from '@contract';

/**
 * 全站公告橫幅組件
 *
 * 資料來源：GET /announcements/active（admin 後台「公告管理」建立，
 * 取代過去寫死在 constants.ts 的維護預告）。
 *
 * 顯示邏輯：
 * 1. 有生效中的公告（is_active 且 now 落在 starts_at ~ ends_at）
 * 2. 只對會員相關用戶顯示：
 *    - 已登入用戶（在任何頁面都顯示，除了首頁）
 *    - 在註冊/登入頁面的訪客
 * 3. 用戶可以點擊關閉，同一則公告本次 session 不再顯示
 */
export function MaintenanceBanner() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    try {
      setDismissedIds(JSON.parse(sessionStorage.getItem('dismissedAnnouncements') || '[]'));
    } catch { /* 壞資料視同沒關閉過 */ }

    isAuthenticated().then(setIsLoggedIn);

    // 公開端點、不需登入；失敗就不顯示橫幅（不打擾使用者）
    fetch(buildApiUrl('/announcements/active'))
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const list: Announcement[] = body?.data?.announcements ?? [];
        setAnnouncement(list[0] ?? null);
      })
      .catch(() => setAnnouncement(null));
  }, []);

  if (!announcement || dismissedIds.includes(announcement.id)) {
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
    const next = [...dismissedIds, announcement.id];
    sessionStorage.setItem('dismissedAnnouncements', JSON.stringify(next));
    setDismissedIds(next);
  };

  // 根據類型設定樣式
  const severityStyles: Record<string, string> = {
    info:    'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error:   'bg-red-50 border-red-200 text-red-800',
  };

  const iconStyles: Record<string, string> = {
    info:    'text-blue-600',
    warning: 'text-yellow-600',
    error:   'text-red-600',
  };

  const style = severityStyles[announcement.type] || severityStyles.info;
  const iconStyle = iconStyles[announcement.type] || iconStyles.info;

  return (
    <div className={`border-b ${style} animate-in fade-in duration-300`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-3 py-3">
          {/* 圖標 */}
          <Info className={`h-5 w-5 shrink-0 ${iconStyle}`} />

          {/* 內容 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-relaxed">
              <span className="font-semibold">{announcement.title}</span>
              <span className="mx-2">·</span>
              <span>{announcement.message}</span>
            </p>
          </div>

          {/* 關閉按鈕 */}
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
            aria-label="關閉公告"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
