/**
 * Email Check Step (Step 0)
 * 
 * Pre-validate email before account creation
 * 
 * @component EmailCheckStep
 */

import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2, Mail, CheckCircle2, XCircle } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';

interface EmailCheckStepProps {
  onComplete: (email: string) => void;
}

export function EmailCheckStep({ onComplete }: EmailCheckStepProps) {
  const [email, setEmail] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    checked: boolean;
    exists: boolean;
    message: string;
  } | null>(null);
  
  const { showToast } = useNotification();
  
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  const handleCheckEmail = async () => {
    // Validation
    if (!email) {
      showToast('請輸入 Email', 'error');
      return;
    }
    
    if (!validateEmail(email)) {
      showToast('請輸入有效的 Email 格式', 'error');
      return;
    }
    
    setIsChecking(true);
    setCheckResult(null);
    
    try {
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          exists: boolean;
          message: string;
        };
      }>(buildApiUrl('/auth-v2/check-email'), {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      
      if (result.success) {
        setCheckResult({
          checked: true,
          exists: result.data.exists,
          message: result.data.message
        });
        
        if (!result.data.exists) {
          showToast('此 Email 可以使用', 'success');
        } else {
          showToast('此 Email 已被註冊', 'error');
        }
      }
    } catch (error) {
      console.error('Email check error:', error);
      showToast('檢查失敗，請稍後再試', 'error');
    } finally {
      setIsChecking(false);
    }
  };
  
  const handleContinue = () => {
    if (checkResult && !checkResult.exists) {
      onComplete(email);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isChecking) {
      if (checkResult && !checkResult.exists) {
        handleContinue();
      } else {
        handleCheckEmail();
      }
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Email Input */}
      <div className="space-y-2">
        <Label htmlFor="email">Email 地址</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setCheckResult(null);  // Reset check result when email changes
            }}
            onKeyPress={handleKeyPress}
            className="pl-10"
            disabled={isChecking}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          我們會發送驗證信到此 Email
        </p>
      </div>
      
      {/* Check Result */}
      {checkResult && (
        <div
          className={`
            p-4 rounded-lg border flex items-start gap-3
            ${checkResult.exists ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}
          `}
        >
          {checkResult.exists ? (
            <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p
              className={`font-medium ${
                checkResult.exists ? 'text-red-900' : 'text-green-900'
              }`}
            >
              {checkResult.exists ? 'Email 已被使用' : 'Email 可以使用'}
            </p>
            <p
              className={`text-sm mt-1 ${
                checkResult.exists ? 'text-red-700' : 'text-green-700'
              }`}
            >
              {checkResult.message}
            </p>
          </div>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex gap-3">
        {!checkResult || checkResult.exists ? (
          <Button
            onClick={handleCheckEmail}
            disabled={isChecking || !email}
            className="flex-1"
          >
            {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            檢查 Email
          </Button>
        ) : (
          <Button
            onClick={handleContinue}
            className="flex-1"
          >
            繼續下一步
          </Button>
        )}
      </div>
    </div>
  );
}
