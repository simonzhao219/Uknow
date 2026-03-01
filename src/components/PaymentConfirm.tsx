import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';

/**
 * 付款確認頁面
 * 
 * 使用場景：
 * - registrationStep = 2（付款處理中）
 * - 但沒有 lastTradeNo（可能是用戶直接輸入 URL 或 session 丟失）
 * 
 * 功能：
 * - 「已完成付款」→ 導到 /payment/result 查詢付款狀態
 * - 「尚未付款」→ 重置 registrationStep = 1，回到 /payment/checkout
 */
export function PaymentConfirm() {
  const navigate = useNavigate();
  const { showToast } = useNotification();
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * 處理「尚未付款」按鈕點擊
   * 重置 registrationStep = 1，回到付款頁面
   */
  const handleNotPaid = async () => {
    try {
      setIsProcessing(true);
      console.log('PaymentConfirm: 用戶選擇「尚未付款」，重置到 Step 1...');

      const result = await apiRequestJson<{ success: boolean; profile: any }>(
        buildApiUrl('/auth/reset-to-payment'),
        {
          method: 'POST'
        }
      );

      if (result.success) {
        console.log('PaymentConfirm: ✅ 已重置到 Step 1');
        showToast('已返回付款頁面', 'info');
        navigate('/payment/checkout', { replace: true });
      } else {
        throw new Error('重置失敗');
      }
    } catch (err) {
      console.error('PaymentConfirm: 重置失敗:', err);
      showToast('操作失敗，請稍後再試', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * 處理「已完成付款」按鈕點擊
   * 導到 /payment/result 查詢付款狀態
   */
  const handlePaid = () => {
    console.log('PaymentConfirm: 用戶選擇「已完成付款」，導到結果頁...');
    navigate('/payment/result', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">
            確認付款狀態
          </CardTitle>
          <CardDescription className="text-center text-base">
            我們偵測到您正在進行付款流程
            <br />
            請選擇您目前的狀態
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* 已完成付款按鈕 */}
          <Button
            onClick={handlePaid}
            disabled={isProcessing}
            className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="mr-2 h-5 w-5" />
            已完成付款
          </Button>

          {/* 說明文字 */}
          <p className="text-sm text-center text-muted-foreground px-4">
            如果您已在統一金流完成付款，請點擊上方按鈕查詢付款結果
          </p>

          {/* 分隔線 */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-muted-foreground">或</span>
            </div>
          </div>

          {/* 尚未付款按鈕 */}
          <Button
            onClick={handleNotPaid}
            disabled={isProcessing}
            variant="outline"
            className="w-full h-14 text-lg border-2"
          >
            尚未付款
          </Button>

          {/* 說明文字 */}
          <p className="text-sm text-center text-muted-foreground px-4">
            如果您尚未完成付款或想重新付款，請點擊上方按鈕返回付款頁面
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
