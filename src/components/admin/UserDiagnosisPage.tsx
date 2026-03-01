import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2, Search, CheckCircle, AlertTriangle, XCircle, Info, Wrench } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';

interface DiagnosisResult {
  success: boolean;
  userId: string;
  profile: {
    email: string;
    name: string;
    phone: string;
    registrationStep: number;
    accountStatus?: string;
    referralCode?: string;
    referredByCode?: string;
    createdAt: string;
    updatedAt?: string;
  };
  issues: string[];
  warnings: string[];
  info: string[];
  message: string;
}

interface FixResult {
  success: boolean;
  userId: string;
  fixes: string[];
  errors: string[];
  message: string;
}

export function UserDiagnosisPage() {
  const [userId, setUserId] = useState('297e23d4-0d9b-497c-b489-1e33043870ee');
  const [isLoading, setIsLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const { showToast, showSuccess, showError } = useNotification();

  const handleDiagnosis = async () => {
    if (!userId.trim()) {
      showToast('請輸入用戶 ID', 'error');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const data = await apiRequestJson<DiagnosisResult>(
        buildApiUrl(`/admin-user-diagnosis/${userId}`)
      );

      setResult(data);

      if (data.success) {
        showSuccess('診斷完成', '所有檢查通過，數據完整無誤！');
      } else {
        showToast(data.message, 'warning');
      }
    } catch (error: any) {
      console.error('診斷失敗:', error);
      showError('診斷失敗', error.message || '請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFix = async (force: boolean = false) => {
    if (!userId.trim()) {
      showToast('請輸入用戶 ID', 'error');
      return;
    }

    setIsFixing(true);

    try {
      const data = await apiRequestJson<FixResult>(
        buildApiUrl(`/admin-user-diagnosis/${userId}/fix`),
        {
          method: 'POST',
          body: JSON.stringify({ force })
        }
      );

      if (data.success) {
        showSuccess('自動修復完成', data.message, data.fixes);
        
        // 重新診斷
        setTimeout(() => {
          handleDiagnosis();
        }, 1000);
      } else {
        showError('修復失敗', data.message);
      }
    } catch (error: any) {
      console.error('修復失敗:', error);
      showError('修復失敗', error.message || '請稍後再試');
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-6 w-6" />
            用戶數據診斷工具
          </CardTitle>
          <CardDescription>
            全面檢查用戶的 Profile、推薦關係、獎勵記錄、任務狀態等數據完整性
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 輸入區 */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="userId">用戶 ID</Label>
              <Input
                id="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="輸入用戶 ID"
                className="font-mono"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleDiagnosis()}
                disabled={isLoading || !userId.trim()}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    診斷中...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    開始診斷
                  </>
                )}
              </Button>

              {result && (
                <Button
                  onClick={() => handleFix(false)}
                  disabled={isFixing}
                  variant="outline"
                >
                  {isFixing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      修復中...
                    </>
                  ) : (
                    <>
                      <Wrench className="mr-2 h-4 w-4" />
                      自動修復
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* 結果顯示 */}
          {result && (
            <div className="space-y-4 pt-4 border-t">
              {/* Profile 摘要 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">用戶資料</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-muted-foreground">Email：</span>
                      <span className="font-medium">{result.profile.email}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">姓名：</span>
                      <span className="font-medium">{result.profile.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">手機：</span>
                      <span className="font-medium">{result.profile.phone}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">註冊步驟：</span>
                      <span className="font-medium">Step {result.profile.registrationStep}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">帳號狀態：</span>
                      <span className="font-medium">{result.profile.accountStatus || '未設置'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">推薦碼：</span>
                      <span className="font-medium font-mono">{result.profile.referralCode || '未生成'}</span>
                    </div>
                    {result.profile.referredByCode && (
                      <div>
                        <span className="text-muted-foreground">使用的推薦碼：</span>
                        <span className="font-medium font-mono">{result.profile.referredByCode}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 嚴重問題 */}
              {result.issues.length > 0 && (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-red-700">
                      <XCircle className="h-5 w-5" />
                      嚴重問題 ({result.issues.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {result.issues.map((issue, index) => (
                        <li key={index} className="text-sm text-red-700">
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* 警告 */}
              {result.warnings.length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-yellow-700">
                      <AlertTriangle className="h-5 w-5" />
                      警告 ({result.warnings.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {result.warnings.map((warning, index) => (
                        <li key={index} className="text-sm text-yellow-700">
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* 信息摘要 */}
              {result.info.length > 0 && (
                <Card className="border-blue-200 bg-blue-50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
                      <Info className="h-5 w-5" />
                      信息摘要 ({result.info.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {result.info.map((info, index) => (
                        <li key={index} className="text-sm text-blue-700">
                          {info}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* 全部通過 */}
              {result.success && result.issues.length === 0 && result.warnings.length === 0 && (
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-5 w-5" />
                      檢查通過
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-green-700">
                      所有檢查通過，數據完整無誤！
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
