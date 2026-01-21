/**
 * 🔧 數據修復面板
 * 
 * 功能：
 * - 一鍵修復江梓豪的重複數據（三層級：江梓豪、黎仁傑、歐宥塏）
 * - 顯示修復進度和結果
 * - 自動處理認證（無需手動輸入 token）
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AlertCircle, CheckCircle, Loader, RefreshCw, Users } from 'lucide-react';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';

interface RepairResult {
  action: string;
  success: boolean;
  affected: number;
  details?: any;
}

interface AffectedUser {
  id: string;
  name: string;
  role: string;
}

interface RepairResponse {
  success: boolean;
  message?: string;
  affectedUsers?: AffectedUser[];
  refereeUserId?: string;
  referrerUserId?: string;
  results?: RepairResult[];
  error?: {
    message: string;
    code?: string;
    details?: string;
  };
}

export function DataRepairPanel() {
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<RepairResponse | null>(null);
  const { showSuccess, showError } = useNotification();

  const handleRepair = async () => {
    setIsRepairing(true);
    setRepairResult(null);

    try {
      const result = await apiRequestJson<RepairResponse>(
        buildApiUrl('/data-repair/repair-jiang-zihao'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      setRepairResult(result);

      if (result.success) {
        const affectedUserNames = result.affectedUsers?.map(u => u.name).join('、') || '相關用戶';
        
        showSuccess(
          '修復完成！',
          `江梓豪的重複數據已成功修復（影響：${affectedUserNames}）`,
          [
            '✅ 推薦碼已去重',
            '✅ 訂閱已合併',
            '✅ 推薦樹已校正（三層級）',
            '✅ 獎勵已重新計算',
            '✅ 任務進度已更新'
          ]
        );
      } else {
        showError(
          '修復失敗',
          result.error?.message || '未知錯誤'
        );
      }
    } catch (error: any) {
      console.error('修復失敗:', error);
      
      setRepairResult({
        success: false,
        error: {
          message: error.message || '修復過程中發生錯誤',
          details: error.toString()
        }
      });

      showError(
        '修復失敗',
        error.message || '修復過程中發生錯誤'
      );
    } finally {
      setIsRepairing(false);
    }
  };

  const getActionLabel = (action: string): string => {
    const labels: { [key: string]: string } = {
      remove_duplicate_referral_codes: '移除重複推薦碼',
      merge_duplicate_subscriptions: '合併重複訂閱',
      deduplicate_referral_tree: '去重推薦樹',
      remove_duplicate_reward_schedules: '刪除重複獎勵排程',
      recalculate_rewards: '校正獎勵金額',
      deduplicate_monthly_log: '去重月度日誌',
      recalculate_task_progress: '重新計算任務進度'
    };
    return labels[action] || action;
  };

  return (
    <div className="space-y-6">
      {/* 主卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            數據修復工具（三層級修復）
          </CardTitle>
          <CardDescription>
            修復重複付款導致的數據問題（影響推薦鏈：歐宥塏 → 黎仁傑 → 江梓豪）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 問題說明 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div className="space-y-3">
                <h3 className="font-medium text-yellow-900">檢測到重複數據</h3>
                
                {/* 推薦鏈條 */}
                <div className="bg-white rounded p-3 border border-yellow-200">
                  <p className="text-xs font-medium text-yellow-800 mb-2 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    推薦關係鏈
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded font-medium">
                      歐宥塏
                    </span>
                    <span className="text-yellow-600">→</span>
                    <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-medium">
                      黎仁傑
                    </span>
                    <span className="text-yellow-600">→</span>
                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                      江梓豪
                    </span>
                  </div>
                </div>
                
                <div className="text-sm text-yellow-800 space-y-1">
                  <p><strong>問題用戶：</strong>江梓豪 (6597c99d...)</p>
                  <p><strong>影響範圍：</strong>三層推薦關係</p>
                </div>
                
                <div className="text-sm text-yellow-800 mt-3">
                  <p className="font-medium mb-2">問題清單：</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="bg-white rounded p-2 border border-yellow-100">
                      <p className="font-medium text-xs mb-1">江梓豪（本人）</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs ml-2">
                        <li>2個推薦碼</li>
                        <li>2個訂閱記錄</li>
                      </ul>
                    </div>
                    <div className="bg-white rounded p-2 border border-yellow-100">
                      <p className="font-medium text-xs mb-1">黎仁傑（1代推薦人）</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs ml-2">
                        <li>推薦樹重複</li>
                        <li>獎勵重複發放（多發 10P）</li>
                        <li>11個重複排程</li>
                        <li>任務進度錯誤</li>
                      </ul>
                    </div>
                    <div className="bg-white rounded p-2 border border-yellow-100">
                      <p className="font-medium text-xs mb-1">歐宥塏（2代推薦人）</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs ml-2">
                        <li>推薦樹重複（2代）</li>
                        <li>獎勵重複發放</li>
                        <li>排程重複</li>
                        <li>任務進度錯誤</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 修復按鈕 */}
          <div className="flex justify-center">
            <Button
              onClick={handleRepair}
              disabled={isRepairing}
              size="lg"
              className="min-w-[200px]"
            >
              {isRepairing ? (
                <>
                  <Loader className="h-5 w-5 mr-2 animate-spin" />
                  修復中...
                </>
              ) : (
                <>
                  <RefreshCw className="h-5 w-5 mr-2" />
                  開始三層級修復
                </>
              )}
            </Button>
          </div>

          {/* 修復結果 */}
          {repairResult && (
            <div className="space-y-4">
              <div className="border-t pt-6">
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  {repairResult.success ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span>修復成功</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <span>修復失敗</span>
                    </>
                  )}
                </h3>

                {/* 影響用戶列表 */}
                {repairResult.success && repairResult.affectedUsers && (
                  <div className="mb-4 bg-blue-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-900 mb-2">影響的用戶：</p>
                    <div className="flex flex-wrap gap-2">
                      {repairResult.affectedUsers.map((user) => (
                        <div key={user.id} className="bg-white rounded px-3 py-1 border border-blue-200">
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.role}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {repairResult.success && repairResult.results && (
                  <div className="space-y-3">
                    {repairResult.results.map((result, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {result.success ? (
                            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-medium">
                              {getActionLabel(result.action)}
                            </p>
                            {result.details?.message && (
                              <p className="text-xs text-muted-foreground">
                                {result.details.message}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant={result.success ? 'default' : 'destructive'}>
                          {result.affected > 0 ? `${result.affected} 筆` : '無變更'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {!repairResult.success && repairResult.error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-900 font-medium">
                      {repairResult.error.message}
                    </p>
                    {repairResult.error.details && (
                      <p className="text-xs text-red-800 mt-2">
                        {repairResult.error.details}
                      </p>
                    )}
                    {repairResult.error.code && (
                      <p className="text-xs text-red-700 mt-1">
                        錯誤代碼: {repairResult.error.code}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 說明卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">修復說明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-3">
            <p className="font-medium">此工具將執行以下操作：</p>
            
            <div className="space-y-3">
              <div className="bg-gray-50 rounded p-3">
                <p className="font-medium text-gray-900 mb-1">步驟 1-3：江梓豪（本人）</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-2 text-xs">
                  <li>移除重複的推薦碼（保留最新）</li>
                  <li>合併重複的訂閱（保留最新記錄）</li>
                </ol>
              </div>
              
              <div className="bg-gray-50 rounded p-3">
                <p className="font-medium text-gray-900 mb-1">步驟 4-6：黎仁傑（1代推薦人）</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-2 text-xs">
                  <li>去重推薦樹（移除重複成員）</li>
                  <li>刪除重複的獎勵排程（11 個月）</li>
                  <li>校正獎勵金額（扣回多發的 10P）</li>
                  <li>去重月度日誌</li>
                  <li>重新計算任務進度</li>
                </ol>
              </div>
              
              <div className="bg-gray-50 rounded p-3">
                <p className="font-medium text-gray-900 mb-1">步驟 7-9：歐宥塏（2代推薦人）</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-2 text-xs">
                  <li>去重推薦樹（二代重複成員）</li>
                  <li>刪除重複的獎勵排程</li>
                  <li>校正獎勵金額（扣回多發的獎勵）</li>
                  <li>重新計算任務進度</li>
                </ol>
              </div>
            </div>
            
            <p className="text-xs text-yellow-600 mt-4 bg-yellow-50 rounded p-2">
              ⚠️ 注意：此操作會直接修改數據庫（三層推薦關係），執行前請確認。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}