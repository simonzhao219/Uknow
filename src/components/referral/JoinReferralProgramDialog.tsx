import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Loader2, Shield, FileText } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';

interface JoinReferralProgramDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (referralCode: string, joinedAt: string) => void;
}

export function JoinReferralProgramDialog({
  open,
  onClose,
  onSuccess
}: JoinReferralProgramDialogProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useNotification();

  if (!open) return null;

  const canSubmit = agreedToTerms && signatureData && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const result = await apiRequestJson<{
        success: boolean;
        data: { referralCode: string; joinedAt: string; message?: string };
      }>(
        buildApiUrl('/referrals/join-program'),
        {
          method: 'POST',
          body: JSON.stringify({
            agreedToTerms,
            signatureData
          })
        }
      );

      if (result.success && result.data) {
        showToast(result.data.message || '成功加入推薦計畫！', 'success');
        onSuccess(result.data.referralCode, result.data.joinedAt);
        onClose();
      } else {
        throw new Error('加入推薦計畫失敗');
      }
    } catch (error: any) {
      console.error('加入推薦計畫錯誤:', error);
      showToast(error.message || '加入推薦計畫失敗，請稍後再試', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {/* 標題 */}
            <div className="mb-6">
              <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                <Shield className="h-6 w-6 text-purple-600" />
                加入推薦計畫
              </h2>
              <p className="text-sm text-muted-foreground">
                完成以下步驟即可開始使用推薦碼邀請好友
              </p>
            </div>

            <div className="space-y-6">
              {/* 1️⃣ 同意條款 */}
              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  閱讀並同意條款
                </h3>
                
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="terms"
                      checked={agreedToTerms}
                      onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="terms" className="text-sm cursor-pointer flex-1">
                      我已詳閱並同意
                      <Link
                        to="/referral-reward-rules"
                        target="_blank"
                        className="text-foreground hover:underline mx-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        推廣獎勵規章
                      </Link>
                      和
                      <Link
                        to="/referral-reward-contract"
                        target="_blank"
                        className="text-foreground hover:underline mx-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        推廣獎勵契約書
                      </Link>
                    </Label>
                  </div>
                </div>
              </div>

              {/* 2️⃣ 簽名 */}
              <div className="space-y-3">
                <h3 className="font-medium">簽名確認</h3>
                <SignaturePad
                  onSignatureChange={setSignatureData}
                  disabled={isSubmitting}
                />
              </div>

              {/* 說明 */}
              {/* <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-900">
                  加入推薦計畫後，您將獲得專屬推薦碼，可以邀請好友註冊並獲得推薦獎勵。
                </p>
              </div> */}
            </div>

            {/* 按鈕 */}
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    處理中...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    加入推薦計畫
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}