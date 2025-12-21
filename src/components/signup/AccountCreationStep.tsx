/**
 * Account Creation Step (Step 1)
 * 
 * Set password and create Supabase Auth account
 * Sends verification email automatically
 * 
 * @component AccountCreationStep
 */

import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';

interface AccountCreationStepProps {
  email: string;
  onComplete: (userId: string, email: string) => void;
}

export function AccountCreationStep({ email, onComplete }: AccountCreationStepProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const { showToast } = useNotification();
  
  const validatePassword = (): boolean => {
    if (!password) {
      showToast('請輸入密碼', 'error');
      return false;
    }
    
    if (password.length < 6) {
      showToast('密碼長度至少需要 6 個字元', 'error');
      return false;
    }
    
    if (password !== confirmPassword) {
      showToast('兩次輸入的密碼不一致', 'error');
      return false;
    }
    
    return true;
  };
  
  const handleCreateAccount = async () => {
    if (!validatePassword()) return;
    
    setIsCreating(true);
    
    try {
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          userId: string;
          message: string;
          registrationProgress: {
            currentStep: number;
            totalSteps: number;
            nextStep: number;
            isComplete: boolean;
            progress: number;
          };
        };
        error?: { message: string };
      }>(buildApiUrl('/auth-v2/signup/step1'), {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      if (result.success) {
        showToast(result.data.message, 'success');
        onComplete(result.data.userId, email);
      } else {
        showToast(result.error?.message || '帳號建立失敗', 'error');
      }
    } catch (error) {
      console.error('Account creation error:', error);
      showToast('建立失敗，請稍後再試', 'error');
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCreating) {
      handleCreateAccount();
    }
  };
  
  // Password strength indicator
  const getPasswordStrength = (): { strength: number; label: string; color: string } => {
    if (!password) return { strength: 0, label: '', color: '' };
    
    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 1) return { strength: 20, label: '弱', color: 'bg-red-500' };
    if (strength <= 3) return { strength: 50, label: '中', color: 'bg-yellow-500' };
    return { strength: 100, label: '強', color: 'bg-green-500' };
  };
  
  const passwordStrength = getPasswordStrength();
  
  return (
    <div className="space-y-6">
      {/* Email Display */}
      <div className="space-y-2">
        <Label>Email 地址</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="email"
            value={email}
            disabled
            className="pl-10 bg-gray-50"
          />
        </div>
      </div>
      
      {/* Password Input */}
      <div className="space-y-2">
        <Label htmlFor="password">設定密碼</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="請輸入密碼（至少6個字元）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-10 pr-10"
            disabled={isCreating}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        
        {/* Password Strength */}
        {password && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${passwordStrength.color} transition-all duration-300`}
                  style={{ width: `${passwordStrength.strength}%` }}
                />
              </div>
              <span className="text-sm text-muted-foreground">
                {passwordStrength.label}
              </span>
            </div>
          </div>
        )}
      </div>
      
      {/* Confirm Password Input */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">確認密碼</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            placeholder="請再次輸入密碼"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-10 pr-10"
            disabled={isCreating}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        
        {/* Password Match Indicator */}
        {confirmPassword && (
          <p
            className={`text-sm ${
              password === confirmPassword ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {password === confirmPassword ? '✓ 密碼一致' : '✗ 密碼不一致'}
          </p>
        )}
      </div>
      
      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>📧 接下來：</strong>
          <br />
          建立帳號後，系統會發送驗證信到您的 Email（{email}），
          請查收郵件並點擊驗證連結以繼續註冊流程。
        </p>
      </div>
      
      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleCreateAccount}
          disabled={isCreating || !password || !confirmPassword}
          className="flex-1"
        >
          {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          建立帳號並發送驗證信
        </Button>
      </div>
    </div>
  );
}
