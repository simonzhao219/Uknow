import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { UserContext } from '../App';
import { createClient } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { useNotification } from './notifications/NotificationContext';
import { getInputErrorClass, FieldError } from '../utils/formHelpers';

export function CompleteProfile() {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    birthDate: '',
    agreedToTerms: false,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);

  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const { showToast, showSuccess } = useNotification();
  const supabase = createClient();

  // 檢查是否有 session
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('請先完成 Email 驗證', 'error');
        navigate('/login', { replace: true });
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
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: formData.name,
            phone: formData.phone,
            birthDate: formData.birthDate,
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

      // 設定用戶狀態
      setUser(profile);
      localStorage.setItem('user', JSON.stringify(profile));

      // 顯示成功訊息
      showSuccess(
        '註冊成功！',
        '歡迎加入 Uknow',
        ['您的帳號已成功建立', '現在可以開始使用所有功能']
      );

      // 導向 dashboard
      navigate('/dashboard', { replace: true });
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
            `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/auth/cancel-signup`,
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
      showToast('您可以稍後再完成註冊', 'info');
      
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
              <Label htmlFor="name">真實姓名 * (最多10字)</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  if (e.target.value.length <= 10) {
                    setFormData({ ...formData, name: e.target.value });
                    setErrors({ ...errors, name: '' });
                  }
                }}
                placeholder="請輸入真實姓名"
                maxLength={10}
                className={getInputErrorClass(!!errors.name)}
              />
              <div className="text-right text-sm text-muted-foreground">
                {formData.name.length}/10
              </div>
              <FieldError error={errors.name} />
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
                  我已詳讀並同意 <span className="text-primary">服務條款</span> 和{' '}
                  <span className="text-primary">隱私政策</span>
                </Label>
              </div>
              <FieldError error={errors.agreedToTerms} />
            </div>

            {/* 提交按鈕 */}
            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading ||
                !formData.name.trim() ||
                !formData.phone.trim() ||
                !formData.birthDate ||
                !formData.agreedToTerms
              }
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 mr-2"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.928l3-2.647z"
                    />
                  </svg>
                  處理中...
                </>
              ) : (
                '完成註冊'
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