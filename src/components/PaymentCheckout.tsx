import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Loader2, CheckCircle, CreditCard, Edit } from 'lucide-react';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { buildApiUrl, extractApiErrorMessage } from '../utils/apiClient';
import { formatTwDate } from '../utils/twDate';
import { resolveCheckoutPageRedirect, isProfileComplete } from '../utils/registrationFlow';
import { useSubscription } from '../hooks/useSubscription';

export function PaymentCheckout() {
  console.log('PaymentCheckout: Component rendering');

  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [referrerInfo, setReferrerInfo] = useState<{ name: string; code: string } | null>(null);
  const [isLoadingReferrer, setIsLoadingReferrer] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null); // ✅ 新增：活動訂單狀態
  const [isButtonLocked, setIsButtonLocked] = useState(false); // ✅ 新增：按鈕鎖定狀態
  const [lockCountdown, setLockCountdown] = useState(0); // ✅ 新增：倒計時秒數
  // ✅ 過期會員續費雙模式（見 migration 0008）：extend=續約接續原效期；
  //    fresh=新約從付款日起算、可換新推薦人。null 表示尚未選擇。
  const [renewalMode, setRenewalMode] = useState<'extend' | 'fresh' | null>(null);
  const [newReferralCode, setNewReferralCode] = useState('');
  const [newCodeStatus, setNewCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>(
    'idle',
  );
  const [newReferrerName, setNewReferrerName] = useState<string | null>(null);

  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const { showToast, showSuccess } = useNotification();
  const supabase = createClient();
  // renewal 契約（AC-2/A14/A16/AC-17）的單一來源。本頁是獨立路由，
  // 不與 MemberDashboard/RewardDashboard 同屏，單例限制不成立。
  const { subscriptionData, refresh: refreshSubscription } = useSubscription();
  const renewal = subscriptionData?.renewal ?? null;
  const hasPendingWithdrawal = subscriptionData?.hasPendingWithdrawal ?? false;

  console.log('PaymentCheckout: Component state -', {
    isLoading,
    isCheckingUser,
    hasPendingUser: !!pendingUser,
    hasActiveOrder: !!activeOrder, // ✅ 新增
  });

  // ✅ 新增：定期檢查用戶狀態（每 5 秒）
  useEffect(() => {
    if (!pendingUser) return;

    const checkUserStatus = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(buildApiUrl('/auth/profile'), {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const profile = await response.json();

          // 導向決策收斂到單一純函式（見 registrationFlow.ts）。輪詢時只在乎
          // 兩件事：會籍轉為 active（→ dashboard）、付款開通中（→ 結果頁）；
          // 其餘（含過期續約、step 0）留在原地由主流程處理，不在輪詢中彈跳。
          const redirect = resolveCheckoutPageRedirect(profile);
          if (redirect === '/dashboard') {
            console.log('PaymentCheckout: 會籍已生效，跳轉到 dashboard');
            showToast('註冊完成！正在跳轉...', 'success');
            setTimeout(() => {
              navigate('/dashboard', { replace: true });
            }, 1500);
          } else if (redirect?.startsWith('/payment/result')) {
            console.log('PaymentCheckout: 用戶已付款，跳轉到結果頁');
            navigate(redirect, { replace: true });
          }
        }
      } catch (error) {
        console.error('檢查用戶狀態失敗:', error);
      }
    };

    // ✅ 每 5 秒檢查一次
    const intervalId = setInterval(checkUserStatus, 5000);

    // 組件卸載時清除
    return () => clearInterval(intervalId);
  }, [pendingUser, navigate, showToast, supabase]);

  // 檢查是否有待付款的用戶資料
  useEffect(() => {
    const checkPendingUser = async () => {
      setIsCheckingUser(true);

      // 1. 先檢查 localStorage
      const pendingUserData = localStorage.getItem('pendingUser');

      // 2. 如果 localStorage 沒有，從數據庫讀取
      if (!pendingUserData) {
        console.log('PaymentCheckout: No pendingUser in localStorage, fetching from API');

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          console.log('PaymentCheckout: No session, redirecting to login');
          navigate('/login', { replace: true });
          return;
        }

        try {
          const response = await fetch(buildApiUrl('/auth/profile'), {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          if (response.ok) {
            const profile = await response.json();
            console.log('PaymentCheckout: Profile loaded from API:', profile);

            // 導向決策收斂到單一純函式（見 registrationFlow.ts）：
            // active → dashboard；付款開通中 → 結果頁；step 0 → 完善資料頁；
            // 其餘（step 1 首購 / step 2 付款失敗重試 / 過期續約）留在結帳頁。
            // 特意不擋 expired，避免守衛↔結帳的無限循環。
            const redirect = resolveCheckoutPageRedirect(profile);
            if (redirect) {
              console.log('PaymentCheckout: Redirecting to', redirect);
              // 資料未填齊而被導回完善資料頁時，先說一句原因再帶過去——避免
              // 使用者看到畫面「無故」跳走，不知道自己被要求先補資料。
              if (redirect === '/auth/complete-profile') {
                showToast('請先完成個人資料', 'info');
              }
              navigate(redirect, { replace: true });
              return;
            }

            console.log('PaymentCheckout: User can pay (first payment or renewal), using API data');
            setPendingUser(profile);
            setIsCheckingUser(false);
            return;
          } else {
            console.error('PaymentCheckout: Failed to load profile, status:', response.status);
            navigate('/login', { replace: true });
            return;
          }
        } catch (error) {
          console.error('PaymentCheckout: Error loading profile:', error);
          navigate('/login', { replace: true });
          return;
        }
      }

      // 4. 如果 localStorage 有 pendingUser，正常使用
      try {
        const userData = JSON.parse(pendingUserData);

        // render 層第二道防線（與 API 分支的 resolveCheckoutPageRedirect、
        // App.tsx 啟動守衛同源，都用 isProfileComplete 這唯一定義）：即使繞過
        // 路由守衛、直接帶著 localStorage 的快取資料進到本頁，只要基本資料
        // 沒填齊就一律導回完善資料頁，不讓「空白的註冊資訊確認」被 render 出來。
        // localStorage 分支原本完全不做完整度檢查，是空白結帳頁事故僅存的破口。
        if (!isProfileComplete(userData)) {
          showToast('請先完成個人資料', 'info');
          localStorage.removeItem('pendingUser');
          navigate('/auth/complete-profile', { replace: true });
          return;
        }

        setPendingUser(userData);

        // 驗證 session 是否有效
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          showToast('登入狀態已過期，請重新登入', 'error');
          localStorage.removeItem('pendingUser');
          setTimeout(() => {
            navigate('/login', { replace: true });
          }, 500);
          return;
        }
      } catch (error) {
        console.error('PaymentCheckout: Error parsing pendingUser:', error);
        localStorage.removeItem('pendingUser');
        navigate('/auth/complete-profile', { replace: true });
      } finally {
        setIsCheckingUser(false);
      }
    };

    checkPendingUser();
  }, []); // ✅ 移除依賴，只在首次加載時執行

  // ✅ 獲取推薦人資訊
  useEffect(() => {
    const fetchReferrerInfo = async () => {
      // 自動綁定（預設推薦人）不查也不顯示——只擋渲染擋不住網路層：
      // 回應本體含推薦人真名，Network 面板完整可見。早退與 :591 的
      // 渲染條件必須用同一個旗標。
      if (!pendingUser?.referredByCode || pendingUser.isAutoReferral) {
        return;
      }

      // ✅ 優先使用 pendingUser 中已存儲的推薦人姓名
      if (pendingUser.referrerName) {
        console.log('PaymentCheckout: Using cached referrer name:', pendingUser.referrerName);
        setReferrerInfo({
          name: pendingUser.referrerName,
          code: pendingUser.referredByCode,
        });
        return;
      }

      // ✅ 如果沒有緩存，才發送請求
      setIsLoadingReferrer(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          console.log('PaymentCheckout: No session, skip fetching referrer info');
          return;
        }

        console.log(
          `PaymentCheckout: Fetching referrer info for code: ${pendingUser.referredByCode}`,
        );

        const response = await fetch(
          buildApiUrl(`/referrals/validate/${pendingUser.referredByCode}`),
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );

        if (response.ok) {
          const result = await response.json();

          if (result.valid && result.referrer) {
            console.log('PaymentCheckout: Referrer info loaded:', result.referrer);
            setReferrerInfo({
              name: result.referrer.userName,
              code: pendingUser.referredByCode,
            });
          } else {
            console.log('PaymentCheckout: Referral code invalid or expired');
          }
        } else {
          console.error('PaymentCheckout: Failed to fetch referrer info, status:', response.status);
        }
      } catch (error) {
        console.error('PaymentCheckout: Error fetching referrer info:', error);
      } finally {
        setIsLoadingReferrer(false);
      }
    };

    fetchReferrerInfo();
  }, [pendingUser]);

  // ✅ 新增：管理按鈕鎖定倒計時
  useEffect(() => {
    if (lockCountdown > 0) {
      const timer = setTimeout(() => {
        setLockCountdown(lockCountdown - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (lockCountdown === 0 && isButtonLocked) {
      setIsButtonLocked(false);
    }
  }, [lockCountdown, isButtonLocked]);

  // ✅ 續費身分判斷：曾有訂閱（subscriptionEndDate 存在）且此刻不是有效
  //    會員（有效會員在進入本頁時已被彈去 dashboard）→ 這是過期續費。
  const isRenewal = !!pendingUser?.subscriptionEndDate;
  // 補繳制（A1）：續約永遠可選，不因過期多久而消失——canExtend 已拆除。
  // 日期與補繳數字一律吃契約 renewal 值（AC-2）：pendingUser 走 localStorage
  // 快取，補繳中途不會更新，用它自算會把付款前的舊效期顯示出來。
  // renewal 尚未載入（AC-17）時不預選，兩個選項一併停用。
  useEffect(() => {
    if (isRenewal && renewalMode === null && renewal) {
      setRenewalMode('extend');
    }
  }, [isRenewal, renewalMode, renewal]);

  // 已過期時長顯示：25 → 「2 年 1 個月」、3 → 「3 個月」。
  const formatExpiredMonths = (months: number) => {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    if (years === 0) return `${rest} 個月`;
    return rest === 0 ? `${years} 年` : `${years} 年 ${rest} 個月`;
  };

  // ✅ 新約換推薦人：即時驗證新推薦碼並顯示推薦人姓名。
  const handleValidateNewCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setNewCodeStatus('idle');
      setNewReferrerName(null);
      return;
    }
    setNewCodeStatus('checking');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(buildApiUrl(`/referrals/validate/${trimmed}`), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (response.ok && result.valid && result.referrer) {
        setNewCodeStatus('valid');
        setNewReferrerName(result.referrer.userName);
      } else {
        setNewCodeStatus('invalid');
        setNewReferrerName(null);
      }
    } catch {
      setNewCodeStatus('invalid');
      setNewReferrerName(null);
    }
  };

  // ✅ 新增：PayUni 續期收款付款
  const handlePayUniPayment = async () => {
    if (!pendingUser) {
      showToast('用戶資料不存在，請重新註冊', 'error');
      navigate('/auth/complete-profile');
      return;
    }

    // ✅ 動作層防線：基本資料未填齊時不得送單付款。與按鈕的 disabled 條件同源，
    //    防止「空白的註冊資訊確認」頁仍能按下付款、產生一筆無姓名/身分證的髒單
    //    （空白結帳頁事故裡使用者正是對著空欄位按了兩次付款）。
    if (!isProfileComplete(pendingUser)) {
      showToast('請先完成個人資料再付款', 'warning');
      navigate('/auth/complete-profile');
      return;
    }

    // ✅ 檢查按鈕是否被鎖定
    if (isButtonLocked) {
      showToast(`請稍候 ${lockCountdown} 秒後再試`, 'warning');
      return;
    }

    // AC-17：續費者在 renewal 契約載入前不得送單——renewalMode 還是 null
    // 時後端會把這筆當首購語意（null=fresh 起算）處理，且 fresh 的清空
    // 揭露（A14）也還沒給使用者看過。
    if (isRenewal && (!renewal || !renewalMode)) {
      showToast('續約資訊尚未載入，請稍後再試', 'warning');
      return;
    }

    // ✅ 續費模式檢查：新約填了推薦碼就必須先驗證通過，避免帶著無效碼
    //    送出（後端也會擋，這裡先給友善提示）。
    if (
      isRenewal &&
      renewalMode === 'fresh' &&
      newReferralCode.trim() &&
      newCodeStatus !== 'valid'
    ) {
      showToast('推薦碼尚未驗證通過，請確認後再送出', 'warning');
      return;
    }

    try {
      setIsLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        showToast('登入已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

      // ✅ 呼叫後端 API 準備訂單。registrationStep 會在這筆 pending 訂單
      // 建立後自動變成 2（由 payment_orders 即時算出，不需要另外寫入）。
      // 過期續費時帶上使用者選的模式；首次付款不帶 body（後端視同 fresh）。
      const response = await fetch(buildApiUrl('/payuni/prepare'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        ...(isRenewal && renewalMode
          ? {
              body: JSON.stringify({
                renewalMode,
                ...(renewalMode === 'fresh' && newReferralCode.trim() && newCodeStatus === 'valid'
                  ? { referredByCode: newReferralCode.trim() }
                  : {}),
              }),
            }
          : {}),
      });

      const result = await response.json();

      if (result.success) {
        // ✅ 啟動15秒倒計時
        setIsButtonLocked(true);
        setLockCountdown(15);

        // 動態創建表單並提交到 PayUni
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = result.data.apiUrl;

        const fields = {
          MerID: result.data.MerID,
          Version: result.data.Version,
          EncryptInfo: result.data.EncryptInfo,
          HashInfo: result.data.HashInfo,
        };

        Object.entries(fields).forEach(([name, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.appendChild(input);
        });

        document.body.appendChild(form);
        console.log('PaymentCheckout: Submitting form to PayUni:', result.data.mode);
        form.submit(); // 提交後會跳轉到 PayUni
      } else {
        showToast(extractApiErrorMessage(result, '準備訂單失敗'), 'error');
      }
    } catch (error: any) {
      console.error('PaymentCheckout: PayUni payment error:', error);
      showToast(error.message || '付款失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 「稍後付款」按身分分流：
  // - 續費會員（isRenewal）是完整會員只是想先離開，絕不登出——導回首頁
  //   保留 session，之後點任何會員功能守衛會再把他帶回結帳頁。
  // - 首次註冊者維持登出：resolvePostLoginAction 會在 step 1/2 使用者
  //   下次登入時靜默導回結帳，漏斗接得回去；按鈕文字已明示「登出」。
  const handleCancel = async () => {
    if (isRenewal) {
      showToast('已保留您的登入，隨時可回來完成續費', 'info');
      navigate('/', { replace: true });
      return;
    }

    try {
      // 1. 登出 Supabase
      await supabase.auth.signOut();

      // 2. 清除本機儲存
      localStorage.removeItem('user');
      localStorage.removeItem('pendingUser');

      // 3. 清除 UserContext
      setUser(null);

      showToast('您已登出，可以稍後再完成付款', 'info');

      // 4. 導向登入頁面
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('PaymentCheckout: Error during cancel/logout:', error);
      showToast('登出時發生錯誤', 'error');
    }
  };

  const handleEdit = async () => {
    try {
      console.log('PaymentCheckout: User clicked edit, resetting registration...');

      // 1. 保存當前資料到 pendingUser（供編輯頁面使用）
      localStorage.setItem('pendingUser', JSON.stringify(pendingUser));
      console.log('PaymentCheckout: Saved current data to pendingUser');

      // 2. 調用後端 API 重置 registrationStep 為 0
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        showToast('登入狀態已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

      const response = await fetch(buildApiUrl('/auth/reset-registration'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('PaymentCheckout: Reset registration error:', errorData);
        throw new Error(extractApiErrorMessage(errorData, '重置註冊狀態失敗'));
      }

      console.log('PaymentCheckout: Registration step reset to 0');

      // 3. 導向填寫資料頁面，並以 location.state 明確帶上「編輯」意圖——
      //    CompleteProfile 的守衛看到 editing=true 就不會把資料已填齊的
      //    使用者立刻彈回結帳頁（本次修的 bug 根因）。
      showToast('您可以重新編輯註冊資料', 'info');
      navigate('/auth/complete-profile', { state: { editing: true } });
    } catch (error: any) {
      console.error('PaymentCheckout: Error during edit:', error);
      showToast(error.message || '編輯失敗，請稍後再試', 'error');
    }
  };

  if (isCheckingUser) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card>
          <CardHeader className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <CardTitle>載入中...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!pendingUser) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card>
          <CardHeader className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <CardTitle>載入中...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">{isRenewal ? '續費會員' : '完成付款'}</CardTitle>
          {isRenewal && (
            <CardDescription>
              您的會籍已於{' '}
              {pendingUser.subscriptionEndDate && formatTwDate(pendingUser.subscriptionEndDate)}{' '}
              到期，請選擇續費方式
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 用戶資訊確認 */}
          <div className="space-y-2 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">註冊資訊確認</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                className="h-8 px-2"
                data-testid="edit-profile-button"
              >
                <Edit className="h-4 w-4 mr-1" />
                編輯
              </Button>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>姓名：{pendingUser.name}</p>
              <p>生日：{pendingUser.birthDate}</p>
              <p>身分字號：{pendingUser.nationalId}</p>
              <p>手機：{pendingUser.phone}</p>
              <p>Email：{pendingUser.email}</p>
              {pendingUser.referredByCode && !pendingUser.isAutoReferral && (
                <>
                  <p>推薦碼：{pendingUser.referredByCode}</p>
                  {referrerInfo && (
                    <p>
                      推薦人：{referrerInfo.name}
                      {isLoadingReferrer && (
                        <Loader2 className="inline h-3 w-3 animate-spin ml-1" />
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 續費模式選擇：續約（接續原效期，可補繳）/ 新約（重新起算，換推薦人、清空帳本） */}
          {isRenewal && (
            <div className="space-y-3" data-testid="renewal-mode-section">
              <h3 className="text-sm font-medium">續費方式</h3>

              {/* AC-17：renewal 契約取不到 → 兩個選項一併停用 + 重試 */}
              {!renewal && (
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <p className="text-sm text-muted-foreground">
                    暫時無法載入續約資訊，請稍後重試。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshSubscription()}
                    data-testid="renewal-info-retry"
                  >
                    重新載入
                  </Button>
                </div>
              )}

              <button
                type="button"
                disabled={!renewal}
                aria-pressed={renewalMode === 'extend'}
                onClick={() => renewal && setRenewalMode('extend')}
                className={`w-full text-left p-4 rounded-lg border transition-colors disabled:opacity-50 ${
                  renewalMode === 'extend'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
                data-testid="renewal-mode-extend"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">續約（接續原效期）</span>
                  {renewalMode === 'extend' && <CheckCircle className="h-5 w-5 text-primary" />}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  保留原帳號脈絡，效期自 {renewal ? formatTwDate(renewal.extendAnchorDate) : '—'}{' '}
                  接續， 至 {renewal ? formatTwDate(renewal.extendEndDate) : '—'}
                </p>
              </button>

              {/* AC-2/A7：接續原效期的補繳揭露——總筆數、總額、補完到期日 */}
              {renewalMode === 'extend' && renewal && renewal.backfillCount > 0 && (
                <div
                  className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1"
                  data-testid="backfill-disclosure"
                >
                  <p className="text-sm text-amber-800">
                    您的會籍已過期 {formatExpiredMonths(renewal.expiredForMonths)}。
                  </p>
                  <p className="text-sm text-amber-800">
                    接續原效期需補繳 <span className="font-bold">{renewal.backfillCount} 筆</span>，
                    共 NT$ {renewal.backfillAmount.toLocaleString('en-US')}；補繳完成後效期至{' '}
                    {formatTwDate(renewal.backfillFinalEndDate)}。
                  </p>
                  <p className="text-xs text-amber-700">
                    每筆 NT$ 1,200 需分次付款，每一筆都會立即入帳、不會重複扣款。
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={!renewal || hasPendingWithdrawal}
                aria-disabled={!renewal || hasPendingWithdrawal}
                aria-pressed={renewalMode === 'fresh'}
                onClick={() => renewal && !hasPendingWithdrawal && setRenewalMode('fresh')}
                className={`w-full text-left p-4 rounded-lg border transition-colors disabled:opacity-50 ${
                  renewalMode === 'fresh'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
                data-testid="renewal-mode-fresh"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">新約（重新起算）</span>
                  {renewalMode === 'fresh' && <CheckCircle className="h-5 w-5 text-primary" />}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  效期自付款日起算一年，可填寫新的推薦碼
                </p>
              </button>

              {/* AC-14 前端面：審核中提領期間不可選新約（後端建單也會擋）。
                  只給查看進度的入口，不提供自助取消。 */}
              {hasPendingWithdrawal && (
                <div className="p-3 bg-muted rounded-lg space-y-1">
                  <p className="text-xs text-muted-foreground">
                    您有一筆提領正在審核中，審核期間暫時無法選擇新約。請等待審核完成，或聯繫客服。
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/rewards')}
                    className="text-xs underline underline-offset-2 hover:text-foreground"
                    data-testid="view-withdrawal-progress"
                  >
                    查看提領進度
                  </button>
                </div>
              )}

              {/* A14：清空揭露——選新約前先看見將失去什麼（具體數字）。 */}
              {renewalMode === 'fresh' &&
                renewal &&
                (renewal.freshForfeitPoints > 0 || renewal.freshForfeitReferrals > 0) && (
                  <div
                    className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1"
                    data-testid="fresh-forfeit-disclosure"
                  >
                    <p className="text-sm text-red-800 font-medium">選擇新約將清空目前累積：</p>
                    <p className="text-sm text-red-800">
                      可提領回饋 <span className="font-bold">{renewal.freshForfeitPoints} 點</span>
                      、累積推薦{' '}
                      <span className="font-bold">{renewal.freshForfeitReferrals} 位</span>
                      將全部歸零，且無法復原。
                    </p>
                  </div>
                )}

              {renewalMode === 'fresh' && (
                <div className="space-y-1 p-3 bg-muted rounded-lg">
                  <label className="text-sm font-medium" htmlFor="new-referral-code">
                    新推薦碼（選填）
                  </label>
                  <Input
                    id="new-referral-code"
                    value={newReferralCode}
                    placeholder={
                      // 自動綁定的預設碼不外洩到 placeholder（決定 4）
                      pendingUser.referredByCode && !pendingUser.isAutoReferral
                        ? `目前：${pendingUser.referredByCode}`
                        : '輸入推薦碼'
                    }
                    onChange={(e) => {
                      setNewReferralCode(e.target.value);
                      setNewCodeStatus('idle');
                      setNewReferrerName(null);
                    }}
                    onBlur={() => handleValidateNewCode(newReferralCode)}
                    data-testid="new-referral-code-input"
                  />
                  {newCodeStatus === 'checking' && (
                    <p className="text-xs text-muted-foreground">
                      <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                      驗證中…
                    </p>
                  )}
                  {newCodeStatus === 'valid' && newReferrerName && (
                    <p className="text-xs text-green-600" data-testid="new-referrer-name">
                      推薦人：{newReferrerName}
                    </p>
                  )}
                  {newCodeStatus === 'invalid' && (
                    <p className="text-xs text-red-600">推薦碼不存在或已失效</p>
                  )}
                  {/* Q11：對使用者而言「沒填 = 沒有上一代」，不解釋機制內部。 */}
                  <p className="text-xs text-muted-foreground">
                    填寫推薦碼可加入該推薦人的網絡；留空表示不指定推薦人。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 付款金額 */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">年費</span>
              <div className="text-right">
                <div className="text-3xl font-bold">NT$ 1,200</div>
                {/* <div className="text-sm text-muted-foreground">
                  平均每月 NT$ 100
                </div> */}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handlePayUniPayment}
              disabled={isLoading || isButtonLocked || !isProfileComplete(pendingUser)}
              className="w-full"
              size="lg"
              data-testid="payuni-pay-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  處理中...
                </>
              ) : isButtonLocked ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  請稍候 <span data-testid="lock-countdown">{lockCountdown}</span> 秒
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  前往統一金流付款
                </>
              )}
            </Button>

            {/* 資料未填齊時，說明付款鈕為何反灰，並給一個回填資料的明確入口，
                避免使用者面對一顆「按不動」的按鈕不知所措。 */}
            {!isProfileComplete(pendingUser) && (
              <p
                className="text-sm text-center text-muted-foreground"
                data-testid="incomplete-profile-hint"
              >
                請先{' '}
                <button
                  type="button"
                  onClick={handleEdit}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  完成個人資料
                </button>{' '}
                才能付款
              </p>
            )}

            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading || isButtonLocked}
              className="w-full"
              data-testid="cancel-payment-button"
            >
              {isRenewal ? '稍後再說' : '登出，稍後再付款'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
