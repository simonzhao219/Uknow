import { useState } from 'react';
import { Card } from '../ui/card';
import { IdNumberInput } from '../reward/IdNumberInput';
import { StatusCallout } from '../ui/status-callout';
import { Button } from '../ui/button';
import { Shield, Loader2 } from 'lucide-react';

interface IdNumberVerificationProps {
  title?: string;
  description?: string;
  warningMessage: string;
  confirmButtonText?: string;
  isSubmitting: boolean;
  error?: string | null;
  onBack: () => void;
  onConfirm: (idNumber: string) => Promise<void>;
  onClose: () => void;
}

/**
 * ✅ 統一的身分證驗證步驟組件（步驟3）
 *
 * 功能：
 * - 使用統一的 IdNumberInput 組件
 * - 顯示場景特定的警告訊息
 * - 處理提交載入狀態和錯誤
 *
 * 使用範例：
 * ```tsx
 * <IdNumberVerification
 *   warningMessage="點擊「確認領取」後，獎勵將立即加入您的可提領點數。"
 *   isSubmitting={isSubmitting}
 *   error={error}
 *   onBack={() => setStep(2)}
 *   onConfirm={handleConfirm}
 *   onClose={handleClose}
 * />
 * ```
 */
export function IdNumberVerification({
  title = '🔐 身分驗證',
  description = '為確保帳戶安全，請輸入您的身分證字號',
  warningMessage,
  confirmButtonText = '確認',
  isSubmitting,
  error,
  onBack,
  onConfirm,
  onClose,
}: IdNumberVerificationProps) {
  const [idNumber, setIdNumber] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [localError, setLocalError] = useState('');

  // ✅ 身分證驗證成功回調
  const handleVerified = (verifiedId: string) => {
    setIsVerified(true);
    setLocalError('');
  };

  // ✅ 身分證輸入變更
  const handleIdChange = (value: string) => {
    setIdNumber(value);
    setIsVerified(false); // 輸入改變時重置驗證狀態
    setLocalError('');
  };

  // ✅ 確認提交
  const handleSubmit = async () => {
    if (!isVerified) {
      setLocalError('請先完成身分證驗證');
      return;
    }

    try {
      await onConfirm(idNumber);
      // 成功後由父組件處理
    } catch (err) {
      // 錯誤由父組件的error prop傳入
    }
  };

  return (
    <Card className="w-full max-w-lg">
      <div className="p-6">
        {/* 標題 */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="space-y-4 mb-6">
          {/* 身分證輸入驗證組件 */}
          <IdNumberInput
            value={idNumber}
            onChange={handleIdChange}
            onVerified={handleVerified}
            disabled={isSubmitting}
          />

          {/* 錯誤提示 */}
          {(error || localError) && (
            <StatusCallout variant="destructive" title={error || localError} />
          )}
        </div>

        {/* 按鈕：走 Button 原語，才吃得到三分法、焦點環與 44px 觸控熱區（§12.11）。 */}
        <div className="flex justify-between gap-3">
          <Button tone="secondary" onClick={onBack} disabled={isSubmitting}>
            上一步
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !isVerified}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                處理中...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                {confirmButtonText}
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
