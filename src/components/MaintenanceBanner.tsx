import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CircleAlert, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../utils/apiClient';
import type { Announcement } from '@contract';

/**
 * 嚴重度呈現表。
 *
 * 圖示隨嚴重度變化，不是裝飾：圖形是橫幅上最快被辨識的訊號，全部固定成
 * Info 等於把最強的注意力線索接到常數上。srLabel 則補上「顏色與圖示都
 * 拿不到」的讀屏使用者——嚴重度不能只由顏色承載。
 */
const SEVERITY: Record<string, { bar: string; icon: string; Icon: LucideIcon; srLabel: string }> = {
  info: {
    bar: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: 'text-blue-600',
    Icon: Info,
    srLabel: '網站公告',
  },
  warning: {
    bar: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: 'text-yellow-600',
    Icon: TriangleAlert,
    srLabel: '網站公告（注意）',
  },
  error: {
    bar: 'bg-red-50 border-red-200 text-red-800',
    icon: 'text-red-600',
    Icon: CircleAlert,
    srLabel: '網站公告（重要）',
  },
};

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
    } catch {
      /* 壞資料視同沒關閉過 */
    }

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
    return authPaths.some((path) => currentPath.startsWith(path));
  };

  if (!shouldDisplay()) {
    return null;
  }

  const handleDismiss = () => {
    const next = [...dismissedIds, announcement.id];
    sessionStorage.setItem('dismissedAnnouncements', JSON.stringify(next));
    setDismissedIds(next);
  };

  // API 回應未經 schema 驗證，未知 type 一律降級成 info 而不是崩掉整頁
  const severity = SEVERITY[announcement.type] ?? SEVERITY.info;
  const SeverityIcon = severity.Icon;

  return (
    // role=status：公告是非同步注入的，沒有 live region 的話讀屏使用者
    // 完全不會知道頁面上多了一則公告。
    <div className={`border-b ${severity.bar} animate-in fade-in duration-300`} role="status">
      {/* 與 <main> 用同一個 container：橫幅的中軸就是頁面內容的中軸 */}
      <div className="container mx-auto px-4">
        {/*
          手機維持流式左對齊——窄螢幕上文字本來就填滿整列，沒有「看不到」
          的問題，置中反而浪費寬度。sm 以上才置中：橫幅橫跨整個視窗，訊息
          一旦貼邊就落在視線動線之外（版面主體全在中軸上）。關閉鈕在 sm
          以上改絕對定位釘住右緣，否則它會把訊息擠離中軸。
        */}
        <div className="relative flex items-center gap-3 py-3 sm:justify-center sm:px-12">
          <SeverityIcon className={`h-5 w-5 shrink-0 ${severity.icon}`} aria-hidden="true" />

          {/* sm:flex-initial：訊息不再吃掉整列寬度（撐滿正是把文字推到邊緣
              的元凶）。sm:max-w-3xl：長公告在寬螢幕不會拉成超出可讀行長的
              一整列。text 維持左對齊——換行後的置中文字更難讀。 */}
          <p className="min-w-0 flex-1 break-words text-sm font-medium leading-relaxed sm:max-w-3xl sm:flex-initial">
            <span className="sr-only">{severity.srLabel}：</span>
            <span className="font-semibold">{announcement.title}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>{announcement.message}</span>
          </p>

          {/* 熱區 44px（ui-ux-guidelines §1）。-my-3 抵銷列的 py-3，讓熱區
              長大但橫幅不變高；sm 以上絕對定位、脫離流排版，本來就不影響
              高度，故 my 歸零以免 -translate-y-1/2 被margin 帶偏。 */}
          <button
            type="button"
            onClick={handleDismiss}
            className="-my-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 sm:absolute sm:top-1/2 sm:right-0 sm:my-0 sm:-translate-y-1/2"
            aria-label="關閉公告"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
