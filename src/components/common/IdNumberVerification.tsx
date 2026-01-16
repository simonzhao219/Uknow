import React, { useState } from 'react';
import { Card } from '../ui/card';
import { IdNumberInput } from '../reward/IdNumberInput';
import { AlertTriangle, Shield, Loader2 } from 'lucide-react';

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
  onClose
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
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="space-y-4 mb-6">
          {/* 說明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              為確保帳戶安全，請輸入您註冊時使用的身分證字號進行身分驗證
            </p>
          </div>

          {/* 身分證輸入驗證組件 */}
          <IdNumberInput
            value={idNumber}
            onChange={handleIdChange}
            onVerified={handleVerified}
            disabled={isSubmitting}
          />

          {/* 最後確認提示（場景特定的警告訊息）*/}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">最後確認：</p>
                <p className="text-sm text-red-800 mt-1">{warningMessage}</p>
              </div>
            </div>
          </div>

          {/* 錯誤提示 */}
          {(error || localError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-900">{error || localError}</p>
            </div>
          )}
        </div>

        {/* 按鈕 */}
        <div className="flex justify-between gap-3">
          <button
            onClick={onBack}
            disabled={isSubmitting}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            上一步
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !isVerified}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
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
          </button>
        </div>
      </div>
    </Card>
  );
}
