import { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Loader2, Shield, FileText } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';
import { LegalDialog } from '../LegalDialog';
import { referralRewardRulesContent } from '../../content/referralRewardRules';
import { referralRewardContractContent } from '../../content/referralRewardContract';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface JoinReferralProgramDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (referralCode: string, joinedAt: string) => void;
}

export function JoinReferralProgramDialog({
  open,
  onClose,
  onSuccess,
}: JoinReferralProgramDialogProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useNotification();

  // 開啟期間鎖住背景頁面。這個彈窗是手刻的 fixed 遮罩（不是 Radix Dialog），
  // 底下的頁面本來還能被拖動；iOS Safari 一旦拖到頁面就會收合／展開網址列，
  // 版面高度當場改變，置中的卡片跟著上下彈跳，簽名時尤其難用。
  // 注意：Hook 必須排在下面的 `if (!open) return null` 之前，否則會違反 Hook 規則。
  useBodyScrollLock(open);

  if (!open) return null;

  const canSubmit = agreedToTerms && signatureData && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const result = await apiRequestJson<{
        success: boolean;
        data: { referralCode: string; joinedAt: string; message?: string };
      }>(buildApiUrl('/referrals/join-program'), {
        method: 'POST',
        body: JSON.stringify({
          agreedToTerms,
          signatureData,
        }),
      });

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
      {/* 遮罩本身 overscroll-contain：即使手指落在卡片外面拖動，也不會把捲動
          連鎖傳到底下的頁面（iOS 的橡皮筋回彈就是這樣被觸發的）。 */}
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overscroll-contain">
        {/* 高度用 dvh 而非 vh：行動瀏覽器網址列收合時 vh 不會更新，卡片會超出
            可視範圍、底部按鈕被切掉。overscroll-contain 讓卡片捲到頭尾時停住，
            不會把剩餘的捲動交給背景頁面。 */}
        {/* 手刻遮罩不像 Radix Dialog 會自帶 role="dialog"——沒有它，輔助技術
            （與依 ARIA role 定位的測試）都看不出這是一個 modal。刻意不宣告
            aria-modal：那是「焦點被困在對話框內」的承諾，本元件沒有 focus
            trap，宣告了反而是不實資訊；可讀名稱用 aria-labelledby 綁標題，
            文案改動時不會與獨立字串漂移。 */}
        <Card
          role="dialog"
          aria-labelledby="join-referral-dialog-title"
          className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain"
        >
          <div className="p-6">
            {/* 標題 */}
            <div className="mb-6">
              <h2
                id="join-referral-dialog-title"
                className="text-2xl font-semibold mb-2 flex items-center gap-2"
              >
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
                    {/* 兩份文件用就地彈窗閱讀（LegalDialog），不再用 target="_blank"
                        開新分頁。開新分頁會讓文件頁成為分頁歷史第一筆，其「上一頁」
                        鈕 navigate(-1) 無處可回而變死鈕（本次修的 bug）。改用彈窗後
                        關掉即回到本對話框、簽名與勾選狀態原封不動，根本不需要返回鈕。 */}
                    {/* leading-relaxed 讓換行後的行距不擠；每個文件連結各自
                        whitespace-nowrap + inline-block，保證「推廣獎勵規章」「推廣獎勵契約書」
                        這種專有名詞永遠整組不斷字。整句仍可換行，但只會在
                        「我已詳閱並同意 / 規章 / 和 / 契約書」這些完整詞塊之間斷，
                        不會再把一兩個字（章、書）擠到下一行造成排版怪異。 */}
                    <Label
                      htmlFor="terms"
                      className="text-sm cursor-pointer flex-1 leading-relaxed"
                    >
                      <span className="whitespace-nowrap">我已詳閱並同意</span>
                      <LegalDialog
                        triggerLabel="推廣獎勵規章"
                        title="推廣獎勵規章"
                        content={referralRewardRulesContent}
                        triggerClassName="text-foreground hover:underline mx-1 whitespace-nowrap inline-block"
                        triggerTestId="referral-rules-link"
                      />
                      <span className="whitespace-nowrap">和</span>
                      <LegalDialog
                        triggerLabel="推廣獎勵契約書"
                        title="推廣獎勵契約書"
                        content={referralRewardContractContent}
                        triggerClassName="text-foreground hover:underline mx-1 whitespace-nowrap inline-block"
                        triggerTestId="referral-contract-link"
                      />
                    </Label>
                  </div>
                </div>
              </div>

              {/* 2️⃣ 簽名 */}
              <div className="space-y-3">
                <h3 className="font-medium">簽名確認（中文正楷）</h3>
                <SignaturePad onSignatureChange={setSignatureData} disabled={isSubmitting} />
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
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
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
