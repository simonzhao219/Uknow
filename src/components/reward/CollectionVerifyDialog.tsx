import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Shield, Loader2, ArrowLeft } from 'lucide-react';
import { IdNumberInput } from './IdNumberInput';

interface CollectionVerifyDialogProps {
  onConfirm: (idNumber: string) => Promise<void>;
  onBack: () => void;
  onCancel: () => void;
}

/**
 * 查收驗證對話框 - 第三步
 * 輸入身分證字號進行驗證
 */
export function CollectionVerifyDialog({ onConfirm, onBack, onCancel }: CollectionVerifyDialogProps) {
  const [idNumber, setIdNumber] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ✅ 身分證驗證成功回調
  const handleVerified = (verifiedId: string) => {
    // ✅ 不需要重複設置 idNumber，因為已經通過 onChange 更新
    setIsVerified(true);
    setError('');
  };

  // ✅ 確認查收（不再重複驗證，直接提交）
  const handleSubmit = async () => {
    if (!isVerified) {
      setError('請先完成身分證驗證');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onConfirm(idNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : '確認查收失敗');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            身分證驗證 - 步驟 3/3
          </CardTitle>
          <CardDescription>
            請輸入您註冊時使用的身分證字號
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 說明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              為確保帳戶安全，請輸入您的身分證字號進行身分驗證
            </p>
          </div>

          {/* 身分證輸入驗證組件 */}
          <IdNumberInput
            value={idNumber}
            onChange={(value) => {
              setIdNumber(value);
              setIsVerified(false); // 輸入改變時重置驗證狀態
              setError('');
            }}
            onVerified={handleVerified}
            disabled={isSubmitting}
          />

          {/* 總錯誤提示 */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* 按鈕 */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onBack}
              className="flex-1"
              disabled={isSubmitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={isSubmitting || !isVerified}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  處理中...
                </>
              ) : (
                '確認查收'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}