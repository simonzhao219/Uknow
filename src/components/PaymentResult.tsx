import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw, CreditCard } from 'lucide-react';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';

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
  
  const tradeNo = searchParams.get('tradeNo');
  
  // ⚠️ 添加组件挂载日志
  console.log('[PaymentResult] 🎬 Component rendering', {
    tradeNo,
    isLoading,
    orderResult,
    searchParamsAll: Object.fromEntries(searchParams.entries())
  });
  
  // 查询订单状态
  const fetchOrderStatus = async () => {
    console.log('[PaymentResult] 📞 fetchOrderStatus called', { tradeNo });
    
    if (!tradeNo) {
      console.error('[PaymentResult] ❌ No tradeNo, cannot fetch');
      setIsLoading(false);
      setOrderResult({ status: 'unknown', tradeNo: '' });
      showToast('缺少訂單編號', 'error');
      return;
    }
    
    console.log('[PaymentResult] 🔄 Setting isLoading = true');
    setIsLoading(true);
    
    const apiUrl = buildApiUrl(`/payuni/result/${tradeNo}`);
    console.log('[PaymentResult] 🌐 API URL:', apiUrl);
    
    try {
      console.log('[PaymentResult] 🚀 Sending API request...');
      
      const result = await apiRequestJson<{
        success: boolean;
        data: {  // ✅ 修正：后端返回的是 "data" 不是 "order"
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
      } else {
        console.log('[PaymentResult] ⚠️ API returned success=false');
        setOrderResult({ status: 'unknown', tradeNo });
      }
    } catch (error: any) {
      console.error('[PaymentResult] 💥 API request failed:', error);
      console.error('[PaymentResult] Error type:', error.constructor.name);
      console.error('[PaymentResult] Error message:', error.message);
      console.error('[PaymentResult] Error stack:', error.stack);
      
      showToast('查詢訂單狀態失敗', 'error');
      setOrderResult({ status: 'unknown', tradeNo });
    } finally {
      console.log('[PaymentResult] 🏁 Setting isLoading = false');
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    console.log('[PaymentResult] ⚡ useEffect triggered', { tradeNo });
    
    if (tradeNo) {
      fetchOrderStatus();
    } else {
      console.log('[PaymentResult] ⏸️ No tradeNo, waiting...');
    }
  }, [tradeNo]);
  
  useEffect(() => {
    console.log('[PaymentResult] 🎬 Component mounted');
    return () => {
      console.log('[PaymentResult] 🔚 Component unmounting');
    };
  }, []);
  
  console.log('[PaymentResult] 🎨 Rendering UI', { isLoading, orderResult });
  
  // 完成注册
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
  
  // 加载中
  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg">查詢付款結果中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 付款成功
  if (orderResult?.status === 'success') {
    // 🐛 调试日志：检查 orderResult 和 paymentData
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
              
              {/* 訂單資訊區 */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">訂單編號</span>
                  <span className="text-sm text-gray-900 font-mono">{orderResult.periodTradeNo || orderResult.tradeNo}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">付款金額</span>
                  <span className="text-lg text-green-600 font-bold">NT$ {paymentData?.AuthAmt || '1,200'}</span>
                </div>
              </div>
              
              {/* 付款人與信用卡資訊 */}
              {paymentData && (
                <>
                  <div className="border-t border-green-200 pt-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">付款人</span>
                      <span className="text-sm text-gray-900 font-medium">{paymentData.PayerName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">聯絡電話</span>
                      <span className="text-sm text-gray-900">{paymentData.PayerPhone}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Email</span>
                      <span className="text-sm text-gray-900 break-all">{paymentData.PayerEmail}</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-green-200 pt-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">信用卡銀行</span>
                      <span className="text-sm text-gray-900 font-medium">{paymentData.AuthBankName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">卡號</span>
                      <span className="text-sm text-gray-900 font-mono">
                        {paymentData.Card6No} ****** {paymentData.Card4No}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">到期日</span>
                      <span className="text-sm text-gray-900">{formatCardExpiry(paymentData.CardExpired)}</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-green-200 pt-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">訂閱方案</span>
                      <span className="text-sm text-gray-900 font-medium">年費會員</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">年費金額</span>
                      <span className="text-sm text-gray-900 font-bold">NT$ {paymentData.PeriodAmt} / 年</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">下期扣款日</span>
                      <span className="text-sm text-gray-900">{getNextPaymentDate(paymentData.DateList)}</span>
                    </div>
                  </div>
                </>
              )}
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
              ) : (
                '完成註冊'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 付款失败
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
  
  // 处理中（Webhook 还没收到回调）
  if (orderResult?.status === 'pending') {
    return (
      <div className="container max-w-2xl mx-auto p-4 pt-20">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Clock className="h-16 w-16 text-orange-600" />
            </div>
            <CardTitle className="text-2xl">處理中</CardTitle>
            <CardDescription>
              您的付款正在處理中，請稍候...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-orange-800">
                訂單編號：{orderResult.tradeNo}
              </p>
              <p className="text-sm text-orange-800 mt-2">
                ⏳ 系統正在確認您的付款，通常需要 1-3 分鐘
              </p>
            </div>
            
            <Button
              onClick={fetchOrderStatus}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重新查詢
            </Button>
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