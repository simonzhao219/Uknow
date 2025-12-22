import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HomePage } from './components/HomePage';
import { ServiceProviderDetail } from './components/ServiceProviderDetail';
import { AuthPage } from './components/AuthPage';
import { EmailVerificationPending } from './components/EmailVerificationPending';
import { AuthCallback } from './components/AuthCallback';
import { CompleteProfile } from './components/CompleteProfile';
import { MemberDashboard } from './components/MemberDashboard';
import { ServiceProviderManagement } from './components/ServiceProviderManagement';
import { CreateServiceProvider } from './components/CreateServiceProvider';
import { EditServiceProvider } from './components/EditServiceProvider';
import { ReferralManagement } from './components/ReferralManagement';
import { SubscriptionManagement } from './components/SubscriptionManagement';
import { TaskDashboard } from './components/TaskDashboard';
import { RewardDashboard } from './components/RewardDashboard';
import { EditMemberProfile } from './components/EditMemberProfile';
import { AdminDashboard } from './components/AdminDashboard';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Toaster } from './components/ui/sonner';
import { NotificationProvider } from './components/notifications/NotificationContext';
import { FeatureProvider } from './contexts/FeatureContext';
import { createClient } from './utils/supabase/client';
import { projectId, publicAnonKey } from './utils/supabase/info';

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
    // 從資料庫加載用戶資料
    const loadUserProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
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
            
            // 檢查是否需要完成註冊
            if (profile.needsOnboarding) {
              console.log('App: User needs onboarding, profile incomplete');
              // 如果不在 complete-profile 頁面，則跳轉
              if (window.location.pathname !== '/auth/complete-profile') {
                navigate('/auth/complete-profile');
              }
            } else {
              // 更新用戶狀態和 localStorage
              setUser(profile);
              localStorage.setItem('user', JSON.stringify(profile));
            }
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
              // 其他錯誤，只清除本地資料
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
      subscription.unsubscribe();
    };
  }, [navigate, supabase]);

  return (
    <UserContext.Provider value={{ user, setUser, isLoggedIn, isAdmin }}>
      <FeatureProvider>
        <NotificationProvider>
          <div className="min-h-screen bg-background">
            <Navbar />
            <main className="container mx-auto px-4 py-6">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/service-providers/:id" element={<ServiceProviderDetail />} />
                
                {/* Authentication Routes */}
                <Route path="/login" element={<AuthPage />} />
                <Route path="/register" element={<AuthPage />} />
                <Route path="/auth/verify-email" element={<EmailVerificationPending />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/auth/complete-profile" element={<CompleteProfile />} />
                
                {/* Protected Member Routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <MemberDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/service-providers" element={
                  <ProtectedRoute featureRequired="serviceProviderManagement">
                    <ServiceProviderManagement />
                  </ProtectedRoute>
                } />
                <Route path="/service-providers/create" element={
                  <ProtectedRoute featureRequired="serviceProviderManagement">
                    <CreateServiceProvider />
                  </ProtectedRoute>
                } />
                <Route path="/service-providers/edit/:id" element={
                  <ProtectedRoute featureRequired="serviceProviderManagement">
                    <EditServiceProvider />
                  </ProtectedRoute>
                } />
                <Route path="/referrals" element={
                  <ProtectedRoute featureRequired="referralManagement">
                    <ReferralManagement />
                  </ProtectedRoute>
                } />
                <Route path="/subscriptions" element={
                  <ProtectedRoute>
                    <SubscriptionManagement />
                  </ProtectedRoute>
                } />
                <Route path="/tasks" element={
                  <ProtectedRoute featureRequired="taskCenter">
                    <TaskDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/rewards" element={
                  <ProtectedRoute featureRequired="rewardSystem">
                    <RewardDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/profile/edit" element={
                  <ProtectedRoute>
                    <EditMemberProfile />
                  </ProtectedRoute>
                } />
                
                {/* Admin Routes */}
                <Route path="/admin" element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                } />
                
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
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