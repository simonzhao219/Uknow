/**
 * Payment Step (Step 3)
 * 
 * Process annual fee payment and activate subscription
 * - Payment amount: NT$1,200
 * - Integration: Newebpay (藍新金流)
 * 
 * @component PaymentStep
 */

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Loader2, DollarSign, CheckCircle2, CreditCard, AlertCircle } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface PaymentStepProps {
  onComplete: () => void;
}

export function PaymentStep({ onComplete }: PaymentStepProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'atm' | null>(null);
  const [isGeneratingPayment, setIsGeneratingPayment] = useState(false);
  
  const { showToast, showSuccess } = useNotification();
  
  const ANNUAL_FEE = 1200;
  
  // Mock payment flow (Replace with actual Newebpay integration)
  const handlePayment = async () => {
    if (!paymentMethod) {
      showToast('請選擇付款方式', 'error');
      return;
    }
    
    setIsProcessing(true);
    setIsGeneratingPayment(true);
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      // TODO: Integrate with Newebpay API
      // For now, simulate payment process
      showToast('正在建立付款連結...', 'info');
      
      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock payment transaction ID
      const mockTransactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Complete Step 3
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          subscription: any;
          referralCode: string;
          message: string;
        };
        error?: { message: string };
      }>(buildApiUrl('/auth-v2/signup/step3'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          paymentTransactionId: mockTransactionId,
          referralCode: undefined  // This will be retrieved from Step 2 data
        })
      });
      
      setIsGeneratingPayment(false);
      
      if (result.success) {
        showSuccess(
          '註冊成功！',
          result.data.message,
          [
            `訂閱期限：${new Date(result.data.subscription.endDate).toLocaleDateString('zh-TW')}`,
            `您的推薦碼：${result.data.referralCode}`
          ]
        );
        
        // Wait a moment for user to see success message
        setTimeout(() => {
          onComplete();
        }, 2000);
      } else {
        showToast(result.error?.message || '付款處理失敗', 'error');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Payment error:', error);
      showToast('付款處理失敗，請稍後再試', 'error');
      setIsProcessing(false);
      setIsGeneratingPayment(false);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Payment Summary */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">年費方案</h3>
              <p className="text-sm text-muted-foreground">
                有效期限：一年（365天）
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">
                NT$ {ANNUAL_FEE.toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">
                每月平均 NT$ {(ANNUAL_FEE / 12).toFixed(0)}
              </p>
            </div>
          </div>
          
          <div className="border-t border-blue-200 pt-4 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>刊登服務資訊（一年有效期）</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>專屬推薦碼（推薦獎勵）</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>三代推薦獎勵（每月自動發放）</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>任務獎勵系統（連續推薦、推薦王）</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <span>點數提領功能（無手續費）</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Payment Methods */}
      <div className="space-y-3">
        <h3 className="font-semibold">選擇付款方式</h3>
        
        {/* Credit Card */}
        <button
          onClick={() => setPaymentMethod('credit')}
          disabled={isProcessing}
          className={`
            w-full p-4 border-2 rounded-lg text-left transition-all
            ${paymentMethod === 'credit' 
              ? 'border-blue-600 bg-blue-50' 
              : 'border-gray-200 hover:border-gray-300'
            }
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="flex items-center gap-3">
            <CreditCard className={`h-6 w-6 ${paymentMethod === 'credit' ? 'text-blue-600' : 'text-gray-400'}`} />
            <div className="flex-1">
              <div className="font-medium">信用卡</div>
              <div className="text-sm text-muted-foreground">
                支援 Visa、Mastercard、JCB
              </div>
            </div>
            {paymentMethod === 'credit' && (
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
            )}
          </div>
        </button>
        
        {/* ATM Transfer */}
        <button
          onClick={() => setPaymentMethod('atm')}
          disabled={isProcessing}
          className={`
            w-full p-4 border-2 rounded-lg text-left transition-all
            ${paymentMethod === 'atm' 
              ? 'border-blue-600 bg-blue-50' 
              : 'border-gray-200 hover:border-gray-300'
            }
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="flex items-center gap-3">
            <DollarSign className={`h-6 w-6 ${paymentMethod === 'atm' ? 'text-blue-600' : 'text-gray-400'}`} />
            <div className="flex-1">
              <div className="font-medium">ATM 轉帳</div>
              <div className="text-sm text-muted-foreground">
                取得虛擬帳號後轉帳
              </div>
            </div>
            {paymentMethod === 'atm' && (
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
            )}
          </div>
        </button>
      </div>
      
      {/* Info Box */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium mb-1">重要提醒</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>付款完成後，帳號將立即啟用</li>
              <li>年費期滿前 60 天會提醒您續費</li>
              <li>未續費將進入 60 天寬限期</li>
              <li>寬限期後帳號將永久失效，點數歸零</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Mock Payment Notice */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
          <div className="text-sm text-purple-900">
            <p className="font-medium mb-1">測試環境說明</p>
            <p>
              目前為測試環境，點擊「確認付款」將模擬付款流程並自動完成註冊。
              正式環境將整合藍新金流進行真實交易。
            </p>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="space-y-3">
        <Button
          onClick={handlePayment}
          disabled={!paymentMethod || isProcessing}
          className="w-full"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {isGeneratingPayment ? '正在建立付款連結...' : '處理中...'}
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-5 w-5" />
              確認付款 NT$ {ANNUAL_FEE.toLocaleString()}
            </>
          )}
        </Button>
        
        <p className="text-center text-sm text-muted-foreground">
          點擊「確認付款」即表示您同意我們的
          <button className="text-blue-600 hover:underline ml-1">服務條款</button>
          與
          <button className="text-blue-600 hover:underline ml-1">隱私政策</button>
        </p>
      </div>
    </div>
  );
}
