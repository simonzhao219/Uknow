import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { MaintenanceBanner } from './components/MaintenanceBanner';
import { HomePage } from './components/HomePage';
import { ServiceProviderDetail } from './components/ServiceProviderDetail';
import { AuthPage } from './components/AuthPage';
import { OTPVerificationPage } from './components/OTPVerificationPage';
import { CompleteProfile } from './components/CompleteProfile';
import { PaymentCheckout } from './components/PaymentCheckout';  // ✅ 新增
import { PaymentResult } from './components/PaymentResult';  // ✅ 新增：付款結果頁面
import { ForgotPasswordPage } from './components/ForgotPasswordPage';  // ✨ 新增
import { ResetPasswordPage } from './components/ResetPasswordPage';    // ✨ 新增
import { MemberDashboard } from './components/MemberDashboard';
import { ServiceProviderManagement } from './components/ServiceProviderManagement';
import { CreateServiceProvider } from './components/CreateServiceProvider';
import { EditServiceProvider } from './components/EditServiceProvider';
import { ReferralManagement } from './components/ReferralManagement';
import { TaskDashboard } from './components/TaskDashboard';
import { RewardDashboard } from './components/RewardDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { UserDiagnosisPage } from './components/admin/UserDiagnosisPage'; // ✅ 新增：使用者診斷工具
import { MarkdownContent } from './components/MarkdownContent';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { RequirePaymentRoute } from './components/RequirePaymentRoute'; // ✅ 新增
import { Toaster } from './components/ui/sonner';
import { NotificationProvider } from './components/notifications/NotificationContext';
import { FeatureProvider } from './contexts/FeatureContext';
import { DataCacheProvider, useDataCache } from './contexts/DataCacheContext'; // ✅ 新增：資料快取
import { InAppBrowserWarning } from './components/InAppBrowserWarning'; // ✅ 新增：內建瀏覽器警告
import { detectInAppBrowser, getCurrentURL } from './utils/browserDetection'; // ✅ 新增：瀏覽器檢測
import { createClient } from './utils/supabase/client';
import { buildApiUrl } from './utils/apiClient';
import { onSessionExpired } from './utils/authEvents';
import { termsOfServiceContent } from './content/termsOfService';
import { listingPlansContent } from './content/listingPlans';
import { referralRewardRulesContent } from './content/referralRewardRules';
import { referralRewardContractContent } from './content/referralRewardContract';

// User context
export const UserContext = React.createContext<{
  user: any;
  setUser: (user: any) => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isLoadingUser: boolean; // ✅ P1: 全局 loading state
}>({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  isAdmin: false,
  isLoadingUser: true, // ✅ 預設為 true
});

function AppContent() {
  const [user, setUser] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true); // ✅ P1: 全局 loading state
  const navigate = useNavigate();
  const location = useLocation();
  const supabase = createClient();
  const { clearCache } = useDataCache(); // ✅ 新增：使用資料快取
  // 記錄目前已載入 profile 的使用者 id，用來分辨「真的登入」與分頁重新可見時
  // Supabase 重複廣播的 SIGNED_IN（同一個使用者、token 沒換發也會發一次）。
  const loadedUserIdRef = useRef<string | null>(null);
  
  // ✅ 瀏覽器檢測（只檢測一次）
  const [browserInfo] = useState(() => detectInAppBrowser());
  
  // Check if user is admin
  const isAdmin = user?.isAdmin === true;
  const isLoggedIn = !!user;
  
  // ✅ 若是內建瀏覽器，顯示警告頁並阻止所有操作
  if (browserInfo.isInAppBrowser) {
    console.log('App: 檢測到內建瀏覽器:', browserInfo.platform, browserInfo.userAgent);
    return (
      <div className="min-h-screen bg-background">
        <InAppBrowserWarning
          platform={browserInfo.platform}
          currentURL={getCurrentURL()}
        />
      </div>
    );
  }

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

        const hasCompleteProfile = !!(profile.name && profile.phone && profile.birthDate);
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

  return (
    <UserContext.Provider value={{ user, setUser, isLoggedIn, isAdmin, isLoadingUser }}>
      <FeatureProvider>
        <NotificationProvider>
          <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <MaintenanceBanner />
            <main className="container mx-auto px-4 py-6 flex-1">
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
                
                {/* Protected Member Routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <RequirePaymentRoute>
                      <MemberDashboard />
                    </RequirePaymentRoute>
                  </ProtectedRoute>
                } />
                <Route path="/service-providers" element={
                  <ProtectedRoute featureRequired="serviceProviderManagement">
                    <RequirePaymentRoute>
                      <ServiceProviderManagement />
                    </RequirePaymentRoute>
                  </ProtectedRoute>
                } />
                <Route path="/service-providers/create" element={
                  <ProtectedRoute featureRequired="serviceProviderManagement">
                    <RequirePaymentRoute>
                      <CreateServiceProvider />
                    </RequirePaymentRoute>
                  </ProtectedRoute>
                } />
                <Route path="/service-providers/edit/:id" element={
                  <ProtectedRoute featureRequired="serviceProviderManagement">
                    <RequirePaymentRoute>
                      <EditServiceProvider />
                    </RequirePaymentRoute>
                  </ProtectedRoute>
                } />
                <Route path="/referrals" element={
                  <ProtectedRoute featureRequired="referralManagement">
                    <RequirePaymentRoute>
                      <ReferralManagement />
                    </RequirePaymentRoute>
                  </ProtectedRoute>
                } />
                <Route path="/tasks" element={
                  <ProtectedRoute featureRequired="taskCenter">
                    <RequirePaymentRoute>
                      <TaskDashboard />
                    </RequirePaymentRoute>
                  </ProtectedRoute>
                } />
                <Route path="/rewards" element={
                  <ProtectedRoute featureRequired="rewardSystem">
                    <RequirePaymentRoute>
                      <RewardDashboard />
                    </RequirePaymentRoute>
                  </ProtectedRoute>
                } />
                <Route path="/payment/checkout" element={
                  <ProtectedRoute>
                    <PaymentCheckout />
                  </ProtectedRoute>
                } />
                <Route path="/payment/result" element={
                  <ProtectedRoute>
                    <PaymentResult />
                  </ProtectedRoute>
                } />
                
                {/* Admin Routes */}
                <Route path="/admin" element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                } />
                <Route path="/admin/user-diagnosis" element={
                  <AdminRoute>
                    <UserDiagnosisPage />
                  </AdminRoute>
                } />
                
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
            </main>
            <Footer />
          </div>
          <Toaster />
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