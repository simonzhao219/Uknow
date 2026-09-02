import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { Footer } from './components/Footer';
import { MaintenanceBanner } from './components/MaintenanceBanner';
import { HomePage } from './components/HomePage';
import { ServiceProviderDetail } from './components/ServiceProviderDetail';
import { AuthPage } from './components/AuthPage';
import { OTPVerificationPage } from './components/OTPVerificationPage';
import { CompleteProfile } from './components/CompleteProfile';
// 金流頁刻意保持同步載入：付款途中不承受 lazy chunk 載入失敗的風險。
import { PaymentCheckout } from './components/PaymentCheckout';
import { PaymentResult } from './components/PaymentResult';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { RequireMembershipRoute } from './components/RequireMembershipRoute'; // ✅ 會員資格守衛（以會籍有效為準）
import { NotificationProvider } from './components/notifications/NotificationContext';
import { FeatureProvider } from './contexts/FeatureContext';
import { DataCacheProvider, useDataCache } from './contexts/DataCacheContext'; // ✅ 新增：資料快取
import { createClient } from './utils/supabase/client';
import { buildApiUrl } from './utils/apiClient';
import { onSessionExpired } from './utils/authEvents';
import { importWithRetry } from './utils/lazyWithRetry';
import { isProfileComplete } from './utils/registrationFlow';
import { useRevalidateOnFocus } from './hooks/useRevalidateOnFocus';
import { dedupe } from './utils/requestDedup';

// Code splitting（見 appShell.test.ts 的架構契約）：
// 訪客開首頁不需要下載管理後台、會員區與法務長文。admin/會員區/內容頁
// 都改為路由層 lazy，Suspense fallback 用與各頁一致的置中 spinner。
// importWithRetry：chunk 取不到時重試一次、再失敗就整頁重載一次自癒。
// 沒有它的話，一次資產取不到就是「這個路由整個 session 進不去」——
// 2026-08-07 正式站 admin 事故的形狀（見 lazyWithRetry.ts 的檔頭）。
const lazyNamed = <T extends Record<string, any>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) => lazy(() => importWithRetry(loader).then((m) => ({ default: m[name] })));

const MemberDashboard = lazyNamed(() => import('./components/MemberDashboard'), 'MemberDashboard');
const ServiceProviderManagement = lazyNamed(
  () => import('./components/ServiceProviderManagement'),
  'ServiceProviderManagement',
);
const CreateServiceProvider = lazyNamed(
  () => import('./components/CreateServiceProvider'),
  'CreateServiceProvider',
);
const EditServiceProvider = lazyNamed(
  () => import('./components/EditServiceProvider'),
  'EditServiceProvider',
);
const ReferralManagement = lazyNamed(
  () => import('./components/ReferralManagement'),
  'ReferralManagement',
);
const TaskDashboard = lazyNamed(() => import('./components/TaskDashboard'), 'TaskDashboard');
const RewardDashboard = lazyNamed(() => import('./components/RewardDashboard'), 'RewardDashboard');
const AdminDashboard = lazyNamed(() => import('./components/AdminDashboard'), 'AdminDashboard');
// 會員驗證獨立成頁（相機需全螢幕，且 AdminDashboard 是釘死的 5 欄 Tabs）；
// lazy 讓 @zxing 掃碼庫只在進這頁時才下載，不拖累其他 admin 操作。
const MemberVerifyScanner = lazyNamed(
  () => import('./components/referral/MemberVerifyScanner'),
  'MemberVerifyScanner',
);
const TermsOfServicePage = lazyNamed(
  () => import('./components/ContentPages'),
  'TermsOfServicePage',
);
const ListingPlansPage = lazyNamed(() => import('./components/ContentPages'), 'ListingPlansPage');
const BusinessManualPage = lazyNamed(
  () => import('./components/ContentPages'),
  'BusinessManualPage',
);
const ParticipationContractPage = lazyNamed(
  () => import('./components/ContentPages'),
  'ParticipationContractPage',
);
const ReferralRewardRulesPage = lazyNamed(
  () => import('./components/ContentPages'),
  'ReferralRewardRulesPage',
);

function RouteLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// User context
export const UserContext = React.createContext<{
  user: any;
  setUser: (user: any) => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isLoadingUser: boolean; // ✅ P1: 全局 loading state
  /** 靜默重抓 /profile 並更新 context；回傳最新 profile（失敗回 null）。 */
  refreshUser: () => Promise<any | null>;
}>({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  isAdmin: false,
  isLoadingUser: true, // ✅ 預設為 true
  refreshUser: async () => null,
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
        if (isMounted) {
          setUser(null);
          setIsLoadingUser(false);
        }
      }
    });

    // 監聽 auth 狀態變化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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
        if (isMounted) {
          setUser(null);
          setIsLoadingUser(false);
        }
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
      if (
        !window.location.pathname.includes('/login') &&
        !window.location.pathname.includes('/register')
      ) {
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
  const refreshUser = useCallback(async (): Promise<any | null> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      const response = await fetch(buildApiUrl('/profile'), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) return null;
      const profile = await response.json();
      setUser(profile);
      // 一併落 localStorage：只更新 context 的話，下一次整頁載入會從 localStorage
      // 讀回舊 profile，剛剛重抓到的變動（會籍到期、加入推薦計畫）當場被復活。
      // 這也讓呼叫端不必各自手刻一份 setUser + setItem——那正是本次重構移除的重複。
      localStorage.setItem('user', JSON.stringify(profile));
      loadedUserIdRef.current = profile.id; // 同一使用者時是 no-op，僅保持一致
      return profile;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 分頁切回可見時，靜默重抓 /profile，讓路由守衛（讀 accountStatus）在
  // 會員於 session 中途跨過到期時能同步把人導去續約——與 useSubscription
  // 的 focus-revalidate 對齊，不再出現「卡片顯示失效、守衛仍放行」的矛盾。
  // refreshUser 刻意不碰 isLoadingUser（stale-while-revalidate，不閃全頁
  // spinner）；dedupe 讓 focus/visibilitychange 同時觸發時只打一次。
  useRevalidateOnFocus(
    () => isLoggedIn,
    () => {
      void dedupe('profileRevalidate', async () => {
        await refreshUser();
      });
    },
  );

  // value 必須 memo：這個 context 有 17 個消費者，未 memo 的物件字面量
  // 會讓 AppContent 每次 render（含每次背景 revalidate）都逼全部消費者
  // 重渲染。setUser 與 refreshUser 皆為穩定 identity，deps 只需狀態本身。
  const contextValue = useMemo(
    () => ({ user, setUser, isLoggedIn, isAdmin, isLoadingUser, refreshUser }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isLoadingUser],
  );

  return (
    <UserContext.Provider value={contextValue}>
      <FeatureProvider>
        <NotificationProvider>
          <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <MaintenanceBanner />
            {/* 登入後手機有底部導覽，main 補下方留白避免內容被遮住 */}
            <main
              className={`container mx-auto px-4 py-6 flex-1 ${isLoggedIn ? 'pb-24 md:pb-6' : ''}`}
            >
              {/* resetKey=路由路徑：一頁壞掉不該讓整個 session 的內容區
                  都停在後備畫面（見 ErrorBoundary 的 resetKey 說明）。 */}
              <ErrorBoundary resetKey={location.pathname}>
                <Suspense fallback={<RouteLoader />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/service-providers/:id" element={<ServiceProviderDetail />} />
                    {/* Authentication Routes */}
                    <Route path="/login" element={<AuthPage />} />
                    <Route path="/register" element={<AuthPage />} />
                    <Route path="/auth/verify-otp" element={<OTPVerificationPage />} />
                    <Route path="/auth/complete-profile" element={<CompleteProfile />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />{' '}
                    {/* ✨ 新增 */}
                    <Route path="/auth/reset-password" element={<ResetPasswordPage />} />{' '}
                    {/* ✨ 新增 */}
                    {/* Protected Member Routes */}
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <RequireMembershipRoute>
                            <MemberDashboard />
                          </RequireMembershipRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/service-providers"
                      element={
                        <ProtectedRoute featureRequired="serviceProviderManagement">
                          <RequireMembershipRoute>
                            <ServiceProviderManagement />
                          </RequireMembershipRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/service-providers/create"
                      element={
                        <ProtectedRoute featureRequired="serviceProviderManagement">
                          <RequireMembershipRoute>
                            <CreateServiceProvider />
                          </RequireMembershipRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/service-providers/edit/:id"
                      element={
                        <ProtectedRoute featureRequired="serviceProviderManagement">
                          <RequireMembershipRoute>
                            <EditServiceProvider />
                          </RequireMembershipRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/referrals"
                      element={
                        <ProtectedRoute featureRequired="referralManagement">
                          <RequireMembershipRoute>
                            <ReferralManagement />
                          </RequireMembershipRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/tasks"
                      element={
                        <ProtectedRoute featureRequired="taskCenter">
                          <RequireMembershipRoute>
                            <TaskDashboard />
                          </RequireMembershipRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/rewards"
                      element={
                        <ProtectedRoute featureRequired="rewardSystem">
                          {/* allowExpired：規格 §5 的狀態表承諾失效會員「獎勵收益
                              保留不歸零、僅提領不可」——擋掉整頁的話那個承諾看不到。
                              提領仍由 WithdrawalSection 擋，停權仍由守衛擋。 */}
                          <RequireMembershipRoute allowExpired>
                            <RewardDashboard />
                          </RequireMembershipRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/payment/checkout"
                      element={
                        <ProtectedRoute>
                          <PaymentCheckout />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/payment/result"
                      element={
                        <ProtectedRoute>
                          <PaymentResult />
                        </ProtectedRoute>
                      }
                    />
                    {/* Admin Routes */}
                    <Route
                      path="/admin"
                      element={
                        <AdminRoute>
                          <AdminDashboard />
                        </AdminRoute>
                      }
                    />
                    <Route
                      path="/admin/verify"
                      element={
                        <AdminRoute>
                          <MemberVerifyScanner />
                        </AdminRoute>
                      }
                    />
                    {/* Public Content Pages（lazy：見 ContentPages.tsx 的 chunk 邊界說明） */}
                    <Route path="/terms-of-service" element={<TermsOfServicePage />} />
                    <Route path="/listing-plans" element={<ListingPlansPage />} />
                    <Route path="/business-manual" element={<BusinessManualPage />} />
                    <Route path="/participation-contract" element={<ParticipationContractPage />} />
                    {/* 推廣獎勵規章是對外的獎勵說明頁（頁尾快速連結與提領同意款都指它），
                        與簽名關卡的事業手冊是不同讀者的不同文件——前者給還在瀏覽的訪客，
                        後者是傳銷商契約。2026-08 一度誤把這條 slug 轉去事業手冊，已還原。 */}
                    <Route path="/referral-reward-rules" element={<ReferralRewardRulesPage />} />
                    {/* 舊網址轉址：推廣獎勵契約書已由向公平會報備的「傳銷商參加契約書」
                        取代，站外既有連結（LINE 分享、書籤）不該因此變 404。 */}
                    <Route
                      path="/referral-reward-contract"
                      element={<Navigate to="/participation-contract" replace />}
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
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
