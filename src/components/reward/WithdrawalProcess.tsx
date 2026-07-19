import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Alert, AlertDescription } from '../ui/alert';
import { ArrowLeft, ArrowRight, CheckCircle, AlertCircle, Loader2, Upload, X, Eye, EyeOff, CreditCard, Calculator, Shield } from 'lucide-react';
import { apiRequestJson, buildApiUrl, ApiError } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';
import { FieldError, getInputErrorClass } from '../../utils/formHelpers';
import { TAIWAN_BANKS } from '../../utils/constants';
import { IdNumberInput } from './IdNumberInput';
import {
  WITHDRAWAL_FEE,
  DAILY_WITHDRAWAL_LIMIT,
  MIN_WITHDRAWAL,
  computeWithdrawablePoints,
  computeMaxWithdrawal,
  canWithdrawFromBalance,
  validateWithdrawalAmount,
  validateBankAccount,
  isValidIdNumberFormat,
} from '../../utils/withdrawalValidation';

interface WithdrawalProcessProps {
  availableRewards: number;
  pendingRewards: number;
  onSuccess: () => void;
  onCancel: () => void;
}

interface SavedBankData {
  bankCode: string;
  bankAccount: string;
}

interface IdPhoto {
  frontUrl: string | null;
  backUrl: string | null;
}

export function WithdrawalProcess({
  availableRewards,
  pendingRewards,
  onSuccess,
  onCancel
}: WithdrawalProcessProps) {
  const { showToast } = useNotification();
  const [currentStep, setCurrentStep] = useState(1);  // 1: 設定Point, 2: 確認資訊, 3: 身分驗證
  const [amount, setAmount] = useState('');
  const [personalData, setPersonalData] = useState({
    idNumber: '',
    bankCode: '',
    bankAccount: '',
    idCardFront: null as File | null,
    idCardBack: null as File | null,
  });
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // ✅ 身分證驗證狀態（僅需追蹤是否已驗證成功）
  const [isIdVerified, setIsIdVerified] = useState(false);
  
  // ✅ 已存儲的身分證照片
  const [existingPhotos, setExistingPhotos] = useState<IdPhoto>({ frontUrl: null, backUrl: null });
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  
  // ✅ 新上傳照片的預覽 URL
  const [idCardFrontPreview, setIdCardFrontPreview] = useState<string | null>(null);
  const [idCardBackPreview, setIdCardBackPreview] = useState<string | null>(null);
  
  // ✅ 確保數值有效（防止 undefined）
  const safeAvailableRewards = availableRewards || 0;
  const safePendingRewards = pendingRewards || 0;
  
  // ✅ 提領計算（規則收斂於 utils/withdrawalValidation，並有單元測試釘死邊界）
  // 可以提領Point = 可提領Point - 手續費
  const withdrawablePoints = computeWithdrawablePoints(safeAvailableRewards);

  // 最大提領Point = min(floor(可以提領Point / 1000) * 1000, 8000P)
  const maxWithdrawal = computeMaxWithdrawal(safeAvailableRewards);

  const amountNum = parseInt(amount) || 0;

  // ✅ 載入已儲存的銀行帳號（不載入身分證字號）
  useEffect(() => {
    const savedData = localStorage.getItem('withdrawalBankData');
    if (savedData) {
      try {
        const parsed: SavedBankData = JSON.parse(savedData);
        setPersonalData(prev => ({
          ...prev,
          bankCode: parsed.bankCode || '',
          bankAccount: parsed.bankAccount || ''
        }));
      } catch (error) {
        console.error('Failed to load saved bank data:', error);
      }
    }
  }, []);

  // ✅ 載入已存儲的身分證照片
  useEffect(() => {
    const loadExistingPhotos = async () => {
      setIsLoadingPhotos(true);
      try {
        const result = await apiRequestJson<{ success: boolean; data: IdPhoto }>(
          buildApiUrl('/rewards/id-photos')
        );
        
        if (result.success && result.data) {
          setExistingPhotos(result.data);
        }
      } catch (error) {
        console.error('載入身分證照片失敗:', error);
      } finally {
        setIsLoadingPhotos(false);
      }
    };

    loadExistingPhotos();
  }, []);

  // ✅ 身分證字號自動驗證（輸入完10個字元後）
  useEffect(() => {
    const verifyIdNumber = async () => {
      const idNumber = personalData.idNumber.trim();
      
      // 只有當輸入完整格式時才驗證
      if (idNumber.length !== 10) {
        setIsIdVerified(false);
        return;
      }
      
      // 檢查格式
      if (!isValidIdNumberFormat(idNumber)) {
        setIsIdVerified(false);
        return;
      }
      
      // 開始驗證
      console.log('🔍 [前端] 開始驗證身分證字號:', idNumber);
      
      try {
        const result = await apiRequestJson<{ success: boolean; message?: string }>(
          buildApiUrl('/rewards/verify-id'),
          {
            method: 'POST',
            body: JSON.stringify({ idNumber })
          }
        );
        
        console.log('📥 [前端] 驗證API回應:', result);
        
        if (result.success) {
          setIsIdVerified(true);
          // 清除錯誤
          const newErrors = { ...errors };
          delete newErrors.idNumber;
          setErrors(newErrors);
          console.log('✅ [前端] 身分證驗證成功');
        } else {
          setIsIdVerified(false);
          setErrors({ ...errors, idNumber: result.message || '身分證驗證失敗' });
          console.error('❌ [前端] 身分證驗證失敗:', result.message);
        }
      } catch (error) {
        setIsIdVerified(false);
        setErrors({ ...errors, idNumber: '驗證失敗，請稍後再試' });
        console.error('❌ [前端] 驗證API錯誤:', error);
      }
    };

    verifyIdNumber();
  }, [personalData.idNumber]);

  // 第一階段驗證
  const validateStep1 = () => {
    const newErrors: { [key: string]: string } = {};

    const amountError = validateWithdrawalAmount(amount, maxWithdrawal);
    if (amountError) {
      newErrors.amount = amountError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 第二階段驗證
  const validateStep2 = () => {
    const newErrors: { [key: string]: string } = {};

    // 身分證驗證必須成功
    if (!isIdVerified) {
      newErrors.idNumber = '請輸入有效的身分證字號';
    }

    if (!personalData.bankCode.trim()) {
      newErrors.bankCode = '請選擇收款銀行';
    }

    const bankAccountError = validateBankAccount(personalData.bankAccount);
    if (bankAccountError) {
      newErrors.bankAccount = bankAccountError;
    }

    // 檢查是否有上傳照片或已有照片
    if (!personalData.idCardFront && !existingPhotos.frontUrl) {
      newErrors.idCardFront = '請上傳身分證正面照片';
    }

    if (!personalData.idCardBack && !existingPhotos.backUrl) {
      newErrors.idCardBack = '請上傳身分證背面照片';
    }

    if (!agreeToTerms) {
      newErrors.agreeToTerms = '請閱讀並同意服務條款和隱私政策';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep1()) {
      setCurrentStep(2);
    }
  };

  const handleBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    } else if (currentStep === 3) {
      setCurrentStep(2);
    }
  };

  const handleFileUpload = (field: 'idCardFront' | 'idCardBack') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrors({...errors, [field]: '請上傳圖片檔案'});
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        setErrors({...errors, [field]: '檔案大小不能超過 5MB'});
        return;
      }

      setPersonalData({...personalData, [field]: file});
      const newErrors = {...errors};
      delete newErrors[field];
      setErrors(newErrors);

      // ✅ 更新照片預覽 URL
      const reader = new FileReader();
      reader.onload = (e) => {
        if (field === 'idCardFront') {
          setIdCardFrontPreview(e.target?.result as string);
        } else if (field === 'idCardBack') {
          setIdCardBackPreview(e.target?.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = (field: 'idCardFront' | 'idCardBack') => {
    setPersonalData({...personalData, [field]: null});
    // ✅ 清除照片預覽 URL
    if (field === 'idCardFront') {
      setIdCardFrontPreview(null);
    } else if (field === 'idCardBack') {
      setIdCardBackPreview(null);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep2()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // ✅ 步驟1：如果有新照片，先上傳
      if (personalData.idCardFront || personalData.idCardBack) {
        const photoFormData = new FormData();
        
        if (personalData.idCardFront) {
          photoFormData.append('idCardFront', personalData.idCardFront);
        }
        
        if (personalData.idCardBack) {
          photoFormData.append('idCardBack', personalData.idCardBack);
        }
        
        console.log('📷 上傳身分證照片...');
        
        // ✅ 正確獲取 access token
        const { getAccessToken } = await import('../../utils/auth');
        const token = await getAccessToken();
        
        if (!token) {
          throw new Error('請先登入');
        }
        
        const photoResponse = await fetch(buildApiUrl('/rewards/upload-id-photos'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: photoFormData
        });
        
        if (!photoResponse.ok) {
          const errorData = await photoResponse.json();
          console.error('📷 照片上傳失敗:', errorData);
          throw new Error(errorData.error?.message || '照片上傳失敗');
        }
        
        const photoResult = await photoResponse.json();
        console.log('✅ 照片上傳成功:', photoResult);
      }
      
      // ✅ 步驟2：提交提領申請
      const result = await apiRequestJson<{
        success: boolean;
        data?: any;
        error?: { message: string };
      }>(
        buildApiUrl('/rewards/withdraw'),
        {
          method: 'POST',
          body: JSON.stringify({
            amount: amountNum,
            idNumber: personalData.idNumber,
            bankCode: personalData.bankCode,
            bankAccount: personalData.bankAccount
          })
        }
      );

      if (!result.success) {
        throw new Error(result.error?.message || '提領申請失敗');
      }

      // 3. 儲存銀行帳號到 localStorage
      const bankDataToSave: SavedBankData = {
        bankCode: personalData.bankCode,
        bankAccount: personalData.bankAccount
      };
      localStorage.setItem('withdrawalBankData', JSON.stringify(bankDataToSave));

      showToast('提領申請已成功提交！', 'success');
      
      onSuccess(); // 關閉流程
      
    } catch (error) {
      console.error('提領申請錯誤:', error);
      showToast(error instanceof Error ? error.message : '提領申請失敗', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canWithdraw = canWithdrawFromBalance(safeAvailableRewards);

  if (!canWithdraw) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            申請Point提領
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              您的可提領Point不足 {MIN_WITHDRAWAL.toLocaleString()}P（含手續費），無法申請提領。
              請繼續推薦好友增加Point餘額。
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={onCancel} className="w-full mt-4">
            返回
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          申請Point提領 - 步驟 {currentStep}/3
        </CardTitle>
        <CardDescription>
          {currentStep === 1 ? '設定提領Point' : currentStep === 2 ? '確認資訊' : '填寫身分驗證資料'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 步驟指示器 */}
        <div className="flex items-center justify-center space-x-4 mb-6">
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              1
            </div>
            <span className={`ml-2 text-sm ${currentStep >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}>
              設定Point
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              2
            </div>
            <span className={`ml-2 text-sm ${currentStep >= 2 ? 'text-foreground' : 'text-muted-foreground'}`}>
              確認資訊
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentStep >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              3
            </div>
            <span className={`ml-2 text-sm ${currentStep >= 3 ? 'text-foreground' : 'text-muted-foreground'}`}>
              身分驗證
            </span>
          </div>
        </div>

        {/* 第一階段：Point設定 */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* 可提領資訊 */}
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h3 className="font-medium flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                可提領計算
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>可提領Point</span>
                  <span>{safeAvailableRewards.toLocaleString()}P</span>
                </div>
                <div className="flex justify-between">
                  <span>提領手續費</span>
                  <span className="text-muted-foreground">-{WITHDRAWAL_FEE}P</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>可以提領Point</span>
                  <span>{withdrawablePoints.toLocaleString()}P</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>最大提領Point (1000倍數)</span>
                  <span>{maxWithdrawal.toLocaleString()}P</span>
                </div>
                <div className="flex justify-between text-blue-600">
                  <span>每日提領上限</span>
                  <span>{DAILY_WITHDRAWAL_LIMIT.toLocaleString()}P</span>
                </div>
              </div>
            </div>

            {/* 提領Point輸入 */}
            <div className="space-y-2">
              <Label htmlFor="amount">提領Point * (必須為1000的倍數)</Label>
              <Input
                id="amount"
                type="number"
                min={MIN_WITHDRAWAL}
                step="1000"
                max={maxWithdrawal}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`請輸入提領Point（最低${MIN_WITHDRAWAL.toLocaleString()}P，最高${maxWithdrawal.toLocaleString()}P）`}
                className={getInputErrorClass(!!errors.amount)}
              />
              <FieldError error={errors.amount} />
            </div>

            {/* 提領說明 */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">提領說明</h4>
              <div className="space-y-1 text-sm text-blue-800">              
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>最低提領Point為 {MIN_WITHDRAWAL.toLocaleString()}P（必須為1000的倍數）</li>
                  <li>每次提領收取 {WITHDRAWAL_FEE}P 手續費</li>
                  <li>一天只限提領 1 次</li>
                  <li>每次、每日最多提領 {DAILY_WITHDRAWAL_LIMIT.toLocaleString()}P</li>
                  <li>需完成身分驗證流程</li>
                  <li>處理時間約 3-5 個工作天</li>
                  <li>提領申請送出後無法修改</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                取消
              </Button>
              <Button onClick={handleNext} className="flex-1" disabled={!amount}>
                下一步
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* 第二階段：確認資訊 */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {/* 提領明細 */}
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                提領明細
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>提領Point</span>
                  <span className="font-medium">-{amountNum.toLocaleString()}P</span>
                </div>
                <div className="flex justify-between">
                  <span>提領手續費</span>
                  <span className="text-muted-foreground">-{WITHDRAWAL_FEE}P</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium text-lg">
                  <span>總計需扣除</span>
                  <span className="text-red-600">-{(amountNum + WITHDRAWAL_FEE).toLocaleString()}P</span>
                </div>
              </div>
            </div>

            {/* 統計數據變化預覽 */}
            {/* <div className="border-2 border-blue-200 bg-blue-50 p-4 rounded-lg space-y-3">
              <h3 className="font-medium text-blue-900 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                統計數據變化預覽
              </h3> */}
              
              {/* 可提領Point變化 */}
               {/* <div className="space-y-2">
                <div className="text-sm text-blue-800 font-medium">可提領Point</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                    <div className="text-xs text-muted-foreground mb-1">當前</div>
                    <div className="text-lg font-bold text-blue-600">
                      {safeAvailableRewards.toLocaleString()}P
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-blue-600 shrink-0" />
                  <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                    <div className="text-xs text-muted-foreground mb-1">提領後</div>
                    <div className="text-lg font-bold text-green-600">
                      {(safeAvailableRewards - amountNum - WITHDRAWAL_FEE).toLocaleString()}P
                    </div>
                  </div>
                </div>
              </div> */}

              {/* 處理中Point變化 */}
              {/*<div className="space-y-2">
                <div className="text-sm text-blue-800 font-medium">處理中Point</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                    <div className="text-xs text-muted-foreground mb-1">當前</div>
                    <div className="text-lg font-bold text-blue-600">
                      {safePendingRewards.toLocaleString()}P
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-blue-600 shrink-0" />
                  <div className="flex-1 bg-white p-3 rounded border border-blue-200">
                    <div className="text-xs text-muted-foreground mb-1">提領後</div>
                    <div className="text-lg font-bold text-orange-600">
                      {(safePendingRewards + amountNum + WITHDRAWAL_FEE).toLocaleString()}P
                    </div>
                  </div>
                </div>
              </div>
            </div> */}

            {/* 重要提醒 */}
            {/* <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>請確認以上資訊：</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>提領申請送出後無法修改或取消</li>
                  <li>Point將立即從「可提領」轉為「處理中」</li>
                </ul>
              </AlertDescription>
            </Alert> */}

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                上一步
              </Button>
              <Button onClick={() => setCurrentStep(3)} className="flex-1">
                確認並繼續
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* 第三階段：身分驗證 */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {/* 身分證字號 */}
            <div className="space-y-2">
              <Label htmlFor="idNumber">身分證字號 *</Label>
              <div className="relative">
                <Input
                  id="idNumber"
                  value={personalData.idNumber}
                  onChange={(e) => setPersonalData({...personalData, idNumber: e.target.value.toUpperCase()})}
                  placeholder="A123456789"
                  maxLength={10}
                  className={getInputErrorClass(!!errors.idNumber)}
                />
                {/* 驗證狀態指示器 */}
                {isIdVerified && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                )}
              </div>
              {/* ✅ 驗證訊息（統一顯示，避免重複）*/}
              {isIdVerified && (
                <p className="text-sm text-green-600">
                  ✓ 身分證驗證成功
                </p>
              )}
              {/* ✅ 只在沒有驗證訊息時顯示表單驗證錯誤 */}
              {!isIdVerified && <FieldError error={errors.idNumber} />}
            </div>

            {/* 收款銀行代號 */}
            <div className="space-y-2">
              <Label htmlFor="bankCode">收款銀行代號 *</Label>
              <Select
                value={personalData.bankCode}
                onValueChange={(value) => {
                  setPersonalData({...personalData, bankCode: value});
                  const newErrors = {...errors};
                  delete newErrors.bankCode;
                  setErrors(newErrors);
                }}
              >
                <SelectTrigger className={getInputErrorClass(!!errors.bankCode)}>
                  <SelectValue placeholder="請選擇銀行">
                    {personalData.bankCode ? `${personalData.bankCode} - ${TAIWAN_BANKS.find(bank => bank.code === personalData.bankCode)?.name}` : '請選擇銀行'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TAIWAN_BANKS.map(bank => (
                    <SelectItem key={bank.code} value={bank.code}>
                      {bank.code} - {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError error={errors.bankCode} />
            </div>

            {/* 收款銀行帳號 */}
            <div className="space-y-2">
              <Label htmlFor="bankAccount">收款銀行帳號 *</Label>
              <Input
                id="bankAccount"
                value={personalData.bankAccount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^[\d-]+$/.test(value)) {
                    setPersonalData({...personalData, bankAccount: value});
                    if (errors.bankAccount) {
                      const newErrors = {...errors};
                      delete newErrors.bankAccount;
                      setErrors(newErrors);
                    }
                  }
                }}
                placeholder="請輸入完整銀行帳號"
                className={getInputErrorClass(!!errors.bankAccount)}
              />
              <FieldError error={errors.bankAccount} />
            </div>

            {/* 上傳身分證正面照 */}
            <div className="space-y-2">
              <Label>上傳身分證正面照 *</Label>
              
              {/* ✅ 單一區塊設計：有照片顯示縮圖+X按鈕，沒照片顯示上傳區域 */}
              {(idCardFrontPreview || existingPhotos.frontUrl) ? (
                <div className="relative aspect-video rounded-lg overflow-hidden border">
                  <img 
                    src={idCardFrontPreview || existingPhotos.frontUrl || ''} 
                    alt="身分證正面照" 
                    className="w-full h-full object-cover" 
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() => removeFile('idCardFront')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <label className="aspect-video border-2 border-dashed border-muted-foreground/25 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">上傳正面照</span>
                  <span className="text-xs text-muted-foreground mt-1">JPG, PNG (最大5MB)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload('idCardFront')}
                    className="hidden"
                  />
                </label>
              )}
              <FieldError error={errors.idCardFront} />
            </div>

            {/* 上傳身分證背面照 */}
            <div className="space-y-2">
              <Label>上傳身分證背面照 *</Label>
              
              {/* ✅ 單一區塊設計：有照片顯示縮圖+X按鈕，沒照片顯示上傳區域 */}
              {(idCardBackPreview || existingPhotos.backUrl) ? (
                <div className="relative aspect-video rounded-lg overflow-hidden border">
                  <img 
                    src={idCardBackPreview || existingPhotos.backUrl || ''} 
                    alt="身分證背面照" 
                    className="w-full h-full object-cover" 
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() => removeFile('idCardBack')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <label className="aspect-video border-2 border-dashed border-muted-foreground/25 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">上傳背面照</span>
                  <span className="text-xs text-muted-foreground mt-1">JPG, PNG (最大5MB)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload('idCardBack')}
                    className="hidden"
                  />
                </label>
              )}
              <FieldError error={errors.idCardBack} />
            </div>

            {/* 身分證照片儲存提示 */}
            <Alert className="bg-orange-50 border-orange-200">
              <Shield className="h-4 w-4 text-orange-600" />
              <AlertDescription>
                <strong className="text-orange-900">重要提醒：</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-orange-800">
                  <li>身分證照片將會被儲存，下次提領自動帶入</li>
                  <li>如需更新照片，可重新上傳覆蓋舊照片</li>
                  {/* <li><strong>建議您在身分證照片上加上浮水印</strong>（例如：「僅供Uknow提領使用」）</li> */}
                  <li>照片僅用於身分驗證，不會作其他用途</li>
                  <li>帳號：請確認您填寫之帳號與您存摺上的資訊一致（應為10-16位數）</li>
                  <li>提領申請送出後無法修改</li>
                  <li>若上述資料皆已正確輸入但仍提領失敗,請您來信Uknow客服中心</li>
                </ul>
              </AlertDescription>
            </Alert>

            {/* 同意款 */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg">
                <Checkbox
                  id="agreeToTerms"
                  checked={agreeToTerms}
                  onCheckedChange={(checked) => {
                    setAgreeToTerms(checked as boolean);
                    if (checked) {
                      const newErrors = {...errors};
                      delete newErrors.agreeToTerms;
                      setErrors(newErrors);
                    }
                  }}
                />
                <Label htmlFor="agreeToTerms" className="cursor-pointer text-sm flex-1">
                  我已閱讀並同意 <a href="/referral-reward-rules" className="text-blue-600 underline mx-1">推薦獎勵規則</a>
                </Label>
              </div>
              <FieldError error={errors.agreeToTerms} />
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1" disabled={isSubmitting}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                上一步
              </Button>
              <Button 
                onClick={handleSubmit} 
                className="flex-1"
                disabled={
                  isSubmitting ||
                  !isIdVerified || 
                  !personalData.bankCode || 
                  !personalData.bankAccount || 
                  (!personalData.idCardFront && !existingPhotos.frontUrl) ||
                  (!personalData.idCardBack && !existingPhotos.backUrl) ||
                  !agreeToTerms
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    提交中...
                  </>
                ) : (
                  '提交申請'
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}