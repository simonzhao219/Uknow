import { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { UserContext } from '../App';
import { User, Settings, Award, Users, LogOut, Shield, Target } from 'lucide-react';
import { useFeatures } from '../contexts/FeatureContext';
import { createClient } from '../utils/supabase/client';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';
import { Badge } from './ui/badge';
import type { AdminWithdrawalsResponse } from '@contract';
import logoImage from 'figma:asset/1f99716ab54515df4eecc150e3746c995a4a44b8.png';

// 只取彙總，不取列表——`limit=1` 讓後端照樣算出整個 pending 的筆數，
// 但不用把一整頁提領記錄搬到導覽列來。
async function loadPendingWithdrawalCount(): Promise<number> {
  const res = await apiRequestJson<AdminWithdrawalsResponse>(
    buildApiUrl('/admin/withdrawals?status=pending&limit=1&offset=0'),
  );
  return res.data.stats?.byStatus.pending ?? 0;
}

export function Navbar() {
  const { user, setUser, isLoggedIn, isAdmin } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { isFeatureEnabled } = useFeatures();
  const supabase = createClient();
  const [pendingCount, setPendingCount] = useState(0);

  // 非 admin 一律不打這支——他們只會拿到 403，白費一次往返，還在後端
  // 日誌裡製造一堆假的權限告警。失敗就當 0：導覽列不該因為一個附帶的
  // 數字取不到而壞掉。
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    loadPendingWithdrawalCount()
      .then((n) => alive && setPendingCount(n))
      .catch(() => alive && setPendingCount(0));
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const handleLogout = async () => {
    console.log('Navbar: Logging out user...');

    try {
      // ✅ 1. 先清除本地狀態（避免 UI 閃爍）
      setUser(null);
      localStorage.removeItem('user');
      console.log('Navbar: Cleared local user state');

      // ✅ 2. 登出 Supabase Auth（等待完成）
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Navbar: Error signing out from Supabase:', error);
        // ✅ 即使出錯也要清除所有相關資料
      } else {
        console.log('Navbar: Successfully signed out from Supabase');
      }

      // ✅ 3. 強制清除所有 Supabase auth storage
      const storageKeys = Object.keys(localStorage);
      storageKeys.forEach((key) => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
          console.log('Navbar: Cleared storage key:', key);
        }
      });

      // ✅ 4. 短暫延遲確保 session 清除完成，然後導航
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log('Navbar: Navigating to home page...');
      // ✅ 使用 replace: true 避免返回歷史
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Navbar: Unexpected error during logout:', error);
      // ✅ 即使發生異常，也要確保導航
      navigate('/', { replace: true });
    }
  };

  return (
    <nav className="border-b bg-card sticky top-0 z-40">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <img src={logoImage} alt="Uknow Logo" className="h-10 object-contain" />
        </Link>

        <div className="flex items-center space-x-4">
          {!isLoggedIn ? (
            <>
              <Button variant="ghost" asChild>
                <Link to="/login">登入</Link>
              </Button>
              <Button asChild>
                <Link to="/register">立即刊登</Link>
              </Button>
            </>
          ) : (
            <>
              {/* ui-ux-guidelines §3：主要入口不藏在下拉裡。admin 每天要處理
                  提領，多兩下點擊乘上每天的次數不是小事。badge 只在真的有
                  待處理時出現——常駐一個 0 會訓練人忽略它。 */}
              {isAdmin && (
                <Button variant="ghost" size="sm" asChild className="relative">
                  <Link to="/admin">
                    <Shield className="mr-1 h-4 w-4" />
                    平台管理
                    {pendingCount > 0 && (
                      <Badge variant="destructive" className="ml-1 px-1.5">
                        {pendingCount}
                      </Badge>
                    )}
                  </Link>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="開啟會員選單"
                    className="relative h-10 w-10 rounded-full"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      <p className="font-medium">{user?.name}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard" className="w-full cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      會員中心
                    </Link>
                  </DropdownMenuItem>
                  {isFeatureEnabled('serviceProviderManagement') && (
                    <DropdownMenuItem asChild>
                      <Link to="/service-providers" className="w-full cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" />
                        刊登管理
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isFeatureEnabled('referralManagement') && (
                    <DropdownMenuItem asChild>
                      <Link to="/referrals" className="w-full cursor-pointer">
                        <Users className="mr-2 h-4 w-4" />
                        推薦管理
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isFeatureEnabled('taskCenter') && (
                    <DropdownMenuItem asChild>
                      <Link to="/tasks" className="w-full cursor-pointer">
                        <Target className="mr-2 h-4 w-4" />
                        任務中心
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isFeatureEnabled('rewardSystem') && (
                    <DropdownMenuItem asChild>
                      <Link to="/rewards" className="w-full cursor-pointer">
                        <Award className="mr-2 h-4 w-4" />
                        獎勵回饋
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {/* 移除訂閱管理連結 - 訂閱功能已整合到會員中心 */}
                  {/* 平台管理已移到導覽列本身（見上），不再重複列在下拉裡
                    ——同一個入口出現兩次會讓人以為是兩個不同的地方。 */}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    登出
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
