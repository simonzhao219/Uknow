import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Loader2, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';

type OrderStatus = 'pending' | 'success' | 'failed' | 'unknown';

interface OrderResult {
  status: OrderStatus;
  tradeNo: string;
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
  
  // 查询订单状态
  const fetchOrderStatus = async () => {
    if (!tradeNo) {
      showToast('缺少訂單編號', 'error');
      navigate('/payment/checkout');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const result = await apiRequestJson<{
        success: boolean;
        order: {
          status: OrderStatus;
          tradeNo: string;
          errorMessage?: string;
          errorCode?: string;
        };
      }>(buildApiUrl(`/payuni/result/${tradeNo}`));
      
      if (result.success) {
        setOrderResult(result.order);
      } else {
        setOrderResult({ status: 'unknown', tradeNo });
      }
    } catch (error: any) {
      console.error('查詢訂單狀態失敗:', error);
      showToast('查詢訂單狀態失敗', 'error');
      setOrderResult({ status: 'unknown', tradeNo });
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchOrderStatus();
  }, [tradeNo]);
  
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
    // TODO: 替換為實際的客服聯繫方式
    showToast('客服功能開發中，請稍後再試', 'info');
    // 未來可以導向客服頁面或開啟 Line/WhatsApp
    // window.open('https://line.me/ti/p/YOUR_LINE_ID', '_blank');
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
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                訂單編號：{orderResult.tradeNo}
              </p>
              <p className="text-sm text-green-800 mt-1">
                付款金額：$1,200
              </p>
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
            
            <p className="text-xs text-center text-muted-foreground">
              點擊「完成註冊」後，系統將為您生成推薦碼並激活帳號
            </p>
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
          <Button
            onClick={() => navigate('/payment/checkout')}
            className="w-full"
            size="lg"
          >
            返回付款頁面
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}