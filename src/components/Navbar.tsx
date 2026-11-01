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
import type { AdminWithdrawalSummaryResponse } from '@contract';
import { useFunnelLogout } from '../hooks/useFunnelLogout';
import { clearAuthHint } from '../utils/authHint';
import type { AuthView } from '../utils/authView';
import { funnelCtaLabel, isFunnelRoute, routeForFunnelNext } from '../utils/registrationFlow';
import logoImage from 'figma:asset/1f99716ab54515df4eecc150e3746c995a4a44b8.png';

// 走專用的輕量端點（規劃書 §2.2）。用列表端點也拿得到這個數字，但那條會
// 順便替該筆記錄的會員產身分證簽名 URL——每次 admin 載入頁面都替某個人的
// 證件開一次臨時外連，只為了讀一個計數。
async function loadPendingWithdrawalCount(): Promise<number> {
  const res = await apiRequestJson<AdminWithdrawalSummaryResponse>(
    buildApiUrl('/admin/withdrawals/summary'),
  );
  return res.data.pendingCount ?? 0;
}

export function Navbar() {
  const { user, setUser, isLoggedIn, isAdmin, authView, nextFunnelRoute, hintInitial, hintNext } =
    useContext(UserContext);
  // 舊的 context mock 沒有 authView：依 isLoggedIn 回落（同 resolveAuthView）。
  const view: AuthView = authView ?? (isLoggedIn ? 'member' : 'guest');
  const funnelLogout = useFunnelLogout();
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

      // 首繪提示一併清：signOut 網路失敗時 SIGNED_OUT 不一定觸發，殘留 member
      // 提示會讓下一個在這台裝置登入的人先看到前一人的首字（S11）。
      clearAuthHint();

      // ✅ 2. 登出 Supabase Auth（等待完成）
      let signOutError: unknown = null;
      try {
        ({ error: signOutError } = await supabase.auth.signOut());
      } catch (e) {
        signOutError = e;
      }
      if (signOutError) {
        console.error('Navbar: Error signing out from Supabase:', signOutError);
        // supabase-js 在網路錯誤時不清本機 session：補一次 local 登出。
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
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
          {/* 寬高屬性讓瀏覽器在圖載入前就保留比例（約 119×40），右側容器不因 logo 晚到而位移。 */}
          <img
            src={logoImage}
            alt="Uknow Logo"
            width={1246}
            height={418}
            className="h-10 w-auto object-contain"
          />
        </Link>

        {/* 右側容器固定高度、吃滿剩餘寬度：換版時只換子節點，容器本身不位移（S9 CLS=0）；窄寬間距收小。 */}
        <div className="flex h-11 min-w-0 flex-1 items-center justify-end space-x-2 sm:space-x-4">
          {view === 'guest' && (
            <>
              <Button variant="ghost" asChild>
                <Link to="/login">登入</Link>
              </Button>
              <Button asChild>
                <Link to="/register">立即刊登</Link>
              </Button>
            </>
          )}

          {/* 判定前的中性占位（D5、E2）：保留與頭像同高的槽，換版不位移。 */}
          {view === 'placeholder' && (
            <div aria-hidden="true" data-testid="auth-slot-placeholder" className="h-10 w-10" />
          )}

          {view === 'funnel' &&
            (() => {
              // 漏斗頁上只給登出（W2-22）；離開漏斗頁時多一顆下一步（E4）。首繪只有提示時
              // 用提示記的目的地當暫用連結，/profile 回來後同一節點只換 href。
              const onFunnelRoute = isFunnelRoute(location.pathname);
              const ctaHref = nextFunnelRoute ?? routeForFunnelNext(hintNext ?? null);
              // 結果頁沒有 tradeNo 只會顯示「缺少訂單編號」：補上前不可點。
              const ctaPending = ctaHref === '/payment/result';
              return (
                <>
                  {!onFunnelRoute && ctaHref && (
                    // 320px 時 logo＋全文鈕＋icon 鈕要同列（F1）：窄寬收一點左右留白。
                    <Button asChild className="px-3 sm:px-4">
                      <Link
                        to={ctaHref}
                        aria-disabled={ctaPending ? 'true' : undefined}
                        onClick={(e) => ctaPending && e.preventDefault()}
                      >
                        {funnelCtaLabel(ctaHref)}
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (!funnelLogout.isLoggingOut) void funnelLogout.logout();
                    }}
                    aria-disabled={funnelLogout.isLoggingOut ? 'true' : undefined}
                    // 窄寬（F1）且旁邊有下一步時只留 icon；漏斗頁單顆時保留文字。
                    aria-label={!onFunnelRoute && ctaHref ? '登出' : undefined}
                    className="min-h-11 min-w-11"
                  >
                    <LogOut className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                    <span className={!onFunnelRoute && ctaHref ? 'hidden sm:inline' : ''}>
                      登出
                    </span>
                  </Button>
                </>
              );
            })()}

          {(view === 'member' || view === 'member-pending') && (
            <>
              {/* ui-ux-guidelines §3：主要入口不藏在下拉裡。admin 每天要處理
                  提領，多兩下點擊乘上每天的次數不是小事。待處理以小圓點標示
                  （絕對定位：晚到的筆數不撐寬按鈕），筆數放在可及名稱裡；
                  只在真的有待處理時出現——常駐一個 0 會訓練人忽略它。 */}
              {view === 'member' && isAdmin && (
                <Button variant="ghost" size="sm" asChild className="relative">
                  <Link
                    to="/admin"
                    aria-label={
                      pendingCount > 0 ? `平台管理（待處理 ${pendingCount} 筆）` : undefined
                    }
                  >
                    <Shield className="mr-1 h-4 w-4" />
                    平台管理
                    {pendingCount > 0 && (
                      <span
                        aria-hidden="true"
                        data-testid="admin-pending-dot"
                        className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive"
                      />
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
                    aria-busy={view === 'member-pending' ? 'true' : undefined}
                    className="relative h-10 w-10 rounded-full"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {view === 'member' ? user?.name?.charAt(0) || 'U' : hintInitial}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  {view === 'member-pending' ? (
                    // /profile 回來前只列登出（不列一排灰色項目）。
                    <p className="p-2 text-sm text-muted-foreground" role="status">
                      載入中…
                    </p>
                  ) : (
                    <>
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
                      {/* 平台管理已移到導覽列本身（見上），不再重複列在下拉裡
                        ——同一個入口出現兩次會讓人以為是兩個不同的地方。 */}
                    </>
                  )}
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
