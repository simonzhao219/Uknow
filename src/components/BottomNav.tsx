import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, ClipboardList, Target, Award, User, LucideIcon } from 'lucide-react';
import { UserContext } from '../App';
import { useFeatures } from '../contexts/FeatureContext';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

/**
 * 手機底部導覽（拇指區）。僅登入會員可見、僅手機顯示（md:hidden）。
 * 用語意化 <nav>/<ul>/NavLink，active 時 NavLink 自動加上 aria-current="page"，
 * 對無障礙與 Playwright get_by_role 測試友善。項目依 feature flag 動態顯示。
 */
export function BottomNav() {
  const { isLoggedIn } = useContext(UserContext);
  const { isFeatureEnabled } = useFeatures();

  if (!isLoggedIn) return null;

  const items: NavItem[] = [
    { to: '/', label: '首頁', icon: Home, end: true },
    isFeatureEnabled('serviceProviderManagement') && {
      to: '/service-providers',
      label: '刊登',
      icon: ClipboardList,
    },
    isFeatureEnabled('taskCenter') && { to: '/tasks', label: '任務', icon: Target },
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
