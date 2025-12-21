/**
 * Withdrawal Form Component
 * 
 * Form for requesting point withdrawal
 * - Minimum: 1,000 points (multiples of 1,000)
 * - Fee: 30 points (additional to withdrawal amount)
 * - Status restrictions: Active/Canceled only
 * 
 * @component WithdrawalForm
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl, ApiError } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface BankAccount {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

interface WithdrawalFormProps {
  currentBalance: number;
  accountStatus: string;
  onSuccess: () => void;
}

const WITHDRAWAL_MIN_AMOUNT = 1000;
const WITHDRAWAL_FEE = 30;
const WITHDRAWAL_MULTIPLE = 1000;

export function WithdrawalForm({
  currentBalance,
  accountStatus,
  onSuccess
}: WithdrawalFormProps) {
  const [amount, setAmount] = useState('');
  const [bankAccount, setBankAccount] = useState<BankAccount>({
    bankCode: '',
    bankName: '',
    accountNumber: '',
    accountName: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  const { showToast, showSuccess, showError } = useNotification();
  
  // Calculate total deduction
  const amountNumber = parseInt(amount) || 0;
  const totalDeduction = amountNumber + WITHDRAWAL_FEE;
  const remainingBalance = currentBalance - totalDeduction;
  
  // Validate amount in real-time
  const validateAmount = (value: string) => {
    const errors: string[] = [];
    const num = parseInt(value);
    
    if (!value || isNaN(num)) {
      return errors;
    }
    
    if (num < WITHDRAWAL_MIN_AMOUNT) {
      errors.push(`最低提領金額為 ${WITHDRAWAL_MIN_AMOUNT} 點`);
    }
    
    if (num % WITHDRAWAL_MULTIPLE !== 0) {
      errors.push(`提領金額必須為 ${WITHDRAWAL_MULTIPLE} 的倍數`);
    }
    
    if (accountStatus === 'Grace' || accountStatus === 'Fail') {
      errors.push(`帳號狀態為 ${accountStatus}，無法提領`);
    }
    
    const total = num + WITHDRAWAL_FEE;
    if (currentBalance < total) {
      errors.push(`點數不足（需要 ${total} 點，目前 ${currentBalance} 點）`);
    }
    
    return errors;
  };
  
  const handleAmountChange = (value: string) => {
    setAmount(value);
    const errors = validateAmount(value);
    setValidationErrors(errors);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final validation
    const errors = validateAmount(amount);
    if (errors.length > 0) {
      showToast(errors[0], 'error');
      return;
    }
    
    // Validate bank account
    if (!bankAccount.bankCode || !bankAccount.accountNumber) {
      showToast('請填寫完整的銀行帳戶資訊', 'error');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      const result = await apiRequestJson<{
        success: boolean;
        data?: {
          withdrawal: any;
          message: string;
        };
        error?: { message: string };
      }>(buildApiUrl('/withdrawals-v2/request'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amountNumber,
          bankAccount
        })
      });
      
      if (result.success && result.data) {
        showSuccess(
          '提領申請成功',
          result.data.message,
          [
            `提領金額：${amountNumber} 點`,
            `手續費：${WITHDRAWAL_FEE} 點`,
            `總扣除：${totalDeduction} 點`
          ]
        );
        
        // Reset form
        setAmount('');
        setBankAccount({
          bankCode: '',
          bankName: '',
          accountNumber: '',
          accountName: ''
        });
        
        // Notify parent
        onSuccess();
      } else {
        showError(
          '提領申請失敗',
          result.error?.message || '請稍後再試'
        );
      }
    } catch (error) {
      console.error('Withdrawal request error:', error);
      
      if (error instanceof ApiError) {
        showError('提領申請失敗', error.message);
      } else {
        showError('提領申請失敗', '系統錯誤，請稍後再試');
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const canSubmit = 
    amountNumber >= WITHDRAWAL_MIN_AMOUNT &&
    validationErrors.length === 0 &&
    bankAccount.bankCode &&
    bankAccount.accountNumber &&
    !isSubmitting;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>申請提領</CardTitle>
        <CardDescription>
          最低提領金額為 1,000 點，必須為 1,000 的倍數
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">提領金額（點）</Label>
            <Input
              id="amount"
              type="number"
              min={WITHDRAWAL_MIN_AMOUNT}
              step={WITHDRAWAL_MULTIPLE}
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="請輸入提領金額（1000 的倍數）"
              disabled={isSubmitting}
            />
            
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="space-y-1">
                {validationErrors.map((error, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Amount Summary */}
            {amountNumber > 0 && validationErrors.length === 0 && (
              <div className="p-3 bg-blue-50 rounded-lg space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">提領金額：</span>
                  <span className="font-medium">{amountNumber} 點</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">手續費：</span>
                  <span className="font-medium">{WITHDRAWAL_FEE} 點</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="font-medium">總扣除：</span>
                  <span className="font-bold text-blue-600">{totalDeduction} 點</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">剩餘點數：</span>
                  <span className={remainingBalance >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {remainingBalance} 點
                  </span>
                </div>
              </div>
            )}
          </div>
          
          {/* Bank Account Info */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-medium">銀行帳戶資訊</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankCode">銀行代碼</Label>
                <Input
                  id="bankCode"
                  value={bankAccount.bankCode}
                  onChange={(e) => setBankAccount({ ...bankAccount, bankCode: e.target.value })}
                  placeholder="例如：822（中國信託）"
                  disabled={isSubmitting}
                  maxLength={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="bankName">銀行名稱（選填）</Label>
                <Input
                  id="bankName"
                  value={bankAccount.bankName}
                  onChange={(e) => setBankAccount({ ...bankAccount, bankName: e.target.value })}
                  placeholder="例如：中國信託商業銀行"
                  disabled={isSubmitting}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="accountNumber">銀行帳號</Label>
              <Input
                id="accountNumber"
                value={bankAccount.accountNumber}
                onChange={(e) => setBankAccount({ ...bankAccount, accountNumber: e.target.value })}
                placeholder="請輸入完整帳號"
                disabled={isSubmitting}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="accountName">戶名（選填）</Label>
              <Input
                id="accountName"
                value={bankAccount.accountName}
                onChange={(e) => setBankAccount({ ...bankAccount, accountName: e.target.value })}
                placeholder="預設為會員姓名"
                disabled={isSubmitting}
              />
            </div>
          </div>
          
          {/* Info Notice */}
          <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg text-sm">
            <Info className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
            <div className="text-yellow-800">
              <p className="font-medium mb-1">注意事項：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>提領申請提交後，我們會在 3-5 個工作天內處理</li>
                <li>請確認銀行帳戶資訊正確，錯誤資訊可能導致提領失敗</li>
                <li>手續費為 30 點，將額外從點數餘額扣除</li>
              </ul>
            </div>
          </div>
          
          {/* Submit Button */}
          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              '提交提領申請'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
