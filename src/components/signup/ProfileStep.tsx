/**
 * Profile Completion Step (Step 2)
 * 
 * Collect user personal information:
 * - Real name (SSOT)
 * - ID number
 * - Birth date
 * - Phone
 * - Referral code (optional)
 * 
 * @component ProfileStep
 */

import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2, User, CreditCard, Calendar, Phone, Gift, CheckCircle2, XCircle } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface ProfileStepProps {
  onComplete: () => void;
}

export function ProfileStep({ onComplete }: ProfileStepProps) {
  const [formData, setFormData] = useState({
    realName: '',
    idNumber: '',
    birthDate: '',
    phone: '',
    referralCode: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingReferralCode, setIsVerifyingReferralCode] = useState(false);
  const [referralCodeVerification, setReferralCodeVerification] = useState<{
    valid: boolean;
    referrerName: string;
    error?: string;
  } | null>(null);
  
  const { showToast } = useNotification();
  
  const validateIDNumber = (idNumber: string): boolean => {
    // Taiwan ID number format: 1 letter + 9 digits
    const idRegex = /^[A-Z][12]\d{8}$/;
    return idRegex.test(idNumber);
  };
  
  const validatePhone = (phone: string): boolean => {
    // Taiwan phone number format: 09xxxxxxxx
    const phoneRegex = /^09\d{8}$/;
    return phoneRegex.test(phone);
  };
  
  const handleVerifyReferralCode = async () => {
    if (!formData.referralCode) {
      setReferralCodeVerification(null);
      return;
    }
    
    setIsVerifyingReferralCode(true);
    
    try {
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          valid: boolean;
          referrerName: string;
          error?: string;
        };
      }>(buildApiUrl('/auth-v2/verify-referral-code'), {
        method: 'POST',
        body: JSON.stringify({ code: formData.referralCode })
      });
      
      if (result.success) {
        setReferralCodeVerification(result.data);
        
        if (result.data.valid) {
          showToast(`推薦人：${result.data.referrerName}`, 'success');
        } else {
          showToast(result.data.error || '推薦碼無效', 'error');
        }
      }
    } catch (error) {
      console.error('Referral code verification error:', error);
      showToast('驗證失敗，請稍後再試', 'error');
    } finally {
      setIsVerifyingReferralCode(false);
    }
  };
  
  const handleSubmit = async () => {
    // Validation
    if (!formData.realName) {
      showToast('請輸入真實姓名', 'error');
      return;
    }
    
    if (!formData.idNumber) {
      showToast('請輸入身分證字號', 'error');
      return;
    }
    
    if (!validateIDNumber(formData.idNumber)) {
      showToast('請輸入有效的身分證字號格式（例如：A123456789）', 'error');
      return;
    }
    
    if (!formData.birthDate) {
      showToast('請選擇出生日期', 'error');
      return;
    }
    
    // Check age >= 20
    const birthDate = new Date(formData.birthDate);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();
    
    const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
    
    if (actualAge < 20) {
      showToast('您必須年滿 20 歲才能註冊', 'error');
      return;
    }
    
    if (!formData.phone) {
      showToast('請輸入手機號碼', 'error');
      return;
    }
    
    if (!validatePhone(formData.phone)) {
      showToast('請輸入有效的手機號碼格式（例如：0912345678）', 'error');
      return;
    }
    
    // If referral code provided, must be verified
    if (formData.referralCode && !referralCodeVerification?.valid) {
      showToast('請先驗證推薦碼', 'error');
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
        data: {
          profile: any;
          registrationProgress: any;
        };
        error?: { message: string };
      }>(buildApiUrl('/auth-v2/signup/step2'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          realName: formData.realName,
          idNumber: formData.idNumber.toUpperCase(),
          birthDate: formData.birthDate,
          phone: formData.phone,
          referralCode: formData.referralCode || undefined
        })
      });
      
      if (result.success) {
        showToast('資料已儲存', 'success');
        onComplete();
      } else {
        showToast(result.error?.message || '儲存失敗', 'error');
      }
    } catch (error) {
      console.error('Profile submission error:', error);
      showToast('儲存失敗，請稍後再試', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter' && !isSubmitting) {
      if (field === 'referralCode') {
        handleVerifyReferralCode();
      } else {
        handleSubmit();
      }
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Real Name */}
      <div className="space-y-2">
        <Label htmlFor="realName">真實姓名 *</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="realName"
            type="text"
            placeholder="請輸入身分證上的姓名"
            value={formData.realName}
            onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
            onKeyPress={(e) => handleKeyPress(e, 'realName')}
            className="pl-10"
            disabled={isSubmitting}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          用於提領獎勵時的身分驗證
        </p>
      </div>
      
      {/* ID Number */}
      <div className="space-y-2">
        <Label htmlFor="idNumber">身分證字號 *</Label>
        <div className="relative">
          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="idNumber"
            type="text"
            placeholder="A123456789"
            value={formData.idNumber}
            onChange={(e) => setFormData({ ...formData, idNumber: e.target.value.toUpperCase() })}
            onKeyPress={(e) => handleKeyPress(e, 'idNumber')}
            className="pl-10"
            maxLength={10}
            disabled={isSubmitting}
          />
        </div>
      </div>
      
      {/* Birth Date */}
      <div className="space-y-2">
        <Label htmlFor="birthDate">出生日期 *</Label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
            className="pl-10"
            max={new Date().toISOString().split('T')[0]}
            disabled={isSubmitting}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          必須年滿 20 歲
        </p>
      </div>
      
      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone">手機號碼 *</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="phone"
            type="tel"
            placeholder="0912345678"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            onKeyPress={(e) => handleKeyPress(e, 'phone')}
            className="pl-10"
            maxLength={10}
            disabled={isSubmitting}
          />
        </div>
      </div>
      
      {/* Referral Code (Optional) */}
      <div className="space-y-2">
        <Label htmlFor="referralCode">推薦碼（選填）</Label>
        <div className="relative">
          <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="referralCode"
            type="text"
            placeholder="abc123456"
            value={formData.referralCode}
            onChange={(e) => {
              setFormData({ ...formData, referralCode: e.target.value.toLowerCase() });
              setReferralCodeVerification(null);
            }}
            onKeyPress={(e) => handleKeyPress(e, 'referralCode')}
            onBlur={handleVerifyReferralCode}
            className="pl-10"
            maxLength={9}
            disabled={isSubmitting || isVerifyingReferralCode}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          格式：3個小寫英文字 + 6個數字
        </p>
        
        {/* Referral Code Verification Result */}
        {isVerifyingReferralCode && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>驗證中...</span>
          </div>
        )}
        
        {referralCodeVerification && !isVerifyingReferralCode && (
          <div
            className={`
              p-3 rounded-lg border flex items-start gap-2 text-sm
              ${referralCodeVerification.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}
            `}
          >
            {referralCodeVerification.valid ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-900">推薦碼有效</p>
                  <p className="text-green-700">推薦人：{referralCodeVerification.referrerName}</p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">推薦碼無效</p>
                  <p className="text-red-700">{referralCodeVerification.error}</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>💡 為什麼需要這些資料？</strong>
          <br />
          • 真實姓名與身分證字號：用於點數提領時的身分驗證
          <br />
          • 出生日期：確認年齡資格（需年滿 20 歲）
          <br />
          • 手機號碼：帳號安全與重要通知
          <br />
          • 推薦碼：填寫後您與推薦人都能獲得獎勵
        </p>
      </div>
      
      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          儲存並繼續
        </Button>
      </div>
    </div>
  );
}
