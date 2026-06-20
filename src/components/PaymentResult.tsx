import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw, CreditCard, AlertCircle } from 'lucide-react';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';
import { Progress } from './ui/progress';

type OrderStatus = 'pending' | 'success' | 'failed' | 'unknown';

// ✅ PayUni 付款數據完整結構
interface PaymentData {
  AuthAmt: string;           // 授權金額
  PayerName: string;         // 付款人姓名
  PayerPhone: string;        // 付款人電話
  PayerEmail: string;        // 付款人 Email
  Card6No: string;           // 卡號前 6 碼
  Card4No: string;           // 卡號後 4 碼
  CardExpired: string;       // 卡片到期日 (MMYY)
  AuthBankName: string;      // 銀行名稱
  PeriodAmt: string;         // 週期金額
  DateList: string;          // 扣款日期清單
  Message?: string;          // 訊息
  ResCode?: string;          // 回應代碼
  ResCodeMsg?: string;       // 回應代碼訊息
}

interface OrderResult {
  status: OrderStatus;
  tradeNo: string;
  periodTradeNo?: string;    // ✅ 週期交易號
  mode?: string;             // ✅ 測試/正式模式
  completedAt?: string;      // ✅ 完成時間
  paymentData?: PaymentData; // ✅ PayUni 完整付款數據
  errorMessage?: string;
  errorCode?: string;
}

export function PaymentResult() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast, showSuccess, showError } = useNotification();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);  // ✅ 新增：重試計數
  const [maxRetries] = useState(12);  // ✅ 新增：最多重試 12 次
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);  // ✅ 新增：檢查認證狀態
  const [userStatus, setUserStatus] = useState<{
    registrationStep: number;
    referralCode?: string;
  } | null>(null);  // ✅ 新增：用戶狀態
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);  // ✅ 新增：狀態檢查中
  const [countdown, setCountdown] = useState<number | null>(null);  // ✅ 新增：倒計時狀態
  const [hasStartedCountdown, setHasStartedCountdown] = useState(false);  // ✅ 新增：防止重複啟動倒計時
  
  const tradeNo = searchParams.get('tradeNo');
  
  // ⚠️ 新增元件掛載日誌
  console.log('[PaymentResult] 🎬 Component rendering', {
    tradeNo,
    isLoading,
    orderResult,
    retryCount,
    isCheckingAuth,
    userStatus,
    isCheckingStatus,
    searchParamsAll: Object.fromEntries(searchParams.entries())
  });
  
  // ✅ 檢查用戶是否已完成註冊（registrationStep = 3）
  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        console.log('[PaymentResult] 🔍 Checking user registration status...');
        
        const supabase = (await import('../utils/supabase/client')).createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.log('[PaymentResult] ⚠️ No session found');
          setIsCheckingAuth(false);
          return;
        }
        
        // 獲取用戶 profile
        const { buildApiUrl: apiUrl } = await import('../utils/apiClient');
        const response = await fetch(apiUrl('/auth/profile'), {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        
        if (response.ok) {
          const profile = await response.json();
          console.log('[PaymentResult] 👤 User profile:', {
            registrationStep: profile.registrationStep,
            hasReferralCode: !!profile.referralCode
          });
          
          setUserStatus({
            registrationStep: profile.registrationStep,
            referralCode: profile.referralCode
          });
          
          // ✅ 如果已完成註冊（Step 3），自動跳轉到 dashboard
          if (profile.registrationStep === 3 && profile.referralCode) {
            console.log('[PaymentResult] ✅ User already completed registration, redirecting to dashboard...');
            showToast('您已完成註冊，正在跳轉到會員中心...', 'info');
            
            setTimeout(() => {
              navigate('/dashboard', { replace: true });
            }, 1000);
            return;
          }
        }
        
        setIsCheckingAuth(false);
      } catch (error) {
        console.error('[PaymentResult] ❌ Error checking user status:', error);
        setIsCheckingAuth(false);
      }
    };
    
    checkUserStatus();
  }, [navigate, showToast]);
  
  // ✅ 完成註冊函數（必須在 useEffect 之前定義）
  const handleCompleteRegistration = async () => {
    setIsCompleting(true);
    
    try {
      const result = await apiRequestJson<{
        success: boolean;
        message: string;
        data: {
          referralCode: string;
          activeUntil: string;
          accountStatus: string;
        };
      }>(
        buildApiUrl('/auth/complete-registration'),
        { method: 'POST' }
      );
      
      if (result.success) {
        showSuccess(
          '註冊完成！',
          `您的推薦碼：${result.data.referralCode}`,
          [
            `帳號狀態：${result.data.accountStatus}`,
            `有效期限：${new Date(result.data.activeUntil).toLocaleDateString('zh-TW')}`
          ]
        );
        
        // 重新加載完整的 profile（包含 registrationStep = 3）
        window.location.href = '/dashboard';
      } else {
        throw new Error(result.message || '完成註冊失敗');
      }
    } catch (error: any) {
      console.error('完成註冊失敗:', error);
      showError(
        '完成註冊失敗',
        error.message || '請稍後再試，或聯繫客服協助處理'
      );
    } finally {
      setIsCompleting(false);
    }
  };
  
  // ✅ 新增：訂單成功後，定期檢查用戶註冊狀態（每 3 秒，最多 60 秒）
  useEffect(() => {
    if (!orderResult || orderResult.status !== 'success') return;
    if (userStatus?.registrationStep === 3) return;  // 已完成，停止檢查
    
    setIsCheckingStatus(true);
    
    const checkRegistrationStatus = async () => {
      try {
        const supabase = (await import('../utils/supabase/client')).createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return;
        
        const { buildApiUrl: apiUrl } = await import('../utils/apiClient');
        const response = await fetch(apiUrl('/auth/profile'), {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        
        if (response.ok) {
          const profile = await response.json();
          setUserStatus({
            registrationStep: profile.registrationStep,
            referralCode: profile.referralCode
          });
          
          // ✅ 如果已完成，自動跳轉
          if (profile.registrationStep === 3) {
            console.log('[PaymentResult] 檢測到註冊已完成');
            setIsCheckingStatus(false);
            showToast('🎉 註冊完成！正在跳轉...', 'success');
            
            setTimeout(() => {
              navigate('/dashboard', { replace: true });
            }, 2000);
          }
        }
      } catch (error) {
        console.error('檢查註冊狀態失敗:', error);
      }
    };
    
    // ✅ 立即檢查一次
    checkRegistrationStatus();
    
    // ✅ 每 3 秒檢查一次（最多檢查 20 次 = 60 秒）
    let checkCount = 0;
    const maxChecks = 20;
    
    const intervalId = setInterval(() => {
      checkCount++;
      
      if (checkCount >= maxChecks) {
        console.log('[PaymentResult] 檢查次數已達上限，停止輪詢');
        setIsCheckingStatus(false);
        clearInterval(intervalId);
        return;
      }
      
      checkRegistrationStatus();
    }, 3000);
    
    return () => {
      clearInterval(intervalId);
    };
    
  }, [orderResult, userStatus, navigate, showToast]);
  
  // ✅ 新增：自動倒數 5 秒後點擊「完成註冊」按鈕
  useEffect(() => {
    if (!orderResult || orderResult.status !== 'success') return;
    if (userStatus?.registrationStep === 3) return;  // 已完成註冊，不需要倒數
    if (isCompleting) return;  // 正在處理，不啟動倒數
    if (hasStartedCountdown) return;  // ✅ 已經啟動過，不重複啟動
    
    console.log('[PaymentResult] 🕐 啟動自動倒數計時器');
    setHasStartedCountdown(true);  // ✅ 標記已啟動
    setCountdown(5);
    
    let remainingTime = 5;
    
    const countdownInterval = setInterval(() => {
      remainingTime--;
      console.log('[PaymentResult] ⏰ 倒數:', remainingTime);
      setCountdown(remainingTime);
      
      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        console.log('[PaymentResult] ⏰ 倒數結��，自動點擊「完成註冊」');
        handleCompleteRegistration();
      }
    }, 1000);
    
    return () => {
      console.log('[PaymentResult] 🧹 清理倒數計時器');
      clearInterval(countdownInterval);
    };
  }, [orderResult, hasStartedCountdown]);  // ✅ 移除 userStatus 和 isCompleting 依賴
  
  // ✅ 查詢訂單狀態（支援重試）
  const fetchOrderStatus = async (): Promise<OrderResult | null> => {
    console.log('[PaymentResult] 📞 fetchOrderStatus called', { tradeNo, retryCount });
    
    if (!tradeNo) {
      console.error('[PaymentResult] ❌ No tradeNo, cannot fetch');
      setIsLoading(false);
      const unknownResult = { status: 'unknown' as OrderStatus, tradeNo: '' };
      setOrderResult(unknownResult);
      showToast('缺少訂單編號', 'error');
      return unknownResult;
    }
    
    const apiUrl = buildApiUrl(`/payuni/result/${tradeNo}`);
    console.log('[PaymentResult] 🌐 API URL:', apiUrl);
    
    try {
      console.log('[PaymentResult] 🚀 Sending API request...');
      
      const result = await apiRequestJson<{
        success: boolean;
        data: {  // ✅ 修正：後端回傳的是 "data" 不是 "order"
          status: OrderStatus;
          tradeNo: string;
          periodTradeNo?: string;    // ✅ 週期交易號
          mode?: string;             // ✅ 測試/正式模式
          completedAt?: string;      // ✅ 完成時間
          paymentData?: PaymentData; // ✅ PayUni 完整付款數據
          errorMessage?: string;
          errorCode?: string;
        };
      }>(apiUrl);
      
      console.log('[PaymentResult] ✅ API response:', result);
      
      if (result.success) {
        console.log('[PaymentResult] ✅ Order found:', result.data);  // ✅ 修正：data 不是 order
        setOrderResult(result.data);  // ✅ 修正：data 不是 order
        return result.data;
      } else {
        console.log('[PaymentResult] ⚠️ API returned success=false');
        const unknownResult = { status: 'unknown' as OrderStatus, tradeNo };
        setOrderResult(unknownResult);
        return unknownResult;
      }
    } catch (error: any) {
      console.error('[PaymentResult] 💥 API request failed:', error);
      console.error('[PaymentResult] Error type:', error.constructor.name);
      console.error('[PaymentResult] Error message:', error.message);
      console.error('[PaymentResult] Error stack:', error.stack);
      
      // ✅ 只在首次查詢失敗時顯示錯誤提示
      if (retryCount === 0) {
        showToast('查詢訂單狀態失敗', 'error');
      }
      const unknownResult = { status: 'unknown' as OrderStatus, tradeNo };
      setOrderResult(unknownResult);
      return unknownResult;
    }
  };
  
  // ✅ 智能輪詢邏輯（指數退避）
  const fetchOrderStatusWithRetry = async (currentRetry: number = 0) => {
    console.log('[PaymentResult] 🔄 fetchOrderStatusWithRetry', { currentRetry, maxRetries });
    
    setRetryCount(currentRetry);
    const result = await fetchOrderStatus();
    
    if (!result) {
      setIsLoading(false);
      return;
    }
    
    // ✅ 如果是最終狀態，停止輪詢
    if (result.status === 'success' || result.status === 'failed') {
      console.log('[PaymentResult] ✅ Final status reached:', result.status);
      setIsLoading(false);
      return;
    }
    
    // ✅ 如果仍是 pending，繼續重試
    if (result.status === 'pending' && currentRetry < maxRetries) {
      // 指數退避：500ms → 750ms → 1.1s → 1.7s → 2.5s → 3.8s → ...
      const delay = 500 * Math.pow(1.5, currentRetry);
      console.log(`[PaymentResult] ⏳ Retry ${currentRetry + 1}/${maxRetries} after ${delay.toFixed(0)}ms`);
      
      setTimeout(() => {
        fetchOrderStatusWithRetry(currentRetry + 1);
      }, delay);
    } else if (currentRetry >= maxRetries) {
      // ✅ 超時保護
      console.error('[PaymentResult] ⚠️ Max retries reached, giving up');
      setIsLoading(false);
      showToast('查詢超時，請稍後再試或聯繫客服', 'warning');
    } else {
      // unknown 狀態
      setIsLoading(false);
    }
  };
  
  // ✅ 首次查詢延遲 5 秒
  useEffect(() => {
    console.log('[PaymentResult] ⚡ useEffect triggered', { tradeNo, isCheckingAuth });
    
    // ✅ 等待認證檢查完成
    if (isCheckingAuth) {
      console.log('[PaymentResult] ⏸️ Waiting for auth check...');
      return;
    }
    
    if (tradeNo) {
      console.log('[PaymentResult] ⏰ Waiting 5 seconds before first query...');
      
      const timer = setTimeout(() => {
        console.log('[PaymentResult] ▶️ Starting query after 5 seconds delay');
        fetchOrderStatusWithRetry(0);
      }, 5000);  // ✅ 延遲 5 秒
      
      return () => {
        console.log('[PaymentResult] 🧹 Cleaning up timer');
        clearTimeout(timer);
      };
    } else {
      console.log('[PaymentResult] ⏸️ No tradeNo, waiting...');
      setIsLoading(false);
    }
  }, [tradeNo, isCheckingAuth]);
  
  useEffect(() => {
    console.log('[PaymentResult] 🎬 Component mounted');
    return () => {
      console.log('[PaymentResult] 🔚 Component unmounting');
    };
  }, []);
  
  console.log('[PaymentResult] 🎨 Rendering UI', { isLoading, orderResult, retryCount });
  
  // ✅ 重新付款（回到 Step 1）
  const handleRetryPayment = async () => {
    try {
      // 調用後端 API 重置到 Step 1
      await apiRequestJson(
        buildApiUrl('/auth/reset-to-payment'),
        { method: 'POST' }
      );
      
      showToast('正在返回付款頁面...', 'info');
      
      // 重新加載頁面以獲取最新的 profile
      window.location.href = '/payment/checkout';
    } catch (error: any) {
      console.error('重置付款狀態失敗:', error);
      showToast('操作失敗，請重新整理頁面', 'error');
    }
  };
  
  // ✅ 聯繫客服
  const handleContactSupport = () => {
    window.open('https://line.me/ti/p/@Uknow', '_blank');
  };
  
  // ✅ 載入中（新增進度條與等待提示）
  if (isLoading) {
    const progress = Math.min((retryCount / maxRetries) * 100, 100);
    
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Clock className="h-16 w-16 text-blue-600 animate-pulse" />
            </div>
            <CardTitle className="text-2xl">查詢付款結果中</CardTitle>
            <CardDescription>
              {retryCount === 0 
                ? '正在等待金流系統回應，通常需要 2-5 秒'
                : `正在確認付款狀態（${retryCount}/${maxRetries}）`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <p className="text-sm text-blue-800">
                💡 <strong>提示：</strong>請稍候，系統會自動查詢結果
              </p>
              <p className="text-xs text-blue-600">
                • 無需重新整理頁面<br />
                • 無需重複點擊按鈕<br />
                • 查詢過程完全自動化
              </p>
              
              {/* ✅ 進度條 */}
              {retryCount > 0 && (
                <div className="space-y-2 pt-2">
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-center text-blue-600">
                    查詢進度：{progress.toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
            
            {/* ✅ 手動查詢按鈕（僅在重試 3 次後顯示）*/}
            {retryCount >= 3 && (
              <Button
                onClick={() => fetchOrderStatus()}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                立即查詢
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 付款成功
  if (orderResult?.status === 'success') {
    // 🐛 除錯日誌：檢查 orderResult 與 paymentData
    console.log('[PaymentResult] 💳 Payment Success Block', {
      orderResult,
      hasPaymentData: !!orderResult.paymentData,
      paymentDataKeys: orderResult.paymentData ? Object.keys(orderResult.paymentData) : [],
      paymentData: orderResult.paymentData
    });
    
    // ✅ 格式化卡片到期日 (MMYY → MM/YY)
    const formatCardExpiry = (expiry: string) => {
      if (expiry && expiry.length === 4) {
        return `${expiry.substring(0, 2)}/${expiry.substring(2)}`;
      }
      return expiry;
    };
    
    // ✅ 解析下期扣款日
    const getNextPaymentDate = (dateList: string) => {
      if (!dateList) return '未知';
      const dates = dateList.split(',');
      return dates.length > 1 ? dates[1] : '未知';
    };
    
    const paymentData = orderResult.paymentData;
    
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle className="text-2xl">付款成功！</CardTitle>
            <CardDescription>
              您的付款已成功處理，請點擊下方按鈕完成註冊
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ✅ 付款資訊 - 整合成單一卡片 */}
            <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 space-y-4">
              {/* 付款成功標題 */}
              <div className="flex items-center gap-2 pb-3 border-b border-green-200">
                <CreditCard className="h-5 w-5 text-green-600" />
                <h3 className="text-base font-semibold text-green-800">付款資訊</h3>
                {orderResult.mode === 'test' && (
                  <span className="ml-auto text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                    ⚠️ 測試模式
                  </span>
                )}
              </div>
              
              {/* 付款人與信用卡資訊 */}
              {paymentData && (
                <>
                  <div className="border-b border-green-200 p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">付款人姓名</span>
                      <span className="text-sm text-gray-900 font-medium">{paymentData.PayerName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">付款人電話</span>
                      <span className="text-sm text-gray-900">{paymentData.PayerPhone}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">付款人Email</span>
                      <span className="text-sm text-gray-900 break-all">{paymentData.PayerEmail}</span>
                    </div>
                  </div>
                  
                  <div className="border-b border-green-200 p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">信用卡銀行</span>
                      <span className="text-sm text-gray-900 font-medium">{paymentData.AuthBankName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">信用卡號</span>
                      <span className="text-sm text-gray-900 font-mono">
                        {paymentData.Card6No} ****** {paymentData.Card4No}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">到期日</span>
                      <span className="text-sm text-gray-900">{formatCardExpiry(paymentData.CardExpired)}</span>
                    </div>
                  </div>
                  
                  <div className="border-b border-green-200 p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">訂閱方案</span>
                      <span className="text-sm text-gray-900 font-bold">NT$ {paymentData.PeriodAmt} / 年</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">下期扣款日</span>
                      <span className="text-sm text-gray-900">{getNextPaymentDate(paymentData.DateList)}</span>
                    </div>
                  </div>
                </>
              )}
              
              {/* 訂單資訊區 */}
              <div className="p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">訂單編號</span>
                  <span className="text-sm text-gray-900 font-mono">{orderResult.periodTradeNo || orderResult.tradeNo}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">付款金額</span>
                  <span className="text-lg text-green-600 font-bold">NT$ {paymentData?.AuthAmt || '1,200'}</span>
                </div>
              </div>
              
            </div>
            
            <Button
              onClick={handleCompleteRegistration}
              disabled={isCompleting}
              className="w-full"
              size="lg"
            >
              {isCompleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  處理中...
                </>
              ) : countdown !== null && countdown > 0 ? (
                <>
                  完成註冊 ({countdown})
                </>
              ) : (
                '完成註冊'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 付款失敗
  if (orderResult?.status === 'failed') {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-16 w-16 text-red-600" />
            </div>
            <CardTitle className="text-2xl">付款失敗</CardTitle>
            <CardDescription>
              很抱歉，您的付款未成功
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderResult.errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium">
                  錯誤原因：
                </p>
                <p className="text-sm text-red-800 mt-1">
                  {orderResult.errorMessage}
                </p>
                {orderResult.errorCode && (
                  <p className="text-xs text-red-600 mt-2">
                    錯誤代碼：{orderResult.errorCode}
                  </p>
                )}
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={handleRetryPayment}
                className="flex-1"
                size="lg"
              >
                重新付款
              </Button>
              <Button
                onClick={handleContactSupport}
                variant="outline"
                className="flex-1"
                size="lg"
              >
                聯繫客服
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // ✅ 處理中（Webhook 尚未收到回調）- 優化提示
  if (orderResult?.status === 'pending') {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Clock className="h-16 w-16 text-orange-600 animate-pulse" />
            </div>
            <CardTitle className="text-2xl">處理中</CardTitle>
            <CardDescription>
              您的付款正在處理中，請稍候...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-orange-800">
                訂單編號：<span className="font-mono">{orderResult.tradeNo}</span>
              </p>
              <p className="text-sm text-orange-800 mt-2">
                ⏳ 系統正在確認您的付款，通常需要 2-5 秒
              </p>
              <p className="text-xs text-orange-600 mt-2">
                已重試 {retryCount}/{maxRetries} 次
              </p>
            </div>
            
            <Button
              onClick={() => fetchOrderStatusWithRetry(0)}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重新查詢
            </Button>
            
            {/* ✅ 超時提示（重試超過 8 次）*/}
            {retryCount >= 8 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-800 font-medium">
                      查詢時間較長
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      付款可能仍在處理中，建議稍後再試或聯繫客服協助
                    </p>
                    <Button
                      onClick={handleContactSupport}
                      variant="link"
                      className="text-yellow-800 underline p-0 h-auto mt-2"
                    >
                      聯繫客服
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 未知状态
  return (
    <div className="container max-w-2xl mx-auto p-4 pt-20">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">查詢訂單失敗</CardTitle>
          <CardDescription>
            無法查詢到訂單資訊
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-800">
              訂單編號：{orderResult?.tradeNo || tradeNo || '未知'}
            </p>
          </div>
          
          <Button
            onClick={() => window.open('https://line.me/ti/p/@Uknow', '_blank')}
            className="w-full"
            size="lg"
          >
            聯絡官方客服
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}