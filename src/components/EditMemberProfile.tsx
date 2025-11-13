import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form@7.55.0';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Separator } from './ui/separator';
import { ArrowLeft, Save, User, Mail, Phone, ExternalLink } from 'lucide-react';
import { UserContext } from '../App';
import { toast } from 'sonner@2.0.3';

interface EditProfileForm {
  name: string;
  email: string;
  phone: string;
  loginServices: {
    google: boolean;
    line: boolean;
    instagram: boolean;
  };
}

export function EditMemberProfile() {
  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<EditProfileForm>({
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      loginServices: {
        google: user?.loginServices?.google || true,
        line: user?.loginServices?.line || false,
        instagram: user?.loginServices?.instagram || false,
      }
    }
  });

  const watchedServices = watch('loginServices');

  const onSubmit = async (data: EditProfileForm) => {
    setIsLoading(true);
    
    try {
      // 模擬 API 請求
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 確保至少選擇一個登入服務
      const hasService = Object.values(data.loginServices).some(service => service);
      if (!hasService) {
        toast.error('至少需要選擇一個登入服務');
        setIsLoading(false);
        return;
      }

      // 更新用戶資料
      const updatedUser = {
        ...user,
        name: data.name,
        email: data.email,
        phone: data.phone,
        loginServices: data.loginServices
      };

      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      toast.success('會員資訊已成功更新');
      navigate('/dashboard');
    } catch (error) {
      toast.error('更新失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleServiceToggle = (service: keyof EditProfileForm['loginServices'], checked: boolean) => {
    setValue(`loginServices.${service}`, checked);
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
              <Label htmlFor="name">姓名 *</Label>
              <Input
                id="name"
                {...register('name', { 
                  required: '請輸入姓名',
                  minLength: { value: 2, message: '姓名至少需要2個字元' }
                })}
                placeholder="請輸入您的姓名"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">電子郵件 *</Label>
              <Input
                id="email"
                type="email"
                {...register('email', { 
                  required: '請輸入電子郵件',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: '請輸入有效的電子郵件格式'
                  }
                })}
                placeholder="請輸入您的電子郵件"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
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
        <Card>
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
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="google"
                  checked={watchedServices.google}
                  onCheckedChange={(checked) => handleServiceToggle('google', checked as boolean)}
                />
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">G</span>
                  </div>
                  <Label htmlFor="google" className="font-normal">
                    Google 登入
                  </Label>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="line"
                  checked={watchedServices.line}
                  onCheckedChange={(checked) => handleServiceToggle('line', checked as boolean)}
                />
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-500 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">L</span>
                  </div>
                  <Label htmlFor="line" className="font-normal">
                    LINE 登入
                  </Label>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="instagram"
                  checked={watchedServices.instagram}
                  onCheckedChange={(checked) => handleServiceToggle('instagram', checked as boolean)}
                />
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">IG</span>
                  </div>
                  <Label htmlFor="instagram" className="font-normal">
                    Instagram 登入
                  </Label>
                </div>
              </div>
            </div>

            {!Object.values(watchedServices).some(service => service) && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md">
                <p className="text-sm">請至少選擇一個登入服務</p>
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
            disabled={isLoading}
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