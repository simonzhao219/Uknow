import { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Target, Share2, Award, User, type LucideIcon } from 'lucide-react';
import { UserContext } from '../App';
import { useFeatures } from '../contexts/FeatureContext';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

/**
 * 手機底部導覽（拇指區）。僅登入會員可見、僅手機顯示（md:hidden）。
 * 用語意化 <nav>/<ul>/NavLink，active 時 NavLink 自動加上 aria-current="page"，
 * 對無障礙與 Playwright get_by_role 測試友善。項目依 feature flag 動態顯示。
 *
 * 排序＝使用者動線「發現 → 做事賺 → 拉人賺 → 收錢 → 我」，兩個賺 Point
 * 的入口相鄰成一組。首頁固定最左、會員固定最右（行動裝置慣例），中間三
 * 格依 feature flag 依序填入——不論 flag 怎麼開關，剩下項目的相對順序都
 * 不變，使用者的位置記憶才不會在不同帳號狀態下漂移。
 *
 * 「刊登」刻意不在這裡：它是服務提供者專屬（多數會員永遠不會點）且屬於
 * 設定完就放著的低頻管理功能，放在只有五格的拇指區是浪費。主入口在會員
 * 中心的刊登管理卡片（顯示目前刊登內容或建立 CTA），桌機另有 Navbar 選單。
 * 讓出來的位置給推薦管理：它是成長迴圈的核心、且有「有沒有新下線」這種
 * 需要反覆回看的資料，屬於高頻。
 *
 * 推薦用 Share2 而非 Users——後者在 20px 下與最右格的 User 幾乎分不出來，
 * 且分享推薦碼正是這頁的主要動作。
 */
export function BottomNav() {
  const { isLoggedIn } = useContext(UserContext);
  const { isFeatureEnabled } = useFeatures();

  if (!isLoggedIn) return null;

  const items: NavItem[] = [
    { to: '/', label: '首頁', icon: Home, end: true },
    isFeatureEnabled('taskCenter') && { to: '/tasks', label: '任務', icon: Target },
    isFeatureEnabled('referralManagement') && { to: '/referrals', label: '推薦', icon: Share2 },
    isFeatureEnabled('rewardSystem') && { to: '/rewards', label: '獎勵', icon: Award },
    { to: '/dashboard', label: '會員', icon: User },
  ].filter(Boolean) as NavItem[];

  return (
    <nav
      aria-label="主要導覽"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                  isActive ? 'text-primary font-medium' : 'text-muted-foreground'
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
