import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Loader2 } from 'lucide-react';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { useNotification } from './notifications/NotificationContext';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';  // ✅ 新增統一 API 請求工具

export function CompleteProfile() {
  const [formData, setFormData] = useState({
    name: '',
    nationalId: '',  // ✅ 新增身分證字號欄位
    phone: '',
    birthDate: '',
    referralCode: '',
    agreedToTerms: false,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [verifiedReferralCode, setVerifiedReferralCode] = useState('');
  const [referrerName, setReferrerName] = useState('');
  const hasConfirmedReferralCode = useRef(false);

  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const { showToast, showSuccess, showNotification } = useNotification();
  const supabase = createClient();

  // 檢查用戶是否已登入，並獲取 profile
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.log('CompleteProfile: No session found, redirecting to login');
          showToast('請先登入', 'error');
          navigate('/login', { replace: true });
          return;
        }
        
        // 嘗試加載現有的 profile
        const response = await fetch(
          buildApiUrl('/auth/profile'),
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        
        if (response.ok) {
          const profile = await response.json();
          console.log('CompleteProfile: Loaded profile:', profile);
          
          // 檢查是否已完成資料填寫
          const hasCompleteProfile = !!(profile.name && profile.phone && profile.birthDate);
          const hasPaidMembership = !!profile.referralCode;
          
          // ✅ 新增：檢查是否已完成註冊（registrationStep = 3）
          if (profile.registrationStep === 3 && profile.referralCode) {
            // 已完成註冊，導向會員中心
            console.log('CompleteProfile: User already completed registration (step 3), redirecting to dashboard');
            showToast('您已完成註冊，正在跳轉到會員中心...', 'info');
            setTimeout(() => {
              navigate('/dashboard', { replace: true });
            }, 1000);
            return;
          } else if (hasCompleteProfile && hasPaidMembership) {
            // 已完成註冊，導向會員中心
            console.log('CompleteProfile: User already completed registration, redirecting to dashboard');
            navigate('/dashboard', { replace: true });
          } else if (hasCompleteProfile && !hasPaidMembership) {
            // 已完成資料填寫但未付款，導向付款頁面
            console.log('CompleteProfile: User already completed profile, redirecting to payment');
            navigate('/payment/checkout', { replace: true });
          }
          // 如果未完成資料填寫，繼續留在此頁面
        }
      } catch (error) {
        console.error('CompleteProfile: Error checking profile:', error);
        // 發生錯誤時，允許用戶繼續填寫資料
      }
    };
    checkSession();
  }, [supabase, navigate, showToast]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    // 姓名驗證
    if (!formData.name.trim()) {
      newErrors.name = '請輸入真實姓名';
    } else if (formData.name.length > 10) {
      newErrors.name = '姓名最多 10 個字元';
    }

    // 身分證字號驗證
    if (!formData.nationalId.trim()) {
      newErrors.nationalId = '請輸入身分證字號';
    } else if (!/^[A-Z][12]\d{8}$/.test(formData.nationalId)) {
      newErrors.nationalId = '身分證字號格式不正確（格式：A123456789）';
    }

    // 手機號碼驗證
    if (!formData.phone.trim()) {
      newErrors.phone = '請輸入手機號碼';
    } else if (!/^09\d{8}$/.test(formData.phone)) {
      newErrors.phone = '手機號碼格式不正確（格式：09XXXXXXXX）';
    }

    // 生日驗證
    if (!formData.birthDate) {
      newErrors.birthDate = '請選擇出生年月日';
    } else {
      const birthDate = new Date(formData.birthDate);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age < 18) {
        newErrors.birthDate = '註冊用戶需年滿 18 歲';
      }
    }

    // 服務條款驗證
    if (!formData.agreedToTerms) {
      newErrors.agreedToTerms = '請同意服務條款';
    }

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 驗證表單
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // 顯示第一個錯誤
      const firstError = Object.values(validationErrors)[0];
      showToast(firstError, 'error');
      return;
    }

    // ✅ 推薦碼確認警告（無論有沒有填推薦碼都要顯示）
    if (!hasConfirmedReferralCode.current) {
      // 準備警告訊息的詳細資訊
      const details: string[] = [];
      
      if (formData.referralCode.trim() && referrerName) {
        // 有填推薦碼：顯示推薦碼和推薦人
        details.push(`推薦碼：${formData.referralCode}`);
        details.push(`推薦人：${referrerName}`);
      } else {
        // 沒有填推薦碼：提示將沒有推薦人
        details.push('您未填寫推薦碼');
      }
      
      // 顯示警告卡片
      showNotification({
        type: 'warning',
        title: '重要提醒',
        message: '推薦碼註冊後將永久綁定，無法修改。請再次確認您的推薦碼資訊是否正確。',
        details,
        confirmText: '確認無誤，繼續',
        cancelText: '返回檢查',
        onConfirm: () => {
          // 設定已確認，然後重新觸發提交
          hasConfirmedReferralCode.current = true;
          // 使用 setTimeout 確保狀態更新後再提交
          setTimeout(() => {
            handleSubmit(e);
          }, 100);
        },
        onCancel: () => {
          // 什麼都不做，停留在當前頁面
          console.log('User cancelled referral code confirmation');
        }
      });
      return;
    }

    // ✅ 如果有輸入推薦碼，必須先驗證
    if (formData.referralCode.trim()) {
      // 檢查是否已驗證
      if (!codeVerified || formData.referralCode !== verifiedReferralCode) {
        showToast('請先驗證推薦碼', 'warning');
        setCodeError('請先驗證推薦碼');
        return;
      }
      
      // ✅ 即使已驗證，點擊下一步時再驗證一次（確保推薦碼仍然有效）
      setIsLoading(true);
      try {
        const result = await apiRequestJson<{ 
          valid: boolean;
          referrerName?: string;
          referrerUserId?: string;
          error?: { message: string };
        }>(
          buildApiUrl('/listings/verify-referral-code'),
          {
            method: 'POST',
            body: JSON.stringify({
              referralCode: formData.referralCode.toLowerCase().trim(),
              currentUserId: null
            }),
          }
        );

        if (!result.valid) {
          showToast(result.error?.message || '推薦碼無效，請重新驗證', 'error');
          setCodeError(result.error?.message || '推薦碼無效');
          setCodeVerified(false);
          setVerifiedReferralCode('');
          setReferrerName('');
          setIsLoading(false);
          return;
        }
        
        // 驗證成功，更新推薦人姓名（可能已變更）
        if (result.referrerName) {
          setReferrerName(result.referrerName);
        }
      } catch (err: any) {
        console.error('CompleteProfile: Re-verification error:', err);
        showToast(err.message || '推薦碼驗證失敗，請稍後再試', 'error');
        setCodeError(err.message || '推薦碼驗證失敗');
        setCodeVerified(false);
        setVerifiedReferralCode('');
        setReferrerName('');
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);

    try {
      console.log('CompleteProfile: Starting profile submission...');
      
      // 取得當前 session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('CompleteProfile: No session found');
        showToast('登入狀態已過期，請重新登入', 'error');
        navigate('/login');
        return;
      }

      console.log('CompleteProfile: Session found, submitting profile data...');

      // 呼叫後端儲存資料
      const response = await fetch(
        buildApiUrl('/auth/register'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: formData.name,
            nationalId: formData.nationalId,  // ✅ 新增身分證字號欄位
            phone: formData.phone,
            birthDate: formData.birthDate,
            referralCode: formData.referralCode,
          }),
        }
      );

      console.log('CompleteProfile: API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('CompleteProfile: API error:', errorData);
        throw new Error(errorData.error || '註冊失敗');
      }

      const profile = await response.json();
      console.log('CompleteProfile: Profile created successfully:', profile);

      // ✅ 1. 保存到 localStorage（給 PaymentCheckout 使用）
      // ✅ 手動加入推薦人姓名（前端已驗證時獲取）
      const pendingUserData = {
        ...profile,
        referrerName: referrerName || null  // 加入推薦人姓名
      };
      localStorage.setItem('pendingUser', JSON.stringify(pendingUserData));

      // ✅ 2. 設置 user 到 UserContext（讓 ProtectedRoute 通過）
      setUser(profile);
      localStorage.setItem('user', JSON.stringify(profile));

      // 顯示簡單提示（自動消失，不阻塞）
      showToast('基本資訊已儲存，請完成付款', 'success');

      // 導向付款頁面
      navigate('/payment/checkout', { replace: true });
    } catch (error: any) {
      console.error('CompleteProfile: Error completing profile:', error);
      showToast(error.message || '註冊失敗，請稍後再試', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaterSignup = async () => {
    try {
      console.log('CompleteProfile: User chose to sign up later, cleaning up...');
      
      // 1. 取得當前 session，用於呼叫後端刪除帳號
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // 2. 呼叫後端刪除未完成的用戶帳號
        try {
          console.log('CompleteProfile: Calling cancel-signup API...');
          const response = await fetch(
            buildApiUrl('/auth/cancel-signup'),
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
          
          if (response.ok) {
            console.log('CompleteProfile: Account deleted successfully');
          } else {
            console.error('CompleteProfile: Failed to delete account, status:', response.status);
          }
        } catch (error) {
          console.error('CompleteProfile: Error calling cancel-signup API:', error);
        }
      }
      
      // 3. 清除本地狀態（在登出前先清除，避免競態條件）
      setUser(null);
      localStorage.removeItem('user');
      
      // 4. 登出 Supabase session（確保完全登出）
      console.log('CompleteProfile: Signing out from Supabase...');
      await supabase.auth.signOut();
      
      // 5. 顯示提示訊息
      showToast('您可以稍後再完��註冊', 'info');
      
      // 6. 等待一小段時間確保 session 清除完成，然後導向首頁
      setTimeout(() => {
        console.log('CompleteProfile: Navigating to home page...');
        navigate('/', { replace: true });
      }, 100);
    } catch (error: any) {
      console.error('CompleteProfile: Error during cancellation:', error);
      
      // 即使發生錯誤，也要嘗試清除狀態並導航
      setUser(null);
      localStorage.removeItem('user');
      await supabase.auth.signOut();
      showToast('已取消註冊', 'info');
      navigate('/', { replace: true });
    }
  };

  const verifyReferralCode = async () => {
    if (!formData.referralCode.trim()) {
      setCodeError('請輸入推薦碼');
      return;
    }
    
    setIsVerifyingCode(true);
    setCodeError('');

    try {
      // ✅ 使用統一的 API 請求工具
      const result = await apiRequestJson<{ 
        valid: boolean;
        referrerName?: string;
        referrerUserId?: string;
        error?: { message: string };
      }>(
        buildApiUrl('/listings/verify-referral-code'),
        {
          method: 'POST',
          body: JSON.stringify({
            referralCode: formData.referralCode.toLowerCase().trim(),
            currentUserId: null  // ✅ 註冊流程中用戶還沒有完整的 profile，傳 null
          }),
        }
      );

      if (result.valid && result.referrerName) {
        setCodeVerified(true);
        setCodeError('');
        setVerifiedReferralCode(formData.referralCode);  // ✅ 儲存已驗證的推薦碼
        setReferrerName(result.referrerName);  // ✅ 儲存推薦人姓名
        showToast('推薦碼驗證成功', 'success');  // ✅ 只顯示簡單訊息
      } else {
        setCodeError(result.error?.message || '推薦碼無效');
        setCodeVerified(false);
        setVerifiedReferralCode('');
        setReferrerName('');
        showToast(result.error?.message || '推薦碼無效', 'error');
      }
    } catch (err: any) {
      console.error('CompleteProfile: Referral code verification error:', err);
      
      if (err instanceof ApiError && err.status === 401) {
        setCodeError('登入已過期，請重新登入');
        showToast('登入已過期，請重新登入', 'error');
      } else {
        setCodeError(err.message || '推薦碼驗證失敗，請稍後再試');
        showToast(err.message || '推薦碼驗證失敗', 'error');
      }
      setCodeVerified(false);
      setVerifiedReferralCode('');
      setReferrerName('');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const isFormValid = !Object.keys(validateForm()).length;

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">完善個人資料</CardTitle>
          <CardDescription>最後一步，請填寫您的基本資料</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 姓名 */}
            <div className="space-y-2">
              <Label htmlFor="name">姓名 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  if (e.target.value.length <= 10) {
                    setFormData({ ...formData, name: e.target.value });
                    setErrors({ ...errors, name: '' });
                  }
                }}
                placeholder="請輸入身分證上的姓名"
                maxLength={10}
                className={getInputErrorClass(!!errors.name)}
              />
              <div className="text-right text-sm text-muted-foreground">
                {formData.name.length}/10
              </div>
              <FieldError error={errors.name} />
            </div>

            {/* 身分證字號 */}
            <div className="space-y-2">
              <Label htmlFor="nationalId">身份證字號 *</Label>
              <Input
                id="nationalId"
                value={formData.nationalId}
                onChange={(e) => {
                  setFormData({ ...formData, nationalId: e.target.value });
                  setErrors({ ...errors, nationalId: '' });
                }}
                placeholder="A123456789"
                maxLength={10}
                className={getInputErrorClass(!!errors.nationalId)}
              />
              <FieldError error={errors.nationalId} />
              <p className="text-sm text-muted-foreground">
                身分證字號格式：A123456789
              </p>
            </div>

            {/* 生日 */}
            <div className="space-y-2">
              <Label htmlFor="birthDate">出生年月日 *</Label>
              <Input
                id="birthDate"
                type="date"
                value={formData.birthDate}
                max={(() => {
                  const today = new Date();
                  const eighteenYearsAgo = new Date(
                    today.getFullYear() - 18,
                    today.getMonth(),
                    today.getDate()
                  );
                  return eighteenYearsAgo.toISOString().split('T')[0];
                })()}
                onChange={(e) => {
                  setFormData({ ...formData, birthDate: e.target.value });
                  setErrors({ ...errors, birthDate: '' });
                }}
                className={getInputErrorClass(!!errors.birthDate)}
              />
              <FieldError error={errors.birthDate} />
              <p className="text-sm text-muted-foreground">
                註冊用戶需年滿 18 歲
              </p>
            </div>
            
            {/* 手機號碼 */}
            <div className="space-y-2">
              <Label htmlFor="phone">手機號碼 *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  setErrors({ ...errors, phone: '' });
                }}
                placeholder="09XXXXXXXX"
                maxLength={10}
                className={getInputErrorClass(!!errors.phone)}
              />
              <FieldError error={errors.phone} />
              <p className="text-sm text-muted-foreground">
                台灣手機號碼格式：09 開頭，共 10 位數
              </p>
            </div>

            {/* 推薦碼 */}
            <div className="space-y-2">
              <Label htmlFor="referralCode">推薦碼 (選填)</Label>
              <div className="flex gap-2">
                <Input
                  id="referralCode"
                  value={formData.referralCode}
                  onChange={(e) => {
                    const newCode = e.target.value.toLowerCase(); // ✅ 立即轉小寫
                    setFormData({ ...formData, referralCode: newCode });
                    setCodeError('');
                    
                    // ✅ 如果推薦碼改變，清除驗證狀態和確認狀態
                    if (newCode !== verifiedReferralCode) {
                      setCodeVerified(false);
                      setReferrerName('');
                      hasConfirmedReferralCode.current = false;
                    }
                  }}
                  placeholder="輸入推薦碼"
                  className={getInputErrorClass(!!codeError)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={verifyReferralCode}
                  disabled={isVerifyingCode || !formData.referralCode.trim() || (codeVerified && formData.referralCode === verifiedReferralCode)}
                  className="shrink-0"
                >
                  {isVerifyingCode ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      驗證中
                    </>
                  ) : (
                    '驗證'
                  )}
                </Button>
              </div>
              <FieldError error={codeError} />
              
              {/* ✅ 推薦人姓名顯示 */}
              {referrerName && (
                <p className="text-sm text-green-600">
                  推薦人：{referrerName}
                </p>
              )}
            </div>

            {/* 服務條款 */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="terms"
                  checked={formData.agreedToTerms}
                  onCheckedChange={(checked) => {
                    setFormData({ ...formData, agreedToTerms: checked as boolean });
                    setErrors({ ...errors, agreedToTerms: '' });
                  }}
                />
                <Label htmlFor="terms" className="text-sm cursor-pointer">
                  我已詳讀並同意 <Link to="/terms-of-service" className="text-primary underline" onClick={(e) => e.stopPropagation()}>服務條款</Link>
                </Label>
              </div>
              <FieldError error={errors.agreedToTerms} />
            </div>

            {/* 提交按鈕 */}
            <Button
              type="submit"
              className="w-full"
              disabled={!isFormValid || isLoading}
              onClick={handleSubmit}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  處理中...
                </>
              ) : (
                '下一步'
              )}
            </Button>

            {/* 稍後註冊按鈕 */}
            <Button
              type="button"
              variant="outline"
              className="w-full mt-2"
              onClick={handleLaterSignup}
            >
              稍後註冊
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}