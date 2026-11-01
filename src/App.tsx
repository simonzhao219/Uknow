import React, { useEffect, useMemo, lazy, Suspense } from 'react';
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
import { onSessionExpired } from './utils/authEvents';
import { importWithRetry } from './utils/lazyWithRetry';
import { clearPendingInviteToken } from './utils/referralInvite';
import { useRevalidateOnFocus } from './hooks/useRevalidateOnFocus';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { clearInflight, fetchProfile } from './utils/fetchProfile';
import { clearAccountLocalState } from './utils/clearAccountLocalState';
import { resetHomeListingsCache } from './utils/homeListingsCache';
import {
  type AuthState,
  type AuthView,
  resolveAuthView,
  showsMemberChrome,
} from './utils/authView';
import type { FunnelNextKind } from './utils/registrationFlow';
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
// 「我的 QR」獨立成頁（掃描分頁要開相機，需全螢幕與裝置權限——規格 §13 的判準）；
// lazy 讓 jsQR 掃碼庫與相機邏輯只在進這頁時才下載，不進首屏 bundle。
const MyQrPage = lazyNamed(() => import('./components/MyQrPage'), 'MyQrPage');
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
  // ---- 登入狀態（T1 auth-state-trust）。舊 mock 沒有這些欄位時，
  // resolveAuthView 依 isLoggedIn 回落（見 utils/authView.ts）。----
  authState?: AuthState;
  /** 註冊中（從未訂閱、資料未齊或首購未完成）——頁首只給登出。 */
  isFunnel?: boolean;
  /** 頁首版本（resolveAuthView 的結果）。 */
  authView?: AuthView;
  /** 註冊中的人下一步去哪（E4「繼續完成註冊」）；非註冊中為 null。 */
  nextFunnelRoute?: string | null;
  /** 本機提示的頭像首字（member-pending 首繪用）。 */
  hintInitial?: string;
  /** 本機提示的漏斗目的地種類（funnel 首繪的暫用連結與文案）。 */
  hintNext?: FunnelNextKind | null;
  /** OTP／邀請入口拿到 /profile 後回灌（穩定 identity）。 */
  ingestProfile?: (profile: any) => void;
  // ---- 暫時性故障不登出（T1-B）----
  /** degraded 外框的「重試」（穩定 identity；在飛時不重複發）。 */
  retryAuth?: () => Promise<void>;
  /** degraded 中的重試在飛。 */
  isRetrying?: boolean;
  /** degraded 後的重試又失敗。 */
  failedAgain?: boolean;
  /** /profile 404：帳號資料異常（W4-11），/login 顯示說明。 */
  authAnomaly?: boolean;
}>({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  isAdmin: false,
  isLoadingUser: true, // ✅ 預設為 true
  refreshUser: async () => null,
});

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCache } = useDataCache(); // ✅ 新增：使用資料快取
  const clearAccountState = () => {
    clearCache();
    clearAccountLocalState();
  };

  // 啟動判定、事件、背景重驗與首繪提示全在 useAuthBootstrap（plan §2.5）；
  // 這裡只注入會碰到路由與快取的副作用。注入值只在掛載時讀一次。
  const {
    user,
    setUser,
    authState,
    isFunnel,
    nextFunnelRoute,
    hint,
    hintVerified,
    isLoadingUser,
    sessionStalled,
    refreshUser,
    ingestProfile,
    retryAuth,
    isRetrying,
    failedAgain,
    authAnomaly,
  } = useAuthBootstrap({
    supabase: createClient(),
    fetchProfile,
    clearInflight,
    // 「登出清所有本機狀態」盤點（R3 §6，2026-11）。已清：DataCache（含 sessionStorage）、
    // 首頁清單快取、localStorage 的 withdrawalBankData／pendingUser／user／pendingSession、
    // 完善資料草稿（sessionStorage）、首繪提示（hook 自己清）、邀請 token（僅 SIGNED_OUT）。
    // 刻意保留：待用推薦碼與邀請 token（訪客帶進來的）、首頁檢視／推薦網路排序／QR 分頁／
    // 公告已讀（與帳號無關的偏好）、OTP 續填情境與到期時間（只有 email，且屬登入前流程）。
    // adminCache 只在記憶體、隨 AdminConsole 卸載。新增帳號相關的 storage 鍵時加進
    // clearAccountLocalState，不要另寫一處。
    onSignedOut: () => {
      clearAccountState();
      clearPendingInviteToken();
      // 首頁清單快取存活到分頁重整；換帳號不沿用前一人的搜尋／篩選與捲動位置。
      resetHomeListingsCache();
    },
    onAccountSwitched: () => {
      clearAccountState();
      resetHomeListingsCache();
    },
    onIncompleteProfile: () => navigate('/auth/complete-profile', { replace: true }),
  });

  // Check if user is admin
  const isAdmin = user?.isAdmin === true;
  const isLoggedIn = !!user;
  const authView = resolveAuthView({
    authState,
    isFunnel,
    isAdmin,
    isLoggedIn,
    hint,
    pathname: location.pathname,
    sessionStalled,
  });
  // 首字要等 session 的 uid 對上才給（S11）：之前頭像圓先空白，不閃前一人的首字。
  const hintInitial = hintVerified ? (hint?.initial ?? '') : '';
  const hintNext = hint?.next ?? null;

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

  // value 必須 memo：這個 context 有二十多個消費者，未 memo 的物件字面量
  // 會讓 AppContent 每次 render（含每次背景 revalidate）都逼全部消費者
  // 重渲染。函式欄位（setUser、refreshUser、ingestProfile）皆為穩定
  // identity，deps 只列狀態——漏列會靜默不重繪（appShell.test 釘住）。
  const contextValue = useMemo(
    () => ({
      user,
      setUser,
      isLoggedIn,
      isAdmin,
      isLoadingUser,
      refreshUser,
      authState,
      isFunnel,
      authView,
      nextFunnelRoute,
      hintInitial,
      hintNext,
      ingestProfile,
      retryAuth,
      isRetrying,
      failedAgain,
      authAnomaly,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user,
      isLoadingUser,
      authState,
      isFunnel,
      authView,
      nextFunnelRoute,
      hintInitial,
      hintNext,
      isRetrying,
      failedAgain,
      authAnomaly,
    ],
  );

  return (
    <UserContext.Provider value={contextValue}>
      <FeatureProvider>
        <NotificationProvider>
          <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <MaintenanceBanner />
            {/* 會員（含首繪頭像占位）手機有底部導覽，main 補下方留白避免內容被遮住 */}
            {/* tabIndex=-1：degraded 外框的重試成功後，焦點交給 main（AuthDegradedFrame）。 */}
            <main
              tabIndex={-1}
              className={`container mx-auto px-4 py-6 flex-1 outline-none scroll-mt-20 ${showsMemberChrome(authView) ? 'pb-24 md:pb-6' : ''}`}
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
                      path="/dashboard/qr"
                      element={
                        <ProtectedRoute>
                          <RequireMembershipRoute>
                            <MyQrPage />
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
                              提領仍由 WithdrawalAction 擋，停權仍由守衛擋。 */}
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
                    {/* 舊網址：管理員很可能把它加在手機主畫面。轉址本身不守門
                        （守門在目的地的 RequireMembershipRoute），但要帶 state.from，
                        掃完按返回才回得了管理後台。 */}
                    <Route
                      path="/admin/verify"
                      element={
                        <Navigate to="/dashboard/qr?tab=scan" replace state={{ from: '/admin' }} />
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
