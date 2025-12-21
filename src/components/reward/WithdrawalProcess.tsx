import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { 
  CreditCard, 
  AlertCircle, 
  Upload, 
  X, 
  ArrowRight, 
  ArrowLeft, 
  Save,
  CheckCircle,
  Calculator
} from 'lucide-react';
import { getInputErrorClass, FieldError } from '../../utils/formHelpers';
import { useNotification } from '../notifications/NotificationContext';
import { TAIWAN_BANKS } from '../../utils/constants';

interface WithdrawalProcessProps {
  availableRewards: number;
  onCancel: () => void;
}

interface SavedData {
  idNumber: string;
  bankCode: string;
  bankAccount: string;
  idCardFront: string | null;
  idCardBack: string | null;
}

export function WithdrawalProcess({ availableRewards, onCancel }: WithdrawalProcessProps) {
  const { showSuccess } = useNotification();
  const [currentStep, setCurrentStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [personalData, setPersonalData] = useState({
    idNumber: '',
    bankCode: '',
    bankAccount: '',
    idCardFront: null as File | null,
    idCardBack: null as File | null
  });
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [saveData, setSaveData] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const reservedAmount = 273; // 預留費用
  const fee = 15; // 手續費
  const actualAvailable = Math.max(0, availableRewards - reservedAmount - fee);
  const maxWithdrawal = Math.floor(actualAvailable / 1000) * 1000;
  const amountNum = parseInt(amount) || 0;
  // const finalAmount = amountNum - fee;

  // 載入已儲存的資料
  useEffect(() => {
    const savedData = localStorage.getItem('withdrawalData');
    if (savedData) {
      try {
        const parsed: SavedData = JSON.parse(savedData);
        setPersonalData(prev => ({
          ...prev,
          idNumber: parsed.idNumber || '',
          bankCode: parsed.bankCode || '',
          bankAccount: parsed.bankAccount || ''
        }));
      } catch (error) {
        console.error('Failed to load saved data:', error);
      }
    }
  }, []);

  // 第一階段驗證
  const validateStep1 = () => {
    const newErrors: { [key: string]: string } = {};

    if (!amount) {
      newErrors.amount = '請輸入提領Point';
    } else if (amountNum % 1000 !== 0) {
      newErrors.amount = '提領Point必須為 1000 的倍數';
    } else if (amountNum > maxWithdrawal) {
      newErrors.amount = `提領Point不能超過 ${maxWithdrawal}P`;
    } else if (amountNum < 1000) {
      newErrors.amount = '最低提領Point為 1000P';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 第二階段驗證
  const validateStep2 = () => {
    const newErrors: { [key: string]: string } = {};

    // 只接受台灣身分證字號
    if (!personalData.idNumber.trim()) {
      newErrors.idNumber = '請輸入身分證字號';
    } else {
      // 台灣身分證格式驗證：第一個字母+9個數字
      const idPattern = /^[A-Z][12]\d{8}$/;
      if (!idPattern.test(personalData.idNumber)) {
        newErrors.idNumber = '請輸入有效的台灣身分證字號（例如：A123456789）';
      }
    }

    if (!personalData.bankCode.trim()) {
      newErrors.bankCode = '請選擇收款銀行';
    }

    if (!personalData.bankAccount.trim()) {
      newErrors.bankAccount = '請輸入收款銀行帳號';
    } else {
      // 移除連字號後檢查
      const accountDigits = personalData.bankAccount.replace(/-/g, '');
      
      // 檢查是否只包含數字和連字號
      if (!/^[\d-]+$/.test(personalData.bankAccount)) {
        newErrors.bankAccount = '銀行帳號只能包含數字和連字號';
      } else if (accountDigits.length < 10) {
        newErrors.bankAccount = '銀行帳號至少需要10位數字';
      } else if (accountDigits.length > 16) {
        newErrors.bankAccount = '銀行帳號不能超過16位數字';
      } else if (!/^\d+$/.test(accountDigits)) {
        newErrors.bankAccount = '請輸入有效的銀行帳號';
      }
    }

    if (!personalData.idCardFront) {
      newErrors.idCardFront = '請上傳身分證正面照片';
    }

    if (!personalData.idCardBack) {
      newErrors.idCardBack = '請上傳身分證反面照片';
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
    setCurrentStep(1);
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
    }
  };

  const removeFile = (field: 'idCardFront' | 'idCardBack') => {
    setPersonalData({...personalData, [field]: null});
  };

  const handleSubmit = () => {
    if (validateStep2()) {
      // 儲存資料（如果用戶選擇）
      if (saveData) {
        const dataToSave: SavedData = {
          idNumber: personalData.idNumber,
          bankCode: personalData.bankCode,
          bankAccount: personalData.bankAccount,
          idCardFront: null, // 不儲存檔案
          idCardBack: null
        };
        localStorage.setItem('withdrawalData', JSON.stringify(dataToSave));
      }

      const bankName = TAIWAN_BANKS.find(bank => bank.code === personalData.bankCode)?.name || '未知銀行';
      
      showSuccess(
        '提領申請已成功提交！',
        `您的Point提領申請已經送出，我們將在3-5個工作天內處理`,
        [
          `提領Point：${amount}P`,
          `手續費：${fee}P`,
          `收款銀行：${bankName} (${personalData.bankCode})`,
          `銀行帳號：${personalData.bankAccount}`,
          '請耐心等待處理完成'
        ]
      );
      
      onCancel(); // 關閉流程
    }
  };

  const canWithdraw = maxWithdrawal >= 1000;

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
              您的可提領Point不足 1000，無法申請提領。
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
          申請Point提領 - 步驟 {currentStep}/2
        </CardTitle>
        <CardDescription>
          {currentStep === 1 ? '設定提領Point' : '填寫身分驗證資料'}
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
                  <span>可用Point</span>
                  <span>{availableRewards}P</span>
                </div>
                <div className="flex justify-between">
                  <span>預留費用</span>
                  <span className="text-muted-foreground">-{reservedAmount}P</span>
                </div>
                <div className="flex justify-between">
                  <span>提領手續費</span>
                  <span className="text-muted-foreground">-{fee}P</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>實際可提領</span>
                  <span>{actualAvailable}P</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>最大提領Point (1000倍數)</span>
                  <span>{maxWithdrawal}P</span>
                </div>
              </div>
            </div>

            {/* 提領Point輸入 */}
            <div className="space-y-2">
              <Label htmlFor="amount">提領Point * (必須為1000的倍數)</Label>
              <Input
                id="amount"
                type="number"
                min="1000"
                step="1000"
                max={maxWithdrawal}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="請輸入提領Point"
                className={getInputErrorClass(!!errors.amount)}
              />
              <FieldError error={errors.amount} />
            </div>

            {/* 費用計算 */} {/*
            {amountNum > 0 && (
              <div className="bg-blue-50 p-4 rounded-lg space-y-2">
                <h4 className="font-medium text-blue-900">費用明細</h4>
                <div className="space-y-1 text-sm text-blue-800">
                  <div className="flex justify-between">
                    <span>提領Point</span>
                    <span>{amountNum}P</span>
                  </div>
                  <div className="flex justify-between">
                    <span>手續費</span>
                    <span>-$15</span>
                  </div>
                  <div className="border-t border-blue-200 pt-1 flex justify-between font-medium">
                    <span>實際入帳</span>
                    <span>{finalAmount}P</span>
                  </div>
                </div>
              </div>
            )} */}

            {/* 提領說明 */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">提領說明</h4>
              <div className="space-y-1 text-sm text-blue-800">
                <p>• 最低提領Point為 1,000P（必須為1000的倍數）</p>
                <p>• 需完成身分驗證流程</p>
                <p>• 處理時間約 3-5 個工作天</p>
                <p>• 提領申請送出後無法修改</p>
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

        {/* 第二階段：身分驗證 */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {/* 提領摘要 */} {/*
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-medium mb-2">提領摘要</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">提領Point</span>
                  <p className="font-medium">{amountNum}P</p>
                </div>
                <div>
                  <span className="text-muted-foreground">實際入帳</span>
                  <p className="font-medium text-green-600">{finalAmount}P</p>
                </div>
              </div>
            </div> */}

            {/* 身分證字號 */}
            <div className="space-y-2">
              <Label htmlFor="idNumber">身分證字號 *</Label>
              <Input
                id="idNumber"
                value={personalData.idNumber}
                onChange={(e) => setPersonalData({...personalData, idNumber: e.target.value.toUpperCase()})}
                placeholder="A123456789"
                maxLength={10}
                className={getInputErrorClass(!!errors.idNumber)}
              />
              <FieldError error={errors.idNumber} />
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
                  // 只允許數字和連字號
                  if (value === '' || /^[\d-]+$/.test(value)) {
                    setPersonalData({...personalData, bankAccount: value});
                    // 清除錯誤
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
              {personalData.idCardFront ? (
                <div className="flex items-center gap-2 p-3 border rounded border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-800">{personalData.idCardFront.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile('idCardFront')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">點擊上傳身分證正面</span>
                  <span className="text-xs text-muted-foreground mt-1">支援 JPG, PNG 格式，最大 5MB</span>
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
              {personalData.idCardBack ? (
                <div className="flex items-center gap-2 p-3 border rounded border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-800">{personalData.idCardBack.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile('idCardBack')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">點擊上傳身分證背面</span>
                  <span className="text-xs text-muted-foreground mt-1">支援 JPG, PNG 格式，最大 5MB</span>
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

            {/* 儲存資料選項 */}
            <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg">
              <Checkbox
                id="saveData"
                checked={saveData}
                onCheckedChange={(checked) => setSaveData(checked as boolean)}
              />
              <Label htmlFor="saveData" className="cursor-pointer text-sm">
                <div className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  儲存身分證字號和銀行帳號，下次自動帶入
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  (身分證件照片不會被儲存)
                </p>
              </Label>
            </div>

            {/* 同意條款 */}
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
                  我已閱讀並同意 <a href="#" className="text-blue-600 underline mx-1">服務條款</a> 和 <a href="#" className="text-blue-600 underline mx-1">隱私政策</a>
                </Label>
              </div>
              <FieldError error={errors.agreeToTerms} />
            </div>

            {/* 注意事項 */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>注意事項：</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>每次提領收取 15P 手續費</li>
                  <li>處理時間約 3-5 個工作天</li>
                  <li>身分證件僅用於身分驗證，不會另作他用</li>
                  <li>提領申請送出後無法修改</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex gap-4">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                上一步
              </Button>
              <Button 
                onClick={handleSubmit} 
                className="flex-1"
                disabled={!personalData.idNumber || !personalData.bankCode || !personalData.bankAccount || !personalData.idCardFront || !personalData.idCardBack || !agreeToTerms}
              >
                提交申請
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}