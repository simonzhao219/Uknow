import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Loader2, CheckCircle, CreditCard, Edit, Upload, ExternalLink, X, Image as ImageIcon } from 'lucide-react';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { buildApiUrl } from '../utils/apiClient';

// ✅ 統一金流付款網址（從環境變數讀取）
const PAYUNI_PAYMENT_URL = import.meta.env?.VITE_PAYUNI_PAYMENT_URL || 'https://api.payuni.com.tw/api/period/U08596041/TX09JXtXXU';

export function PaymentCheckout() {
  console.log('PaymentCheckout: Component rendering');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(true);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [referrerInfo, setReferrerInfo] = useState<{ name: string; code: string } | null>(null);
  const [isLoadingReferrer, setIsLoadingReferrer] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null);  // ✅ 新增：活動訂單狀態
  const [isButtonLocked, setIsButtonLocked] = useState(false);  // ✅ 新增：按鈕鎖定狀態
  const [lockCountdown, setLockCountdown] = useState(0);  // ✅ 新增：倒計時秒數
  // ✅ 過期會員續費雙模式（見 migration 0008）：extend=續約接續原效期；
  //    fresh=新約從付款日起算、可換新推薦人。null 表示尚未選擇。
  const [renewalMode, setRenewalMode] = useState<'extend' | 'fresh' | null>(null);
  const [newReferralCode, setNewReferralCode] = useState('');
  const [newCodeStatus, setNewCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [newReferrerName, setNewReferrerName] = useState<string | null>(null);
  
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const { showToast, showSuccess } = useNotification();
  const supabase = createClient();
  
  console.log('PaymentCheckout: Component state -', {
    isLoading,
    isCheckingUser,
    hasPendingUser: !!pendingUser,
    hasActiveOrder: !!activeOrder  // ✅ 新增
  });

  // ✅ 新增：定期檢查用戶狀態（每 5 秒）
  useEffect(() => {
    if (!pendingUser) return;
    
    const checkUserStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const response = await fetch(
          buildApiUrl('/auth/profile'),
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        
        if (response.ok) {
          const profile = await response.json();

          // ✅ 檢查狀態並自動跳轉——以會籍（accountStatus）為準，不再看
          // registrationStep：過期會員的 step 也是 3，但他們是來續約的，
          // 不能被彈回 dashboard 造成守衛↔結帳的無限循環。
          const isMemberActive = profile.accountStatus === 'active' || profile.accountStatus === 'grace';
          if (isMemberActive) {
            console.log('PaymentCheckout: 會籍已生效，跳轉到 dashboard');
            showToast('註冊完成！正在跳轉...', 'success');
            setTimeout(() => {
              navigate('/dashboard', { replace: true });
            }, 1500);
          } else if (profile.paidAwaitingActivation && profile.lastTradeNo) {
            // 已付款、開通中（不是「有 pending 訂單」就跳——付款失敗的
            // step 2 使用者要留在結帳頁重新付款）。
            console.log('PaymentCheckout: 用戶已付款，跳轉到結果頁');
            navigate(`/payment/result?tradeNo=${profile.lastTradeNo}`, { replace: true });
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
      let pendingUserData = localStorage.getItem('pendingUser');
      
      // 2. 如果 localStorage 沒有，從數據庫讀取
      if (!pendingUserData) {
        console.log('PaymentCheckout: No pendingUser in localStorage, fetching from API');
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('PaymentCheckout: No session, redirecting to login');
          navigate('/login', { replace: true });
          return;
        }
        
        try {
          const response = await fetch(
            buildApiUrl('/auth/profile'),
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          
          if (response.ok) {
            const profile = await response.json();
            console.log('PaymentCheckout: Profile loaded from API:', profile);
            
            // 3. 以會籍與付款狀態決定去向（registrationStep 只用來判斷
            //    首次註冊漏斗走到哪，不再當「已是會員」的依據）。
            const isMemberActive = profile.accountStatus === 'active' || profile.accountStatus === 'grace';

            if (isMemberActive) {
              // 會籍有效（active/grace）才彈回會員中心；過期會員留在
              // 結帳頁續約——舊版看 referralCode / step 3 就彈走，過期
              // 會員會在守衛與結帳頁之間無限循環。
              console.log('PaymentCheckout: Member is active, redirecting to dashboard');
              navigate('/dashboard', { replace: true });
              return;
            }

            // 已付款、開通中 → 結果頁（自癒輪詢）。付款失敗的 step 2
            // 使用者 paidAwaitingActivation 為 false，留在結帳頁重新付款。
            if (profile.paidAwaitingActivation && profile.lastTradeNo) {
              console.log('PaymentCheckout: User has paid order awaiting activation, redirecting to result');
              navigate(`/payment/result?tradeNo=${profile.lastTradeNo}`, { replace: true });
              return;
            }

            if (profile.registrationStep === 0 || !profile.registrationStep) {
              // 用戶尚未填寫基本資料，靜默導向 complete-profile
              console.log('PaymentCheckout: User needs to complete profile (step 0), redirecting');
              navigate('/auth/complete-profile', { replace: true });
              return;
            }

            // step 1 / 2（付款失敗）/ 3（已過期，續約）→ 留在結帳頁
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
        setPendingUser(userData);
        
        // 驗證 session 是否有效
        const { data: { session } } = await supabase.auth.getSession();
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
      if (!pendingUser?.referredByCode) {
        return;
      }

      // ✅ 優先使用 pendingUser 中已存儲的推薦人姓名
      if (pendingUser.referrerName) {
        console.log('PaymentCheckout: Using cached referrer name:', pendingUser.referrerName);
        setReferrerInfo({
          name: pendingUser.referrerName,
          code: pendingUser.referredByCode
        });
        return;
      }

      // ✅ 如果沒有緩存，才發送請求
      setIsLoadingReferrer(true);
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.log('PaymentCheckout: No session, skip fetching referrer info');
          return;
        }

        console.log(`PaymentCheckout: Fetching referrer info for code: ${pendingUser.referredByCode}`);
        
        const response = await fetch(
          buildApiUrl(`/referrals/validate/${pendingUser.referredByCode}`),
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          
          if (result.valid && result.referrer) {
            console.log('PaymentCheckout: Referrer info loaded:', result.referrer);
            setReferrerInfo({
              name: result.referrer.userName,
              code: pendingUser.referredByCode
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
  // 續約（extend）只有在「接續後效期仍在未來」才有意義；過期超過一年
  // 只能選新約（後端 /payuni/prepare 也會擋）。
  const extendNewEnd = (() => {
    if (!pendingUser?.subscriptionEndDate) return null;
    const d = new Date(pendingUser.subscriptionEndDate);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  })();
  const canExtend = !!extendNewEnd && extendNewEnd.getTime() > Date.now();
  // 進到續費畫面時給預設選項：能續約就預選續約（對使用者較直覺），
  // 不能就預選新約。
  useEffect(() => {
    if (isRenewal && renewalMode === null) {
      setRenewalMode(canExtend ? 'extend' : 'fresh');
    }
  }, [isRenewal, canExtend, renewalMode]);

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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(buildApiUrl(`/referrals/validate/${trimmed}`), {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
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

    // ✅ 檢查按鈕是否被鎖定
    if (isButtonLocked) {
      showToast(`請稍候 ${lockCountdown} 秒後再試`, 'warning');
      return;
    }

    // ✅ 續費模式檢查：新約填了推薦碼就必須先驗證通過，避免帶著無效碼
    //    送出（後端也會擋，這裡先給友善提示）。
    if (isRenewal && renewalMode === 'fresh' && newReferralCode.trim() && newCodeStatus !== 'valid') {
      showToast('推薦碼尚未驗證通過，請確認後再送出', 'warning');
      return;
    }

    try {
      setIsLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('登入已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

      // ✅ 呼叫後端 API 準備訂單。registrationStep 會在這筆 pending 訂單
      // 建立後自動變成 2（由 payment_orders 即時算出，不需要另外寫入）。
      // 過期續費時帶上使用者選的模式；首次付款不帶 body（後端視同 fresh）。
      const response = await fetch(
        buildApiUrl('/payuni/prepare'),
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          ...(isRenewal && renewalMode ? {
            body: JSON.stringify({
              renewalMode,
              ...(renewalMode === 'fresh' && newReferralCode.trim() && newCodeStatus === 'valid'
                ? { referredByCode: newReferralCode.trim() }
                : {}),
            })
          } : {}),
        }
      );

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
          HashInfo: result.data.HashInfo
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
        form.submit();  // 提交後會跳轉到 PayUni
      } else {
        showToast(result.error?.message || '準備訂單失敗', 'error');
      }
    } catch (error: any) {
      console.error('PaymentCheckout: PayUni payment error:', error);
      showToast(error.message || '付款失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ 新增：重新開啟付款頁面
  const handleReopenPayment = () => {
    const paymentUrl = PAYUNI_PAYMENT_URL;
    window.open(paymentUrl, '_blank');
    showToast('已開啟付款頁面', 'info');
  };

  const handlePayment = async () => {
    if (!pendingUser) {
      showToast('用戶資料不存在，請重新註冊', 'error');
      navigate('/auth/complete-profile');
      return;
    }

    // ✅ CRITICAL: 防止重複提交
    if (isLoading) {
      showToast('處理中，請稍候...', 'warning');
      return;
    }

    setIsLoading(true);

    try {
      console.log('PaymentCheckout: Starting payment process...');
      
      // 取得當前 session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('PaymentCheckout: No session found');
        showToast('登入狀態已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

      console.log('PaymentCheckout: Creating payment order...');

      // 1. 創建付款訂單
      const orderResponse = await fetch(
        buildApiUrl('/payment/create-order'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userId: pendingUser.id,
            amount: 1200,
            referralCode: pendingUser.referredByCode || null,
          }),
        }
      );

      if (!orderResponse.ok) {
        const errorData = await orderResponse.json();
        console.error('PaymentCheckout: Order creation error:', errorData);
        throw new Error(errorData.error?.message || '創建付款訂單失敗');
      }

      const orderResult = await orderResponse.json();
      const { orderId } = orderResult.data; // ✅ 修正：從 data 中取出 orderId
      console.log('PaymentCheckout: Order created:', orderId);
      console.log('PaymentCheckout: Full order details:', orderResult.data);

      // 2. 模擬付款成功（實際環境中會跳轉到藍新金流）
      console.log('PaymentCheckout: Simulating payment success...');
      
      const paymentResponse = await fetch(
        buildApiUrl('/payment/simulate-success'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            orderId: orderId,
          }),
        }
      );

      if (!paymentResponse.ok) {
        const errorData = await paymentResponse.json();
        console.error('PaymentCheckout: Payment processing error:', errorData);
        
        // ✅ CRITICAL: 處理特定錯誤碼
        if (errorData.error?.code === 'DUPLICATE_SUBSCRIPTION') {
          showToast('您已完成付款，無需重複付款', 'warning');
          // 嘗試獲取最新用戶資料並導航
          await refreshUserProfileAndNavigate(session);
          return;
        }
        
        if (errorData.error?.code === 'PAYMENT_IN_PROGRESS') {
          showToast(errorData.error.message, 'warning');
          return;
        }
        
        throw new Error(errorData.error?.message || '付款處理失敗');
      }

      const result = await paymentResponse.json();
      console.log('PaymentCheckout: Payment successful:', result);
      
      // ✅ CRITICAL: 檢查是否是重複處理
      if (result.alreadyProcessed) {
        console.log('PaymentCheckout: Payment already processed, redirecting...');
        showToast('付款已完成', 'success');
        await refreshUserProfileAndNavigate(session);
        return;
      }

      // 3. 獲取完整的用戶資料（包含推薦碼）
      await refreshUserProfileAndNavigate(session);

    } catch (error: any) {
      console.error('PaymentCheckout: Payment error:', error);
      showToast(error.message || '付款處理失敗，請稍後再試', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // ✅ 新增：統一的用戶資料刷新與導航邏輯
  const refreshUserProfileAndNavigate = async (session: any) => {
    try {
      const profileResponse = await fetch(
        buildApiUrl('/auth/profile'),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        console.log('PaymentCheckout: Updated profile retrieved:', updatedProfile);
        
        // 更新用戶狀態
        setUser(updatedProfile);
        localStorage.setItem('user', JSON.stringify(updatedProfile));
        localStorage.removeItem('pendingUser');

        // ✅ 修改：使用輕量級 Toast 通知
        showToast('註冊成功', 'success');

        // 導向 dashboard（縮短延遲以配合 Toast）
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 500);
      } else {
        // 如果無法獲取更新後的資料，使用原有資料並導向
        console.warn('PaymentCheckout: Failed to retrieve updated profile, using cached data');
        
        const fallbackProfile = {
          ...pendingUser,
          registrationStep: 3,
          referralCode: result.data?.referralCode || '生成中',
        };
        
        setUser(fallbackProfile);
        localStorage.setItem('user', JSON.stringify(fallbackProfile));
        localStorage.removeItem('pendingUser');

        // ✅ 修改：使用輕量級 Toast 通知
        showToast('註冊成功', 'success');

        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 500);
      }
    } catch (error) {
      console.error('PaymentCheckout: Error refreshing user profile:', error);
      showToast('無法獲取最新用戶資料，請稍後再試', 'error');
    }
  };

  const handleCancel = async () => {
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        showToast('登入狀態已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }
      
      const response = await fetch(
        buildApiUrl('/auth/reset-registration'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('PaymentCheckout: Reset registration error:', errorData);
        throw new Error(errorData.error?.message || '重置註冊狀態失敗');
      }
      
      console.log('PaymentCheckout: Registration step reset to 0');
      
      // 3. 導向填寫資料頁面
      showToast('您可以重新編輯註冊資料', 'info');
      navigate('/auth/complete-profile');
      
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
              您的會籍已於 {pendingUser.subscriptionEndDate?.slice(0, 10)} 到期，請選擇續費方式
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

          {/* 續費模式選擇：續約（接續原效期）/ 新約（重新起算，可換推薦人） */}
          {isRenewal && (
            <div className="space-y-3" data-testid="renewal-mode-section">
              <h3 className="text-sm font-medium">續費方式</h3>

              {canExtend && (
                <button
                  type="button"
                  onClick={() => setRenewalMode('extend')}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
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
                    保留原帳號脈絡，效期自 {pendingUser.subscriptionEndDate?.slice(0, 10)} 接續，
                    至 {extendNewEnd?.toISOString().slice(0, 10)}
                  </p>
                </button>
              )}

              <button
                type="button"
                onClick={() => setRenewalMode('fresh')}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
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

              {!canExtend && (
                <p className="text-xs text-muted-foreground">
                  會籍已過期超過一年，無法接續原效期，僅能以新約重新起算。
                </p>
              )}

              {renewalMode === 'fresh' && (
                <div className="space-y-1 p-3 bg-muted rounded-lg">
                  <label className="text-sm font-medium" htmlFor="new-referral-code">
                    新推薦碼（選填）
                  </label>
                  <Input
                    id="new-referral-code"
                    value={newReferralCode}
                    placeholder={pendingUser.referredByCode ? `目前：${pendingUser.referredByCode}` : '輸入推薦碼'}
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
                      <Loader2 className="inline h-3 w-3 animate-spin mr-1" />驗證中…
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
                  <p className="text-xs text-muted-foreground">
                    留空則維持原推薦關係。
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
              disabled={isLoading || isButtonLocked}
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

            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading || isButtonLocked}
              className="w-full"
              data-testid="cancel-payment-button"
            >
              稍後付款
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}