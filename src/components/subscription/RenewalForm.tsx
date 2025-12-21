/**
 * Renewal Form
 * 
 * Form for renewing subscription
 * Supports both continuation mode (Grace) and new subscription mode (Fail)
 * 
 * @component RenewalForm
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Loader2, CreditCard, DollarSign, CheckCircle2, RefreshCw } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface RenewalFormProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  accountStatus: 'Active' | 'Canceled' | 'Grace' | 'Fail';
}

export function RenewalForm({ open, onClose, onComplete, accountStatus }: RenewalFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'atm' | null>(null);
  
  const { showToast, showSuccess } = useNotification();
  
  const ANNUAL_FEE = 1200;
  const isGraceMode = accountStatus === 'Grace';
  const isFailMode = accountStatus === 'Fail';
  
  const handleRenewal = async () => {
    if (!paymentMethod) {
      showToast('請選擇付款方式', 'error');
      return;
    }
    
    setIsProcessing(true);
    
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
      const mockTransactionId = `RENEW_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          subscription: any;
          message: string;
          isRenewal: boolean;
        };
        error?: { message: string };
      }>(buildApiUrl('/subscriptions-v2/renew'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          paymentTransactionId: mockTransactionId
        })
      });
      
      if (result.success) {
        showSuccess(
          '續訂成功！',
          result.data.message,
          [
            `訂閱期限：${new Date(result.data.subscription.endDate).toLocaleDateString('zh-TW')}`,
            result.data.isRenewal ? '接續原訂閱期限' : '從今日開始計算'
          ]
        );
        
        setTimeout(() => {
          onComplete();
        }, 1500);
      } else {
        showToast(result.error?.message || '續訂失敗', 'error');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Renewal error:', error);
      showToast('續訂失敗，請稍後再試', 'error');
      setIsProcessing(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-600" />
            {isGraceMode && '補繳續訂'}
            {isFailMode && '重新訂閱'}
            {!isGraceMode && !isFailMode && '續訂年費'}
          </DialogTitle>
          <DialogDescription>
            {isGraceMode && '補繳年費後，訂閱期限將從原到期日開始延長一年'}
            {isFailMode && '重新訂閱後，將獲得新的推薦碼，訂閱期限從今日開始計算'}
            {!isGraceMode && !isFailMode && '續訂年費，訂閱期限將延長一年'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
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
                {isGraceMode && (
                  <div className="bg-blue-100 rounded-lg p-3">
                    <p className="text-sm text-blue-900 font-medium">
                      💡 補繳優惠：接續原訂閱期限
                    </p>
                    <p className="text-sm text-blue-800 mt-1">
                      付款後，訂閱將從您的原到期日開始延長一年，不會損失任何天數。
                    </p>
                  </div>
                )}
                
                {isFailMode && (
                  <div className="bg-orange-100 rounded-lg p-3">
                    <p className="text-sm text-orange-900 font-medium">
                      ⚠️ 重新訂閱說明
                    </p>
                    <p className="text-sm text-orange-800 mt-1">
                      您將獲得新的推薦碼。原有的推薦關係和獎勵歷史仍會保留，但點數已歸零。
                    </p>
                  </div>
                )}
                
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
          
          {/* Test Mode Notice */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-900 font-medium mb-1">測試環境說明</p>
            <p className="text-sm text-purple-800">
              目前為測試環境，點擊「確認付款」將模擬付款流程。正式環境將整合藍新金流進行真實交易。
            </p>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={isProcessing}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleRenewal}
              disabled={!paymentMethod || isProcessing}
              className="flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  處理中...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  確認付款 NT$ {ANNUAL_FEE.toLocaleString()}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
