import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form@7.55.0';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { ArrowLeft, Save, User, Mail, Phone, ExternalLink, Link2, Unlink, CheckCircle2, Loader2 } from 'lucide-react';
import { UserContext } from '../App';
import { mockUsers } from '../data/mockUsers';
import { useNotification } from './notifications/NotificationContext';
import { apiRequest, buildApiUrl, ApiError } from '../utils/apiClient';

interface EditProfileForm {
  name: string;
  email: string;
  phone: string;
  loginServices: {
    google: boolean;
    facebook: boolean;
  };
}

export function EditMemberProfile() {
  const { showToast, showSuccess, showError } = useNotification();
  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  
  // 驗證狀態
  const [emailVerified, setEmailVerified] = useState(true); // 預設已驗證（原始 Email）
  const [phoneVerified, setPhoneVerified] = useState(true); // 預設已驗證（原始手機）
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<EditProfileForm>({
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      loginServices: {
        google: user?.loginServices?.google || (user?.loginMethod === 'google'),
        facebook: user?.loginServices?.facebook || (user?.loginMethod === 'facebook'),
      }
    }
  });

  const watchedServices = watch('loginServices');
  const watchedEmail = watch('email');
  const watchedPhone = watch('phone');

  // 監聽 Email 變更，自動重置驗證狀態
  useEffect(() => {
    if (watchedEmail !== user?.email) {
      setEmailVerified(false);
    } else {
      setEmailVerified(true);
    }
  }, [watchedEmail, user?.email]);

  // 監聽手機號碼變更，自動重置驗證狀態
  useEffect(() => {
    if (watchedPhone !== user?.phone) {
      setPhoneVerified(false);
    } else {
      setPhoneVerified(true);
    }
  }, [watchedPhone, user?.phone]);

  // Email 驗證函數
  const handleVerifyEmail = async () => {
    const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (!emailPattern.test(watchedEmail)) {
      showToast('請輸入有效</ emailAddress格式', 'error');
      return;
    }

    setIsVerifyingEmail(true);
    
    try {
      // 模擬 API 請求
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // TODO: 未來整合 Supabase 時，需要調用 API 檢查 Email 是否已被使用
      // const { data, error } = await supabase
      //   .from('users')
      //   .select('email')
      //   .eq('email', watchedEmail)
      //   .neq('id', user?.id)
      //   .single();
      
      // 檢查是否已被其他帳號使用（排除自己）
      const isEmailTaken = mockUsers.some(
        u => u.email === watchedEmail && u.id !== user?.id
      );
      
      if (isEmailTaken) {
        showToast('此電子郵件已被使用', 'error');
        setEmailVerified(false);
      } else {
        showToast('電子郵件驗證成功', 'success');
        setEmailVerified(true);
      }
    } catch (error) {
      showToast('驗證失敗，請稍後再試', 'error');
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  // 手機號碼驗證函數
  const handleVerifyPhone = async () => {
    const phonePattern = /^09\d{8}$/;
    if (!phonePattern.test(watchedPhone)) {
      showToast('請輸入有效的手機號碼格式 (09xxxxxxxx)', 'error');
      return;
    }

    setIsVerifyingPhone(true);
    
    try {
      // 模擬 API 請求
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // TODO: 未來整合 Supabase 時，需要調用 API 檢查手機號碼否已被使用
      // const { data, error } = await supabase
      //   .from('users')
      //   .select('phone')
      //   .eq('phone', watchedPhone)
      //   .neq('id', user?.id)
      //   .single();
      
      // 檢查是否已被其他帳號使用（排除自己）
      const isPhoneTaken = mockUsers.some(
        u => u.phone === watchedPhone && u.id !== user?.id
      );
      
      if (isPhoneTaken) {
        showToast('此手機號碼已被使用', 'error');
        setPhoneVerified(false);
      } else {
        showToast('手機號碼驗證成功', 'success');
        setPhoneVerified(true);
      }
    } catch (error) {
      showToast('驗證失敗，請稍後再試', 'error');
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  const onSubmit = async (data: EditProfileForm) => {
    setIsLoading(true);
    
    try {
      // ✅ 使用统一的 API 请求工具
      const response = await apiRequest(buildApiUrl('/auth/profile'), {
        method: 'PUT',
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('更新會員資料失敗:', result);
        showError(
          '更新失敗',
          result.error || '無法更新您的會員資訊，請稍後再試',
          ['請檢查網路連線狀態', '若問題持續發生，請聯絡客服']
        );
        return;
      }

      console.log('會員資料更新成功:', result);

      // 更新本地狀態和 localStorage
      setUser(result);
      localStorage.setItem('user', JSON.stringify(result));
      
      showSuccess(
        '會員資訊已成功更新',
        '您的個人資料已經更新完成',
        ['系統將自動返回會員中心']
      );
      
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error) {
      console.error('更新會員資料時發生錯誤:', error);
      
      if (error instanceof ApiError && error.status === 401) {
        showError('會話已過期', '請重新登入後再試');
        navigate('/login');
      } else {
        showError(
          '更新失敗',
          '無法更新您的會員資訊，請稍後再試',
          ['請檢查網路連線狀態', '若問題持續發生，請聯絡客服']
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleServiceToggle = (service: keyof EditProfileForm['loginServices'], checked: boolean) => {
    // 檢查如果���解除綁定，確保至少保留一個登入方式
    if (!checked) {
      const otherServices = Object.entries(watchedServices)
        .filter(([key]) => key !== service)
        .some(([, value]) => value);
      
      if (!otherServices) {
        showToast('至少需要保留一個登入方式', 'error');
        return;
      }
    }
    
    // TODO: 未來整合 Supabase 時，需要調用 Supabase Auth API 來綁定/解除綁定社群登入
    // 綁定範例: await supabase.auth.linkIdentity({ provider: 'google' })
    // 解除綁定範例: await supabase.auth.unlinkIdentity({ provider: 'google' })
    
    setValue(`loginServices.${service}`, checked);
    
    const serviceName = service === 'google' ? 'Google' : 'Facebook';
    if (checked) {
      showToast(`已成功綁定 ${serviceName} 登入`, 'success');
    } else {
      showToast(`已成功解除 ${serviceName} 登入綁定`, 'success');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard')}
          className="p-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">編輯會員資訊</h1>
          <p className="text-muted-foreground">更新您的個人資料和登入設定</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 基本資訊 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              基本資訊
            </CardTitle>
            <CardDescription>
              更新您的姓名、電子郵件和聯絡電話
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">身分證上的姓名 * (申請點數提領需驗證)</Label>
              <Input
                id="name"
                {...register('name', { 
                  required: '請輸入您身分證上的姓名',
                  minLength: { value: 2, message: '姓名至少需要2個字元' },
                  maxLength: { value: 10, message: '姓名最多10個字' }
                })}
                placeholder="請輸入您身分證上的姓名"
                maxLength={10}
              />
              <div className="text-right text-sm text-muted-foreground">
                {watch('name')?.length || 0}/10
              </div>
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2 hidden">
              <Label htmlFor="email">電子郵件 *</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                disabled
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-sm text-muted-foreground">電子郵件無法修改</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">聯絡電話 *</Label>
              <Input
                id="phone"
                {...register('phone', { 
                  required: '請輸入聯絡電話',
                  pattern: {
                    value: /^09\d{8}$/,
                    message: '請輸入有效的手機號碼格式 (09xxxxxxxx)'
                  }
                })}
                placeholder="09xxxxxxxx"
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 登入服務設定 */}
        <Card className="hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              登入服務設定
            </CardTitle>
            <CardDescription>
              選擇您要使用的登入方式（至少選擇一個）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {/* Google 登入 */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Google</p>
                    <p className="text-sm text-muted-foreground">
                      {watchedServices.google ? '已綁定' : '未綁定'}
                    </p>
                  </div>
                </div>
                {watchedServices.google ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleServiceToggle('google', false)}
                    className="gap-1"
                  >
                    <Unlink className="h-4 w-4" />
                    解除定
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleServiceToggle('google', true)}
                    className="gap-1"
                  >
                    <Link2 className="h-4 w-4" />
                    綁定
                  </Button>
                )}
              </div>

              {/* Facebook 登入 */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Facebook</p>
                    <p className="text-sm text-muted-foreground">
                      {watchedServices.facebook ? '已綁定' : '未綁定'}
                    </p>
                  </div>
                </div>
                {watchedServices.facebook ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleServiceToggle('facebook', false)}
                    className="gap-1"
                  >
                    <Unlink className="h-4 w-4" />
                    解除綁定
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleServiceToggle('facebook', true)}
                    className="gap-1"
                  >
                    <Link2 className="h-4 w-4" />
                    綁定
                  </Button>
                )}
              </div>
            </div>

            {!Object.values(watchedServices).some(service => service) && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md">
                <p className="text-sm">請至少保留一個登入方式</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 操作按鈕 */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/dashboard')}
            disabled={isLoading}
            className="flex-1"
          >
            取消
          </Button>
          <Button
            type="submit"
            disabled={isLoading || !watch('name')?.trim() || !watch('phone')?.trim()}
            className="flex-1"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                更新中...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                儲存變更
              </div>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}