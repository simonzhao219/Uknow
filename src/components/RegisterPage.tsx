import React, { useState, useContext, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";
import { Alert, AlertDescription } from "./ui/alert";
import { Checkbox } from "./ui/checkbox";
import { UserContext } from "../App";
import { mockUsers } from "../data/mockUsers";
import { CheckCircle2 } from "lucide-react";
import { getInputErrorClass, FieldError } from "../utils/formHelpers";
import { useNotification } from "./notifications/NotificationContext";

export function RegisterPage() {
  const { showToast, showSuccess } = useNotification();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    idNumber: "",
    bankAccount: "",
    birthDate: "",
    lineId: "",
    loginMethod: "",
    agreedToTerms: false,
  });
  const [errors, setErrors] = useState<{
    [key: string]: string;
  }>({});
  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [emailVerified, setEmailVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [socialEmail, setSocialEmail] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);

  // 檢查用戶是否已登入，如果已登入則跳轉到 dashboard
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSocialRegister = (provider: string) => {
    // 模擬社群註冊
    const newUser = {
      id: `user_${Date.now()}`,
      name: "測試用戶",
      email: "test@example.com",
      phone: "0912345678",
      idNumber: "A123456789",
      bankAccount: "123-456-789-012",
      birthDate: "1990-01-01",
      lineId: "",
      loginMethod: provider,
      isAdmin: false,
      referralCode: `REF${Date.now()}`,
      referrer: null,
      totalRewards: 0,
      availableRewards: 0,
    };

    setUser(newUser);
    localStorage.setItem("user", JSON.stringify(newUser));
    navigate("/fillinfo");
  };

  const handleNext = (provider: "google" | "facebook") => {
    if (currentStep === 1) {
      setSelectedProvider(provider);

      // 模擬從社群平台獲取 email
      const mockSocialEmail =
        provider === "google"
          ? `user${Date.now()}@gmail.com`
          : `user${Date.now()}@facebook.com`;

      setSocialEmail(mockSocialEmail);
      setFormData({
        ...formData,
        email: mockSocialEmail,
        loginMethod: provider,
      });

      setCurrentStep(2);
    }
  };

  const handleVerifyEmail = async () => {
    // 清除之前的錯誤
    setErrors({ ...errors, email: "" });

    // 檢查 email 格式
    if (
      !formData.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      setErrors({ ...errors, email: "Email 格式不正確" });
      return;
    }

    setIsVerifying(true);

    // 模擬檢查 email 是否重複
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const emailExists = mockUsers.some((user) => user.email === formData.email);

    if (emailExists) {
      setErrors({ ...errors, email: "此 Email 已被註冊" });
      setEmailVerified(false);
      showToast("此 Email 已被註冊，請使用其他 Email", "error");
    } else {
      // 模擬發送驗證信
      setEmailVerified(true);
      setErrors({ ...errors, email: "" });
      showToast("Email 驗證成功！", "success");
    }

    setIsVerifying(false);
  };

  const handleVerifyPhone = async () => {
    // 清除之前的錯誤
    setErrors({ ...errors, phone: "" });

    // 檢查手機號碼格式
    if (formData.phone && !/^09\d{8}$/.test(formData.phone)) {
      setErrors({ ...errors, phone: "手機號碼格式不正確" });
      return;
    }

    setIsVerifyingPhone(true);

    // 模擬檢查手機號碼是否重複
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const phoneExists = mockUsers.some((user) => user.phone === formData.phone);

    if (phoneExists) {
      setErrors({ ...errors, phone: "此手機號碼已被註冊" });
      setPhoneVerified(false);
      showToast("此手機號碼已被註冊，請使用其他手機號碼", "error");
    } else {
      // 模擬發送驗證碼
      setPhoneVerified(true);
      setErrors({ ...errors, phone: "" });
      showToast("手機號碼驗證成功！", "success");
    }

    setIsVerifyingPhone(false);
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) newErrors.name = "請輸入身分證上的姓名";
    if (!formData.email.trim()) newErrors.email = "請輸入 Email";
    if (!emailVerified) newErrors.email = "請先驗證 Email";
    if (!formData.phone.trim()) newErrors.phone = "請輸入聯絡電話";
    if (!phoneVerified) newErrors.phone = "請先驗證手機號碼";
    if (!formData.idNumber.trim())
      newErrors.idNumber = "請輸入身分證字號或護照號碼";
    if (!formData.bankAccount.trim()) newErrors.bankAccount = "請輸入收款銀行帳號";
    if (!formData.birthDate) newErrors.birthDate = "請選擇出生年月日";
    if (!formData.agreedToTerms) newErrors.agreedToTerms = "請同意服務條款";

    // 年齡驗（需年滿18歲）
    if (formData.birthDate) {
      const birthDate = new Date(formData.birthDate);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      if (age < 18) {
        newErrors.birthDate = "註冊用戶需年滿18歲";
      }
    }

    // Email 格式驗證
    if (
      formData.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      newErrors.email = "Email 格式不正確";
    }

    // 手機號碼格式驗證
    if (formData.phone && !/^09\d{8}$/.test(formData.phone)) {
      newErrors.phone = "手機號碼格式不正確";
    }

    // 身分證字號格式驗證（簡化版）
    if (
      formData.idNumber &&
      !/^[A-Z]\d{9}$/.test(formData.idNumber)
    ) {
      newErrors.idNumber = "身分證字號格式不正確";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    // TODO: 未來在此處調用 Supabase 註冊 API
    // 將用戶資料寫入 Supabase 資料庫
    // const { data, error } = await supabase.auth.signUp({
    //   email: formData.email,
    //   phone: formData.phone,
    //   password: formData.password, // 需要新增密碼欄位
    //   options: {
    //     data: {
    //       name: formData.name,
    //       idNumber: formData.idNumber,
    //       bankAccount: formData.bankAccount,
    //       birthDate: formData.birthDate,
    //     }
    //   }
    // });

    // 顯示註冊成功訊息
    showSuccess(
      '註冊成功！',
      '請使用您的帳號密碼登入系統',
      ['您的帳號已成功建立', '現在可以開始使用 Uknow 的所有功能']
    );
    
    // 跳轉到登入頁面，讓用戶重新登入
    navigate("/login");
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      {/* 步驟 1: 填寫資訊 */}
      {currentStep === 1 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              註冊新帳號
            </CardTitle>
            <CardDescription>
              加入 Uknow
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 社群媒體註冊 */}
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleNext("google")}
              >
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                >
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
                使用 Google 註冊
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleNext("facebook")}
              >
                <svg
                  className="mr-2 h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                使用 Facebook 註冊
              </Button>
            </div>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                已經有帳號？
              </span>
              <Link
                to="/login"
                className="text-primary hover:underline ml-1"
              >
                立即登入
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
      {/* 步驟 1: 填寫資訊 */}
      {currentStep === 2 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              註冊新帳號
            </CardTitle>
            <CardDescription>
              加入 Uknow
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 註冊表單 */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">身分證上的姓名 * (申請點數提領需驗證)</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    if (e.target.value.length <= 10) {
                      setFormData({
                        ...formData,
                        name: e.target.value,
                      });
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

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <div className="flex gap-2">
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        email: e.target.value,
                      });
                      // 當用戶修改 email 時，重置驗證狀態
                      if (emailVerified) {
                        setEmailVerified(false);
                      }
                    }}
                    placeholder="請輸入 Email"
                    disabled={socialEmail !== "" && emailVerified}
                    className={`${emailVerified ? "bg-muted" : ""} ${getInputErrorClass(!!errors.email)}`}
                  />
                  {!emailVerified ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleVerifyEmail}
                      disabled={isVerifying || !formData.email}
                      className="whitespace-nowrap"
                    >
                      {isVerifying ? (
                        <svg
                          className="animate-spin h-4 w-4"
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
                      ) : (
                        "驗證"
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="whitespace-nowrap text-green-600"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      已驗證
                    </Button>
                  )}
                </div>
                <FieldError error={errors.email} />
                {emailVerified && (
                  <Alert className="bg-green-50 border-green-200">
                    <AlertDescription className="text-green-800">
                      Email 驗證成功！
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">聯絡電話 *</Label>
                <div className="flex gap-2">
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        phone: e.target.value,
                      });
                      // 當用戶修改手機號碼時，重置驗證狀態
                      if (phoneVerified) {
                        setPhoneVerified(false);
                      }
                    }}
                    placeholder="09XXXXXXXX"
                    className={`${phoneVerified ? "bg-muted" : ""} ${getInputErrorClass(!!errors.phone)}`}
                  />
                  {!phoneVerified ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleVerifyPhone}
                      disabled={isVerifyingPhone || !formData.phone}
                      className="whitespace-nowrap"
                    >
                      {isVerifyingPhone ? (
                        <svg
                          className="animate-spin h-4 w-4"
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
                      ) : (
                        "驗證"
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="whitespace-nowrap text-green-600"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      已驗證
                    </Button>
                  )}
                </div>
                <FieldError error={errors.phone} />
                {phoneVerified && (
                  <Alert className="bg-green-50 border-green-200">
                    <AlertDescription className="text-green-800">
                      手機號碼驗證成功！
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate">出生年月日 *</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={formData.birthDate}
                  max={(() => {
                    const today = new Date();
                    const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
                    return eighteenYearsAgo.toISOString().split('T')[0];
                  })()}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      birthDate: e.target.value,
                    })
                  }
                  className={getInputErrorClass(!!errors.birthDate)}
                />
                <FieldError error={errors.birthDate} />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="terms"
                  checked={formData.agreedToTerms}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      agreedToTerms: checked as boolean,
                    })
                  }
                />
                <Label
                  htmlFor="terms"
                  className="text-sm cursor-pointer"
                >
                  我已詳讀並同意{" "}
                  <span className="text-primary">服務條款</span>{" "}
                  和{" "}
                  <span className="text-primary">隱私政策</span>
                </Label>
              </div>
              <FieldError error={errors.agreedToTerms} />

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(1)}
                  className="flex-1"
                >
                  上一步
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={
                    !formData.name.trim() ||
                    !formData.email.trim() ||
                    !emailVerified ||
                    !formData.phone.trim() ||
                    !phoneVerified ||
                    !formData.birthDate ||
                    !formData.agreedToTerms
                  }
                >
                  完成註冊
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}