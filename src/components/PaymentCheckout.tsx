import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Loader2, CheckCircle, CreditCard, Edit, Upload, ExternalLink, X, Image as ImageIcon } from 'lucide-react';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { projectId } from '../utils/supabase/info';
import { useNotification } from './notifications/NotificationContext';

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
          `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/profile`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        
        if (response.ok) {
          const profile = await response.json();
          
          // ✅ 檢查狀態並自動跳轉
          if (profile.registrationStep === 3) {
            console.log('PaymentCheckout: 用戶已完成註冊，跳轉到 dashboard');
            showToast('註冊完成！正在跳轉...', 'success');
            setTimeout(() => {
              navigate('/dashboard', { replace: true });
            }, 1500);
          } else if (profile.registrationStep === 2 && profile.pendingActivation && profile.lastTradeNo) {
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
            `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/profile`,
            {
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          
          if (response.ok) {
            const profile = await response.json();
            console.log('PaymentCheckout: Profile loaded from API:', profile);
            
            // 3. 檢查 registrationStep
            if (profile.registrationStep === 1 || profile.registrationStep === 2) {
              // 用戶已填寫基本資料，使用 profile 數據
              console.log('PaymentCheckout: User has completed profile (step 1/2), using API data');
              
              // ✅ 新增：檢查是否已完成付款
              const hasPaidMembership = !!profile.referralCode;
              
              if (hasPaidMembership) {
                // 已完成付款，導向會員中心
                console.log('PaymentCheckout: User already paid, redirecting to dashboard');
                navigate('/dashboard', { replace: true });
                return;
              }
              
              // ✅ 新增：檢查是否有活動訂單
              if (profile.registrationStep === 2 && profile.pendingActivation && profile.lastTradeNo) {
                console.log('PaymentCheckout: User has active order, checking status...');
                // 有待處理的訂單，跳轉到付款結果頁
                navigate(`/payment/result?tradeNo=${profile.lastTradeNo}`, { replace: true });
                return;
              }
              
              setPendingUser(profile);
              setIsCheckingUser(false);
              return;
            } else if (profile.registrationStep === 0 || !profile.registrationStep) {
              // 用戶尚未填寫基本資料，靜默導向 complete-profile
              console.log('PaymentCheckout: User needs to complete profile (step 0), redirecting');
              navigate('/auth/complete-profile', { replace: true });
              return;
            } else if (profile.registrationStep === 3) {
              // 用戶完成註冊，不應該在這裡
              console.log('PaymentCheckout: User registration complete (step 3), redirecting to dashboard');
              navigate('/dashboard', { replace: true });
              return;
            }
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
          `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/referrals/validate/${pendingUser.referredByCode}`,
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

    try {
      setIsLoading(true);
      
      // ✅ 步驟 1：更新 registrationStep 為 2（付款中）
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('登入已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }
      
      console.log('PaymentCheckout: 更新 registrationStep 為 2...');
      
      const updateResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/profile`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: pendingUser.name,           // ✅ 必需：用户姓名
            phone: pendingUser.phone,         // ✅ 必需：用户手机
            registrationStep: 2               // ✅ 更新为付款中状态
          })
        }
      );
      
      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        console.error('PaymentCheckout: 更新 registrationStep 失敗:', error);
        showToast('更新狀態失敗，請稍後再試', 'error');
        setIsLoading(false);
        return;
      }
      
      console.log('PaymentCheckout: registrationStep 已更新為 2');
      
      // ✅ 步驟 2：調用後端 API 準備訂單
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/payuni/prepare`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
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
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/payment/create-order`,
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
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/payment/simulate-success`,
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
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/profile`,
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
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/reset-registration`,
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
          <CardTitle className="text-2xl">完成付款</CardTitle>
          {/*<CardDescription>
            最後一步，付款後即可開始使用 Uknow 平台
          </CardDescription>*/}
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
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  處理中...
                </>
              ) : isButtonLocked ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  請稍候 {lockCountdown} 秒
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
            >
              稍後付款
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}