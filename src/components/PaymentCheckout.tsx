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
  
  // ✅ 新增：付款流程狀態管理
  const [hasClickedPayment, setHasClickedPayment] = useState(false);
  const [uploadedScreenshot, setUploadedScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
  
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const { showToast, showSuccess } = useNotification();
  const supabase = createClient();
  
  console.log('PaymentCheckout: Component state -', {
    isLoading,
    isCheckingUser,
    hasPendingUser: !!pendingUser
  });

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

  // ✅ 新增：檢查是否已點擊付款（從 localStorage 讀取）
  useEffect(() => {
    if (pendingUser?.id) {
      const storageKey = `paymentClicked_${pendingUser.id}`;
      const clicked = localStorage.getItem(storageKey) === 'true';
      setHasClickedPayment(clicked);
      console.log('PaymentCheckout: hasClickedPayment from localStorage:', clicked);
    }
  }, [pendingUser]);

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

  // ✅ 新增：處理首次點擊付款按鈕（跳轉到統一金流）
  const handlePaymentButtonClick = () => {
    if (!pendingUser) {
      showToast('用戶資料不存在，請重新註冊', 'error');
      navigate('/auth/complete-profile');
      return;
    }

    // 記錄已點擊付款
    const storageKey = `paymentClicked_${pendingUser.id}`;
    localStorage.setItem(storageKey, 'true');
    setHasClickedPayment(true);

    // 跳轉到統一金流付款頁面（新視窗）
    const paymentUrl = PAYUNI_PAYMENT_URL;
    window.open(paymentUrl, '_blank');

    showToast('請在新視窗完成付款，完成後返回此頁面上傳付款截圖', 'info', { duration: 5000 });
  };

  // ✅ 新增：PayUni 續期收款付款
  const handlePayUniPayment = async () => {
    if (!pendingUser) {
      showToast('用戶資料不存在，請重新註冊', 'error');
      navigate('/auth/complete-profile');
      return;
    }

    try {
      setIsLoading(true);
      
      // 調用後端 API 準備訂單
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('登入已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

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

  // ✅ 新增：處理截圖選擇
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 驗證檔案類型
    if (!file.type.startsWith('image/')) {
      showToast('請上傳圖片檔案（JPG、PNG 等）', 'error');
      return;
    }

    // 驗證檔案大小（最大 5MB）
    if (file.size > 5 * 1024 * 1024) {
      showToast('檔案大小不能超過 5MB', 'error');
      return;
    }

    // 設置檔案和預覽
    setUploadedScreenshot(file);

    // 生成預覽圖
    const reader = new FileReader();
    reader.onloadend = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    showToast('截圖已選擇', 'success');
  };

  // ✅ 新增：清除截圖
  const handleClearScreenshot = () => {
    setUploadedScreenshot(null);
    setScreenshotPreview(null);
  };

  // ✅ 新增：完成註冊（上傳截圖後執行原本的付款邏輯）
  const handleCompleteRegistration = async () => {
    if (!uploadedScreenshot) {
      showToast('請先上傳付款成功截圖', 'error');
      return;
    }

    // ✅ CRITICAL: 防止重複提交
    if (isLoading) {
      showToast('處理中，請稍候...', 'warning');
      return;
    }

    // 執行原本的 handlePayment 邏輯
    await handlePayment();
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
      
      // 2. 清除本地存储
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

  // ✅ 上傳付款截圖
  const handleUploadScreenshot = async () => {
    if (!uploadedScreenshot) {
      showToast('請選擇一張付款截圖', 'error');
      return;
    }

    setIsUploadingScreenshot(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('PaymentCheckout: No session found');
        showToast('登入狀態已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

      const formData = new FormData();
      formData.append('file', uploadedScreenshot);
      formData.append('orderId', pendingUser.orderId);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/payment/upload-screenshot`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('PaymentCheckout: Upload screenshot error:', errorData);
        throw new Error(errorData.error?.message || '上傳截圖失敗');
      }

      const result = await response.json();
      console.log('PaymentCheckout: Screenshot uploaded:', result);

      // 3. 獲取完整的用戶資料（包含推薦碼）
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
        
        // 更新用狀態
        setUser(updatedProfile);
        localStorage.setItem('user', JSON.stringify(updatedProfile));
        localStorage.removeItem('pendingUser');

        // 顯示成功訊息（包含推薦碼）
        showSuccess(
          '付款成功！',
          '您的帳號已成功啟用',
          [
            `您的推薦碼：${updatedProfile.referralCode || result.data?.referralCode || '生成中'}`,
            '現在可以開始使用所有功能',
            '建議您完善刊登資訊以吸引更多客戶'
          ]
        );

        // 導向 dashboard
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 2000);
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

        showSuccess(
          '付款成功！',
          '您的帳號已成功啟用',
          [
            `您的推薦碼：${result.data?.referralCode || '生成中'}`,
            '現在可以開始使用所有功能'
          ]
        );

        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 2000);
      }
    } catch (error: any) {
      console.error('PaymentCheckout: Error during upload screenshot:', error);
      showToast(error.message || '上傳截圖失敗，請稍後再試', 'error');
    } finally {
      setIsUploadingScreenshot(false);
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

          {/* ✅ 狀態 1：首次進入（未點擊過付款按鈕） */}
          {!hasClickedPayment && (
            <div className="space-y-3">
              <Button
                onClick={handlePayUniPayment}
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    處理中...
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
                disabled={isLoading}
                className="w-full"
              >
                稍後付款（測試用）
              </Button>
            </div>
          )}

          {/* ✅ 狀態 2：返回後（已點擊過付款按鈕） */}
          {hasClickedPayment && (
            <div className="space-y-4">
              {/* 分隔線 */}
              <div className="border-t pt-4"></div>

              {/* 上傳付款截圖區域 */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  上傳付款成功截圖
                </h3>

                {/* 截圖預覽 */}
                {screenshotPreview ? (
                  <div className="relative border-2 border-dashed border-primary rounded-lg p-4">
                    <div className="relative">
                      <img
                        src={screenshotPreview}
                        alt="付款截圖預覽"
                        className="w-full h-48 object-contain rounded"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 bg-background/80 hover:bg-background"
                        onClick={handleClearScreenshot}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-center text-muted-foreground mt-2">
                      {uploadedScreenshot?.name}
                    </p>
                  </div>
                ) : (
                  <label className="block cursor-pointer">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary hover:bg-muted/50 transition-colors">
                      <ImageIcon className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium mb-1">點擊選擇圖片</p>
                      <p className="text-xs text-muted-foreground">
                        或拖曳圖片到此處
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        支援 JPG、PNG 格式（最大 5MB）
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleScreenshotChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* 分隔線 */}
              <div className="border-t pt-4"></div>

              {/* 操作按鈕 */}
              <div className="space-y-3">
                {/* 重新開啟付款頁面 */}
                <Button
                  variant="outline"
                  onClick={handleReopenPayment}
                  className="w-full"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  前往統一金流付款
                </Button>

                {/* 完成註冊 */}
                <Button
                  onClick={handleCompleteRegistration}
                  disabled={isLoading || !uploadedScreenshot}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      處理中...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      完成註冊
                    </>
                  )}
                </Button>

                {/* 稍後付款 */}
                <Button
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="w-full"
                >
                  稍後付款
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}