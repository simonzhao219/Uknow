/**
 * 🔑 管理員設置組件
 * 
 * 功能：
 * - 檢查當前用戶是否為管理員
 * - 如果系統還沒有管理員，允許當前用戶設為管理員
 * - 顯示設置狀態
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Shield, CheckCircle, AlertCircle, Loader, UserCog } from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';

interface AdminCheckResponse {
  success: boolean;
  isAdmin: boolean;
  hasExistingAdmin: boolean;
  canBecomeAdmin: boolean;
  userId?: string;
  userName?: string;
  userEmail?: string;
}

interface SetAdminResponse {
  success: boolean;
  message?: string;
  profile?: {
    userId: string;
    name: string;
    email: string;
    role: string;
  };
  error?: {
    message: string;
    code?: string;
  };
}

export function AdminSetup() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSetting, setIsSetting] = useState(false);
  const [adminStatus, setAdminStatus] = useState<AdminCheckResponse | null>(null);
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    setIsLoading(true);
    try {
      const result = await apiRequestJson<AdminCheckResponse>(
        buildApiUrl('/admin-setup/check')
      );

      setAdminStatus(result);
      console.log('管理員狀態:', result);
    } catch (error: any) {
      console.error('檢查管理員狀態失敗:', error);
      showError('檢查失敗', error.message || '無法檢查管理員狀態');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetAdmin = async () => {
    setIsSetting(true);
    try {
      const result = await apiRequestJson<SetAdminResponse>(
        buildApiUrl('/admin-setup/set-self-admin'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (result.success) {
        showSuccess(
          '設置成功！',
          '您已成為平台管理員',
          ['現在可以使用所有管理功能']
        );
        // 重新檢查狀態
        await checkAdminStatus();
      } else {
        showError(
          '設置失敗',
          result.error?.message || '無法設置管理員權限'
        );
      }
    } catch (error: any) {
      console.error('設置管理員失敗:', error);
      showError(
        '設置失敗',
        error.message || '設置管理員權限時發生錯誤'
      );
    } finally {
      setIsSetting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">檢查管理員狀態...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!adminStatus) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
            <p className="text-sm text-muted-foreground">無法檢查管理員狀態</p>
            <Button onClick={checkAdminStatus} variant="outline">
              重試
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 當前狀態卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            管理員權限設置
          </CardTitle>
          <CardDescription>
            管理平台的所有功能需要管理員權限
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 用戶信息 */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">當前用戶</span>
              <Badge variant={adminStatus.isAdmin ? 'default' : 'secondary'}>
                {adminStatus.isAdmin ? '管理員' : '普通用戶'}
              </Badge>
            </div>
            
            {adminStatus.userName && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">姓名</span>
                  <span className="text-sm font-medium">{adminStatus.userName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium">{adminStatus.userEmail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">用戶 ID</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {adminStatus.userId?.substring(0, 8)}...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 已是管理員 */}
          {adminStatus.isAdmin && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-green-900 mb-1">您已是管理員</h3>
                  <p className="text-sm text-green-800">
                    您擁有完整的平台管理權限，可以使用所有管理功能。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 可以成為管理員 */}
          {!adminStatus.isAdmin && adminStatus.canBecomeAdmin && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <UserCog className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-900 mb-1">系統尚未有管理員</h3>
                    <p className="text-sm text-blue-800">
                      您可以將自己設為平台管理員，獲得完整的管理權限。
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={handleSetAdmin}
                  disabled={isSetting}
                  size="lg"
                  className="min-w-[200px]"
                >
                  {isSetting ? (
                    <>
                      <Loader className="h-5 w-5 mr-2 animate-spin" />
                      設置中...
                    </>
                  ) : (
                    <>
                      <Shield className="h-5 w-5 mr-2" />
                      設為管理員
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* 已有其他管理員 */}
          {!adminStatus.isAdmin && !adminStatus.canBecomeAdmin && adminStatus.hasExistingAdmin && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-yellow-900 mb-1">需要管理員授權</h3>
                  <p className="text-sm text-yellow-800">
                    系統已有管理員，您需要聯繫現有管理員為您設置權限。
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 說明卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">管理員權限說明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-3">
            <p className="font-medium">管理員可以執行以下操作：</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>管理所有會員資料</li>
              <li>審核獎金提領申請</li>
              <li>執行數據修復和驗證</li>
              <li>查看平台統計數據</li>
              <li>設置其他管理員</li>
            </ul>
            
            <div className="border-t pt-3 mt-4">
              <p className="font-medium text-xs text-muted-foreground mb-2">安全提示：</p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-xs text-muted-foreground">
                <li>管理員權限非常重要，請妥善保管帳號</li>
                <li>首次設置管理員不需要其他授權</li>
                <li>後續新增管理員需要現有管理員授權</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
