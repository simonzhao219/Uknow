import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import type { ProfileResponse } from '@contract';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { Footer } from './components/Footer';
import { MaintenanceBanner } from './components/MaintenanceBanner';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { RequireMembershipRoute } from './components/RequireMembershipRoute'; // ✅ 會員資格守衛（以會籍有效為準）
import { FeatureGate } from './components/FeatureGate';
import { LoadingScreen } from './components/LoadingScreen';
import { NotificationProvider } from './components/notifications/NotificationContext';

// 路由頁面採 lazy 載入 → 各自獨立 chunk，縮小初始 bundle（Admin/付款/各儀表板
// 不再全部打進首屏）。命名匯出需包一層轉成 default 供 React.lazy 使用。
const HomePage = lazy(() => import('./components/HomePage').then((m) => ({ default: m.HomePage })));
const ServiceProviderDetail = lazy(() => import('./components/ServiceProviderDetail').then((m) => ({ default: m.ServiceProviderDetail })));
const AuthPage = lazy(() => import('./components/AuthPage').then((m) => ({ default: m.AuthPage })));
const OTPVerificationPage = lazy(() => import('./components/OTPVerificationPage').then((m) => ({ default: m.OTPVerificationPage })));
const CompleteProfile = lazy(() => import('./components/CompleteProfile').then((m) => ({ default: m.CompleteProfile })));
const PaymentCheckout = lazy(() => import('./components/PaymentCheckout').then((m) => ({ default: m.PaymentCheckout })));
const PaymentResult = lazy(() => import('./components/PaymentResult').then((m) => ({ default: m.PaymentResult })));
const ForgotPasswordPage = lazy(() => import('./components/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const MemberDashboard = lazy(() => import('./components/MemberDashboard').then((m) => ({ default: m.MemberDashboard })));
const ServiceProviderManagement = lazy(() => import('./components/ServiceProviderManagement').then((m) => ({ default: m.ServiceProviderManagement })));
const CreateServiceProvider = lazy(() => import('./components/CreateServiceProvider').then((m) => ({ default: m.CreateServiceProvider })));
const EditServiceProvider = lazy(() => import('./components/EditServiceProvider').then((m) => ({ default: m.EditServiceProvider })));
const ReferralManagement = lazy(() => import('./components/ReferralManagement').then((m) => ({ default: m.ReferralManagement })));
const TaskDashboard = lazy(() => import('./components/TaskDashboard').then((m) => ({ default: m.TaskDashboard })));
const RewardDashboard = lazy(() => import('./components/RewardDashboard').then((m) => ({ default: m.RewardDashboard })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const MarkdownContent = lazy(() => import('./components/MarkdownContent').then((m) => ({ default: m.MarkdownContent })));
import { FeatureProvider } from './contexts/FeatureContext';
import { DataCacheProvider, useDataCache } from './contexts/DataCacheContext'; // ✅ 新增：資料快取
import { createClient } from './utils/supabase/client';
import { apiRequest, buildApiUrl } from './utils/apiClient';
import { onSessionExpired } from './utils/authEvents';
import { isProfileComplete } from './utils/registrationFlow';
import { termsOfServiceContent } from './content/termsOfService';
import { listingPlansContent } from './content/listingPlans';
import { referralRewardRulesContent } from './content/referralRewardRules';
import { referralRewardContractContent } from './content/referralRewardContract';

// User context
export const UserContext = React.createContext<{
  user: ProfileResponse | null;
  setUser: (user: ProfileResponse | null) => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isLoadingUser: boolean; // ✅ P1: 全局 loading state
  /** 靜默重抓 /profile 並更新 context；回傳最新 profile（失敗回 null）。 */
  refreshUser: () => Promise<ProfileResponse | null>;
}>({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  isAdmin: false,
  isLoadingUser: true, // ✅ 預設為 true
  refreshUser: async () => null,
});

function AppContent() {
  const [user, setUser] = useState<ProfileResponse | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true); // ✅ P1: 全局 loading state
  const navigate = useNavigate();
  const location = useLocation();
  const supabase = createClient();
  const { clearCache } = useDataCache(); // ✅ 新增：使用資料快取
  // 記錄目前已載入 profile 的使用者 id，用來分辨「真的登入」與分頁重新可見時
  // Supabase 重複廣播的 SIGNED_IN（同一個使用者、token 沒換發也會發一次）。
  const loadedUserIdRef = useRef<string | null>(null);

  // Check if user is admin
  const isAdmin = user?.isAdmin === true;
  const isLoggedIn = !!user;

  useEffect(() => {
    let isMounted = true;

    const loadUserProfile = async (accessToken: string) => {
      if (!isMounted) return;
      try {
        setIsLoadingUser(true);
        const response = await fetch(buildApiUrl('/profile'), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          if (response.status === 404 || response.status === 410 || response.status === 401) {
            await supabase.auth.signOut();
            localStorage.removeItem('user');
            localStorage.removeItem('pendingSession');
            loadedUserIdRef.current = null;
            if (isMounted) setUser(null);
          }
          // 其他非認證性錯誤（例如短暫的網路/伺服器問題）保留現有已登入的 user，
          // 避免分頁重新可見時的背景重新驗證，因暫時性錯誤被誤判成登出。
          return;
        }

        const profile = await response.json();
        if (!isMounted) return;

        const hasCompleteProfile = isProfileComplete(profile);
        if (!hasCompleteProfile) {
          if (window.location.pathname !== '/auth/complete-profile') {
            navigate('/auth/complete-profile', { replace: true });
          }
        } else {
          setUser(profile);
          loadedUserIdRef.current = profile.id;
        }
      } catch (error) {
        console.error('App: Error loading user profile:', error);
        // 同上：非認證性錯誤不清空已登入的 user。
      } finally {
        if (isMounted) setIsLoadingUser(false);
      }
    };

    // 初始載入
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        loadUserProfile(session.access_token);
      } else {
        if (isMounted) { setUser(null); setIsLoadingUser(false); }
      }
    });

    // 監聽 auth 狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        // Supabase 在分頁從背景切回可見時，即使 token 沒有換發也會重新廣播一次
        // SIGNED_IN。若是同一個已登入使用者，直接忽略，避免整頁被 spinner 取代
        // 造成「自動重新整理」的錯覺；不同使用者登入時 id 會不同，仍會正常載入。
        if (session.user?.id && session.user.id === loadedUserIdRef.current) {
          return;
        }
        loadUserProfile(session.access_token);
      } else if (event === 'SIGNED_OUT') {
        clearCache();
        loadedUserIdRef.current = null;
        if (isMounted) { setUser(null); setIsLoadingUser(false); }
        localStorage.removeItem('user');
      }
      // TOKEN_REFRESHED：僅換發 token，不需要任何 UI 狀態變化。
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 當 API 請求判定 session 真的過期時（apiClient.ts），以 SPA 導頁的方式跳轉
  // 到登入頁，避免整頁重新載入（window.location.href）造成的閃爍與狀態重置。
  useEffect(() => {
    return onSessionExpired(() => {
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        navigate('/login', { replace: true });
      }
    });
  }, [navigate]);

  // 靜默重抓 /profile：付款開通輪詢、任務領獎後讓路由守衛讀到最新的
  // accountStatus，不用整頁 reload（window.location.href）。
  // 刻意「不碰 isLoadingUser」——ProtectedRoute 的全頁 spinner 條件是
  // isLoadingUser && !user，這裡維持 stale-while-revalidate，避免重現
  // 當初 SIGNED_IN 重複廣播造成整頁被 spinner 取代的問題（見
  // loadedUserIdRef 的註解）。暫時性錯誤一律回 null、不清空 user，
  // 也不在這裡 signOut——真正的 session 過期由 apiClient 的
  // onSessionExpired 處理。
  const refreshUser = useCallback(async (): Promise<ProfileResponse | null> => {
    try {
      // 走 apiClient 的 apiRequest（低層）：自動附 token 並在 401 時 refresh-retry
      // 一次，但不像 apiRequestJson 會 signOut——維持這裡「靜默重抓、暫時性錯誤
      // 一律回 null、不清空 user」的語意。真正的 session 過期由 onSessionExpired 處理。
      const response = await apiRequest(buildApiUrl('/profile'));
      if (!response.ok) return null;
      const profile: ProfileResponse = await response.json();
      setUser(profile);
      loadedUserIdRef.current = profile.id; // 同一使用者時是 no-op，僅保持一致
      return profile;
    } catch {
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useMemo：避免每次 AppContent 重繪（例如換頁時 useLocation 觸發）都產生
  // 新的 context value 物件，逼所有 useContext(UserContext) 消費者（幾乎全 app）
  // 一起重繪。
  const userContextValue = useMemo(
    () => ({ user, setUser, isLoggedIn, isAdmin, isLoadingUser, refreshUser }),
    [user, isLoggedIn, isAdmin, isLoadingUser, refreshUser],
  );

  return (
    <UserContext.Provider value={userContextValue}>
      <FeatureProvider>
        <NotificationProvider>
          <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <MaintenanceBanner />
            {/* 登入後手機有底部導覽，main 補下方留白避免內容被遮住 */}
            <main className={`container mx-auto px-4 py-6 flex-1 ${isLoggedIn ? 'pb-24 md:pb-6' : ''}`}>
              {/* Suspense fallback：lazy 路由 chunk 載入中的過場 */}
              <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/service-providers/:id" element={<ServiceProviderDetail />} />

                {/* Authentication Routes */}
                <Route path="/login" element={<AuthPage />} />
                <Route path="/register" element={<AuthPage />} />
                <Route path="/auth/verify-otp" element={<OTPVerificationPage />} />
                <Route path="/auth/complete-profile" element={<CompleteProfile />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />  {/* ✨ 新增 */}
                <Route path="/auth/reset-password" element={<ResetPasswordPage />} />  {/* ✨ 新增 */}

                {/* Protected Member Routes：登入守衛以 layout route 包一層，
                    避免每條路由重複巢狀 ProtectedRoute>RequireMembershipRoute
                    而漏包造成守衛被靜默略過。功能開關改由獨立 FeatureGate 負責。 */}
                <Route element={<ProtectedRoute />}>
                  {/* 需有效會籍 */}
                  <Route element={<RequireMembershipRoute />}>
                    <Route path="/dashboard" element={<MemberDashboard />} />
                    <Route path="/service-providers" element={<FeatureGate feature="serviceProviderManagement"><ServiceProviderManagement /></FeatureGate>} />
                    <Route path="/service-providers/create" element={<FeatureGate feature="serviceProviderManagement"><CreateServiceProvider /></FeatureGate>} />
                    <Route path="/service-providers/edit/:id" element={<FeatureGate feature="serviceProviderManagement"><EditServiceProvider /></FeatureGate>} />
                    <Route path="/referrals" element={<FeatureGate feature="referralManagement"><ReferralManagement /></FeatureGate>} />
                    <Route path="/tasks" element={<FeatureGate feature="taskCenter"><TaskDashboard /></FeatureGate>} />
                    <Route path="/rewards" element={<FeatureGate feature="rewardSystem"><RewardDashboard /></FeatureGate>} />
                  </Route>
                  {/* 登入即可，不需會籍（付款流程本身） */}
                  <Route path="/payment/checkout" element={<PaymentCheckout />} />
                  <Route path="/payment/result" element={<PaymentResult />} />
                </Route>

                {/* Admin Routes */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                </Route>
                {/* Public Content Pages */}
                <Route path="/terms-of-service" element={
                  <MarkdownContent 
                    content={termsOfServiceContent} 
                    title="服務條款" 
                  />
                } />
                <Route path="/listing-plans" element={
                  <MarkdownContent 
                    content={listingPlansContent} 
                    title="刊登方案" 
                  />
                } />
                <Route path="/referral-reward-rules" element={
                  <MarkdownContent 
                    content={referralRewardRulesContent} 
                    title="推薦獎勵規則" 
                  />
                } />
                <Route path="/referral-reward-contract" element={
                  <MarkdownContent 
                    content={referralRewardContractContent} 
                    title="推薦獎勵合約" 
                  />
                } />
                
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </main>
            <Footer />
            <BottomNav />
          </div>
        </NotificationProvider>
      </FeatureProvider>
    </UserContext.Provider>
  );
}

export default function App() {
  return (
    <Router>
      <DataCacheProvider>
        <AppContent />
      </DataCacheProvider>
    </Router>
  );
}