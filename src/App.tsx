import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './components/HomePage';
import { ServiceProviderDetail } from './components/ServiceProviderDetail';
import { AuthPage } from './components/AuthPage';
import { EmailVerificationPending } from './components/EmailVerificationPending';
import { AuthCallback } from './components/AuthCallback';
import { CompleteProfile } from './components/CompleteProfile';
import { PaymentCheckout } from './components/PaymentCheckout';  // ✅ 新增
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
import { MarkdownContent } from './components/MarkdownContent';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { RequirePaymentRoute } from './components/RequirePaymentRoute'; // ✅ 新增
import { Toaster } from './components/ui/sonner';
import { NotificationProvider } from './components/notifications/NotificationContext';
import { FeatureProvider } from './contexts/FeatureContext';
import { createClient } from './utils/supabase/client';
import { projectId, publicAnonKey } from './utils/supabase/info';
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
}>({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  isAdmin: false,
});

function AppContent() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const supabase = createClient();
  
  // Check if user is admin
  const isAdmin = user?.isAdmin === true;
  const isLoggedIn = !!user;

  useEffect(() => {
    let isMounted = true; // ✅ 防止組件卸載後更新狀態
    
    // 從資料庫加載用戶資料
    const loadUserProfile = async () => {
      if (!isMounted) {
        console.log('App: Component unmounted, skipping profile load');
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        // ✅ 增強檢查：確保 session 有效且包含 access_token
        if (session && session.access_token) {
          console.log('App: Found active session, loading profile from database');
          
          // 從後端 API 取得用戶資料
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/profile`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );

          if (response.ok) {
            const profile = await response.json();
            console.log('App: Profile loaded from database:', profile);
            
            if (!isMounted) {
              console.log('App: Component unmounted during profile load, aborting');
              return;
            }
            
            // ✅ 新邏輯：實際檢查數據狀態，而非依賴 registrationStep
            const currentPath = window.location.pathname;
            
            // 步驟 1：檢查是否完成「完善個人資料」（name, phone, birthDate）
            const hasCompleteProfile = !!(profile.name && profile.phone && profile.birthDate);
            
            // 步驟 2：檢查是否已完成付費（有推薦碼 = 已付費）
            // 推薦碼在付款成功後生成，所以有推薦碼就代表已完成付費
            const hasPaidMembership = !!profile.referralCode;
            
            console.log('App: Profile check -', {
              hasCompleteProfile,
              hasPaidMembership,
              hasReferralCode: profile.referralCode,
              hasName: !!profile.name,
              hasPhone: !!profile.phone,
              hasBirthDate: !!profile.birthDate,
              currentPath
            });
            
            // ✅ 簡化邏輯：只設置 user，讓 RequirePaymentRoute 處理付款檢查
            
            if (!hasCompleteProfile) {
              // 情況 1：尚未完成個人資料，不設置 user
              if (currentPath !== '/auth/complete-profile') {
                console.log('App: User needs to complete profile, redirecting to /auth/complete-profile');
                navigate('/auth/complete-profile', { replace: true });
              } else {
                console.log('App: User on complete-profile page, not setting user (incomplete profile)');
              }
            } else {
              // 情況 2 & 3：已完成個人資料，設置 user（無論是否付款）
              // RequirePaymentRoute 會檢查付款狀態並決定是否允許訪問
              console.log('App: User profile complete, setting user');
              setUser(profile);
              localStorage.setItem('user', JSON.stringify(profile));
            }
            // 如果不符合以上任何情況，不設置 user（保持未登入狀態）
          } else {
            console.error('App: Failed to load profile from database, status:', response.status);
            
            // 特殊處理：帳號已被刪除（410）或不存在（404）
            if (response.status === 410 || response.status === 404) {
              console.log('App: User account deleted or not found, cleaning up...');
              
              // 清除 Supabase session
              await supabase.auth.signOut();
              
              // 清除本地資料
              localStorage.removeItem('user');
              localStorage.removeItem('pendingSession');
              setUser(null);
              
              // 重定向到首頁（只有不在首頁或登入頁時才跳轉）
              if (window.location.pathname !== '/' && 
                  window.location.pathname !== '/login' && 
                  window.location.pathname !== '/register') {
                navigate('/');
              }
            } else if (response.status === 401) {
              // 401 = 未授權（session 過期或無效）
              console.log('App: Unauthorized, signing out...');
              await supabase.auth.signOut();
              localStorage.removeItem('user');
              setUser(null);
            } else {
              // 其他錯誤，清除本地資料
              localStorage.removeItem('user');
              setUser(null);
            }
          }
        } else {
          console.log('App: No active session found');
          // 沒有 session，檢查 localStorage（作為後備）
          const savedUser = localStorage.getItem('user');
          if (savedUser) {
            try {
              setUser(JSON.parse(savedUser));
            } catch (error) {
              console.error('Error parsing saved user:', error);
              localStorage.removeItem('user');
            }
          }
        }
      } catch (error) {
        console.error('App: Error loading user profile:', error);
        // 發生錯誤時，嘗試從 localStorage 載入
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch (parseError) {
            console.error('Error parsing saved user:', parseError);
            localStorage.removeItem('user');
          }
        }
      }
    };

    loadUserProfile();

    // 檢查 URL 是否包含 Supabase auth hash（email 驗證回調）
    const checkAuthCallback = () => {
      const hash = window.location.hash;
      console.log('App: Checking for auth callback, hash:', hash);
      
      if (hash && (hash.includes('access_token') || hash.includes('error'))) {
        console.log('App: Detected auth callback in URL, redirecting to /auth/callback');
        // 如果 URL 包含 auth token 或 error，重定向到 callback 頁面
        navigate('/auth/callback', { replace: true });
      }
    };

    checkAuthCallback();

    // 監聽 auth 狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('App: Auth state changed:', event);
      
      if (event === 'SIGNED_IN' && session) {
        console.log('App: User signed in, reloading profile');
        loadUserProfile();
      } else if (event === 'SIGNED_OUT') {
        console.log('App: User signed out, clearing profile');
        setUser(null);
        localStorage.removeItem('user');
      }
      
      if (event === 'SIGNED_IN' && session && window.location.pathname === '/') {
        console.log('App: User signed in at homepage, checking for callback');
        checkAuthCallback();
      }
    });

    return () => {
      isMounted = false; // ✅ 標記組件已卸載
      subscription.unsubscribe();
    };
  }, []); // ✅ 移除 navigate 和 supabase 依賴，只在首次掛載時執行

  return (
    <UserContext.Provider value={{ user, setUser, isLoggedIn, isAdmin }}>
      <FeatureProvider>
        <NotificationProvider>
          <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <main className="container mx-auto px-4 py-6 flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/service-providers/:id" element={<ServiceProviderDetail />} />
                
                {/* Authentication Routes */}
                <Route path="/login" element={<AuthPage />} />
                <Route path="/register" element={<AuthPage />} />
                <Route path="/auth/verify-email" element={<EmailVerificationPending />} />
                <Route path="/auth/verify-reset-email" element={<EmailVerificationPending mode="password-reset" />} />  {/* ✨ 新增 */}
                <Route path="/auth/callback" element={<AuthCallback />} />
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
                
                {/* Admin Routes */}
                <Route path="/admin" element={
                  <AdminRoute>
                    <AdminDashboard />
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
      <AppContent />
    </Router>
  );
}