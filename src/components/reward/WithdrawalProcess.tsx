import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Alert, AlertDescription } from '../ui/alert';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Loader2,
  Upload,
  X,
  CreditCard,
  Calculator,
  Shield,
} from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import type { IdPhotosResponse } from '@contract';
import { useNotification } from '../notifications/NotificationContext';
import { LegalDialog } from '../LegalDialog';
import { referralRewardRulesContent } from '../../content/referralRewardRules';
import { FieldError, getInputErrorClass } from '../../utils/formHelpers';
import { TAIWAN_BANKS } from '../../utils/constants';
import { useImeComposition } from '../../hooks/useImeComposition';
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

// 型別走契約(plan §2.4 的收斂原則):/rewards/id-photos 的回應形狀由
// @contract 定義,手抄本不會跟著契約長欄位——verificationStatus 先前就是
// 這樣被丟掉的,rejected 會員因此填完整張表才被守衛 #5a 打回。
type IdPhotosData = IdPhotosResponse['data'];

export function WithdrawalProcess({
  availableRewards,
  pendingRewards,
  onSuccess,
  onCancel,
}: WithdrawalProcessProps) {
  const { showToast } = useNotification();
  const [currentStep, setCurrentStep] = useState(1); // 1: 設定Point, 2: 確認資訊, 3: 身分驗證
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

  // 身分證與銀行帳號兩個欄位都會改寫/拒收使用者打的字,在 IME 組字期間這麼做
  // 會毀掉組字狀態(iOS Safari 尤其嚴重)。改寫延後到組字結束,組字期間原樣
  // 收下——不收的話 React 會拿舊值寫回 DOM,那是更糟的路徑。
  // 見 docs/plans/friction-log.md 的 2026-08-07 條。
  const idNumberImeProps = useImeComposition<HTMLInputElement>({
    onCompose: (raw) => setPersonalData((prev) => ({ ...prev, idNumber: raw })),
    onCommit: (raw) => setPersonalData((prev) => ({ ...prev, idNumber: raw.toUpperCase() })),
  });

  // 銀行帳號的「只收數字與連字號」是**拒收**:不符就整個丟掉。刻意保留這個
  // 語意(不改成逐字元過濾),只把它移到組字結束後執行——那時已經沒有組字
  // 狀態可以毀。組字期間一律原樣收下。
  const commitBankAccount = (raw: string) => {
    if (raw !== '' && !/^[\d-]+$/.test(raw)) return;
    setPersonalData((prev) => ({ ...prev, bankAccount: raw }));
    setErrors((prev) => {
      if (!prev.bankAccount) return prev;
      const { bankAccount: _removed, ...rest } = prev;
      return rest;
    });
  };
  const bankAccountImeProps = useImeComposition<HTMLInputElement>({
    onCompose: (raw) => setPersonalData((prev) => ({ ...prev, bankAccount: raw })),
    onCommit: commitBankAccount,
  });

  // ✅ 已存儲的身分證照片
  const [existingPhotos, setExistingPhotos] = useState<Pick<IdPhotosData, 'frontUrl' | 'backUrl'>>({
    frontUrl: null,
    backUrl: null,
  });
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);

  // 證件被退回時的引導(守衛 #5a 只在送出時擋 rejected;不在這裡引導,
  // 會員會填完整張表才被 toast 打回)。理由要到得了會員面前。
  const [idRejected, setIdRejected] = useState(false);
  const [idRejectReason, setIdRejectReason] = useState<string | null>(null);

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
        setPersonalData((prev) => ({
          ...prev,
          bankCode: parsed.bankCode || '',
          bankAccount: parsed.bankAccount || '',
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
        const result = await apiRequestJson<IdPhotosResponse>(buildApiUrl('/rewards/id-photos'));

        if (result.success && result.data) {
          if (result.data.verificationStatus === 'rejected') {
            // 被退回的照片不予沿用——沿用等於重送同一份資料再被退一次
            // (規格書 §10.1 點名的失敗模式;人審裁決:兩面都要新照片)。
            // existingPhotos 維持空,validateStep2 與提交鍵的既有條件
            // 自然強制兩面新上傳,守衛 #5a 在新照片轉 pending 後放行。
            setIdRejected(true);
            setIdRejectReason(result.data.rejectReason);
          } else {
            setExistingPhotos({
              frontUrl: result.data.frontUrl,
              backUrl: result.data.backUrl,
            });
          }
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
            body: JSON.stringify({ idNumber }),
          },
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

  const handleFileUpload =
    (field: 'idCardFront' | 'idCardBack') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (!file.type.startsWith('image/')) {
          setErrors({ ...errors, [field]: '請上傳圖片檔案' });
          return;
        }

        if (file.size > 5 * 1024 * 1024) {
          setErrors({ ...errors, [field]: '檔案大小不能超過 5MB' });
          return;
        }

        setPersonalData({ ...personalData, [field]: file });
        const newErrors = { ...errors };
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
    setPersonalData({ ...personalData, [field]: null });
    // 同時清掉預覽與伺服器上已存照片的 URL——兩者任一還在，縮圖就不會
    // 讓位給上傳區塊，回頭客會被困在「X 按了沒反應、想換照片沒入口」。
    // 已存照片只是前端顯示層的引用；後端檔案在重新上傳時才會被覆蓋，
    // 而 validateStep2 會擋「移除後未重新上傳就送出」。
    if (field === 'idCardFront') {
      setIdCardFrontPreview(null);
      setExistingPhotos((prev) => ({ ...prev, frontUrl: null }));
    } else if (field === 'idCardBack') {
      setIdCardBackPreview(null);
      setExistingPhotos((prev) => ({ ...prev, backUrl: null }));
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
            Authorization: `Bearer ${token}`,
          },
          body: photoFormData,
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
      }>(buildApiUrl('/rewards/withdraw'), {
        method: 'POST',
        body: JSON.stringify({
          amount: amountNum,
          idNumber: personalData.idNumber,
          bankCode: personalData.bankCode,
          bankAccount: personalData.bankAccount,
        }),
      });

      if (!result.success) {
        throw new Error(result.error?.message || '提領申請失敗');
      }

      // 3. 儲存銀行帳號到 localStorage
      const bankDataToSave: SavedBankData = {
        bankCode: personalData.bankCode,
        bankAccount: personalData.bankAccount,
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
          {currentStep === 1
            ? '設定提領Point'
            : currentStep === 2
              ? '確認資訊'
              : '填寫身分驗證資料'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 步驟指示器 */}
        <div className="flex items-center justify-center space-x-4 mb-6">
          <div className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep >= 1
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              1
            </div>
            <span
              className={`ml-2 text-sm ${currentStep >= 1 ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              設定Point
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep >= 2
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              2
            </div>
            <span
              className={`ml-2 text-sm ${currentStep >= 2 ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              確認資訊
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep >= 3
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              3
            </div>
            <span
              className={`ml-2 text-sm ${currentStep >= 3 ? 'text-foreground' : 'text-muted-foreground'}`}
            >
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
                  <span className="text-red-600">
                    -{(amountNum + WITHDRAWAL_FEE).toLocaleString()}P
                  </span>
                </div>
              </div>
            </div>

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
            {/* 證件退回警示——放步驟頂部:這一步的其他欄位都白填之前,
                先讓會員知道要換照片。 */}
            {idRejected && (
              <Alert className="bg-red-50 border-red-200">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription>
                  <strong className="text-red-900">證件審核未通過</strong>
                  <p className="mt-1 text-sm text-red-800">
                    {idRejectReason ?? '請聯繫客服了解原因'}
                  </p>
                  <p className="mt-1 text-sm text-red-800">
                    請重新上傳身分證正反面（不可沿用先前的照片），送出申請時會一併重新送審。
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* 身分證字號 */}
            <div className="space-y-2">
              <Label htmlFor="idNumber">身分證字號 *</Label>
              <div className="relative">
                <Input
                  id="idNumber"
                  value={personalData.idNumber}
                  {...idNumberImeProps}
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
              {isIdVerified && <p className="text-sm text-green-600">✓ 身分證驗證成功</p>}
              {/* ✅ 只在沒有驗證訊息時顯示表單驗證錯誤 */}
              {!isIdVerified && <FieldError error={errors.idNumber} />}
            </div>

            {/* 收款銀行代號 */}
            <div className="space-y-2">
              <Label htmlFor="bankCode">收款銀行代號 *</Label>
              <Select
                value={personalData.bankCode}
                onValueChange={(value) => {
                  setPersonalData({ ...personalData, bankCode: value });
                  const newErrors = { ...errors };
                  delete newErrors.bankCode;
                  setErrors(newErrors);
                }}
              >
                <SelectTrigger className={getInputErrorClass(!!errors.bankCode)}>
                  <SelectValue placeholder="請選擇銀行">
                    {personalData.bankCode
                      ? `${personalData.bankCode} - ${TAIWAN_BANKS.find((bank) => bank.code === personalData.bankCode)?.name}`
                      : '請選擇銀行'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TAIWAN_BANKS.map((bank) => (
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
                {...bankAccountImeProps}
                placeholder="請輸入完整銀行帳號"
                className={getInputErrorClass(!!errors.bankAccount)}
              />
              <FieldError error={errors.bankAccount} />
            </div>

            {/* 上傳身分證正面照 */}
            <div className="space-y-2">
              <Label>上傳身分證正面照 *</Label>

              {/* ✅ 單一區塊設計：有照片顯示縮圖+X按鈕，沒照片顯示上傳區域 */}
              {idCardFrontPreview || existingPhotos.frontUrl ? (
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
                    aria-label="移除正面照片"
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
              {idCardBackPreview || existingPhotos.backUrl ? (
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
                    aria-label="移除背面照片"
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
                      const newErrors = { ...errors };
                      delete newErrors.agreeToTerms;
                      setErrors(newErrors);
                    }
                  }}
                />
                <Label htmlFor="agreeToTerms" className="cursor-pointer text-sm flex-1">
                  我已閱讀並同意{' '}
                  {/* 就地彈窗，而非會換頁的 <a href>：提領是多步驟表單，走到這一步
                      已經填了銀行帳號、身分證字號、上傳了照片，而這些全在元件本地
                      useState（沒有草稿持久化）。換頁會卸載表單、把它們清成空白
                      （本次修的 bug）。彈窗讓表單留在底下，讀完關掉即可續填。 */}
                  {/* 掛推薦獎勵規則而非事業手冊：本頁強制執行的三個數字——最低 1,000 點
                      （MIN_WITHDRAWAL）、每次 15 點手續費（WITHDRAWAL_FEE）、每日上限
                      8,000 點（DAILY_WITHDRAWAL_LIMIT）——只有推薦獎勵規則第六條逐條寫齊。
                      事業手冊 §8-2 沒有每日上限，且把手續費寫成「每筆匯費 15 元」（從匯款
                      金額扣），與本頁「從點數扣 15 點」的算法不符，會員照它算不出畫面數字。 */}
                  <LegalDialog
                    triggerLabel="推薦獎勵規則"
                    title="推薦獎勵規則"
                    content={referralRewardRulesContent}
                    triggerClassName="text-blue-600 underline mx-1"
                    triggerTestId="withdrawal-rules-link"
                  />
                </Label>
              </div>
              <FieldError error={errors.agreeToTerms} />
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1"
                disabled={isSubmitting}
              >
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
