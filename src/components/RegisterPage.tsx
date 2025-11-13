import React, { useState, useContext } from "react";
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

export function RegisterPage() {
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
  const { setUser } = useContext(UserContext);
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);

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

  const handleNext = () => {
    if (currentStep === 1) {
      setCurrentStep(2);
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim())
      newErrors.name = "請輸入真實姓名";
    if (!formData.email.trim())
      newErrors.email = "請輸入 Email";
    if (!formData.phone.trim())
      newErrors.phone = "請輸入聯絡電話";
    if (!formData.idNumber.trim())
      newErrors.idNumber = "請輸入身分證字號或護照號碼";
    if (!formData.bankAccount.trim())
      newErrors.bankAccount = "請輸入收款銀行帳號";
    if (!formData.birthDate)
      newErrors.birthDate = "請選擇出生年月日";
    if (!formData.agreedToTerms)
      newErrors.agreedToTerms = "請同意服務條款";

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

    // 模擬註冊成功
    const newUser = {
      id: `user_${Date.now()}`,
      ...formData,
      isAdmin: false,
      referralCode: `REF${Date.now()}`,
      referrer: null,
      totalRewards: 0,
      availableRewards: 0,
    };

    setUser(newUser);
    localStorage.setItem("user", JSON.stringify(newUser));
    navigate("/dashboard");
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
                onClick={handleNext}
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
                onClick={handleNext}
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
              <Button
                variant="outline"
                className="w-full"
                onClick={handleNext}
              >
                <svg
                  className="mr-2 h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
                使用 LINE 註冊
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
                <Label htmlFor="name">真實姓名 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      name: e.target.value,
                    })
                  }
                  placeholder="請輸入真實姓名"
                />
                {errors.name && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {errors.name}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      email: e.target.value,
                    })
                  }
                  placeholder="請輸入 Email"
                />
                {errors.email && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {errors.email}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">聯絡電話 *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      phone: e.target.value,
                    })
                  }
                  placeholder="09XXXXXXXX"
                />
                {errors.phone && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {errors.phone}
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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      birthDate: e.target.value,
                    })
                  }
                />
                {errors.birthDate && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {errors.birthDate}
                    </AlertDescription>
                  </Alert>
                )}
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
              {errors.agreedToTerms && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {errors.agreedToTerms}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)} className="flex-1">
                  上一步
                </Button>
                <Button onClick={handleSubmit} className="flex-1">
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