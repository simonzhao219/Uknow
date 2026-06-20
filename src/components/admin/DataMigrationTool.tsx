import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { createClient } from '../../utils/supabase/client';
import { buildApiUrl } from '../../utils/apiClient';

interface MigrationDetail {
  listingId: string;
  status: 'success' | 'error';
  strategy?: string;
  referrerListingId?: string;
  note?: string;
  reason?: string;
}

interface MigrationResult {
  success: boolean;
  summary?: {
    total: number;
    migrated: number;
    skipped: number;
    errors: number;
  };
  details?: MigrationDetail[];
  error?: {
    message: string;
  };
}

export function DataMigrationTool() {
  const { showToast, showSuccess, showError } = useNotification();
  
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  const runMigration = async () => {
    try {
      setMigrating(true);
      setMigrationResult(null);
      
      const supabase = createClient();
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        showError('請先登入', '需要管理員權限');
        return;
      }
      
      showToast('開始遷移數據...', 'info');
      
      const response = await fetch(
        buildApiUrl('/admin/migrate-referrer-listing-ids'),
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error?.message || '遷移失敗');
      }
      
      setMigrationResult(result);
      
      if (result.success) {
        showSuccess(
          '數據遷移完成！',
          `成功遷移 ${result.summary.migrated} 個刊登`,
          [
            `總刊登數: ${result.summary.total}`,
            `成功遷移: ${result.summary.migrated}`,
            `跳過: ${result.summary.skipped}`,
            `失敗: ${result.summary.errors}`
          ]
        );
      } else {
        showError('遷移失敗', result.error?.message || '未知錯誤');
      }
      
    } catch (err: any) {
      console.error('遷移錯誤:', err);
      showError('遷移失敗', err.message || '請稍後再試');
      setMigrationResult({
        success: false,
        error: { message: err.message }
      });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>推薦數據遷移工具</CardTitle>
        <CardDescription>
          為舊數據添加 referrerListingId 字段（只需執行一次）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-900 mb-1">遷移說明</p>
              <ul className="text-amber-800 space-y-1 list-disc list-inside">
                <li>此工具會為所有舊刊登添加 referrerListingId 字段</li>
                <li>已有 referrerListingId 的刊登會自動跳過</li>
                <li>推薦者只有 1 個刊登：自動分配</li>
                <li>推薦者有多個刊登：分配給第一個並標記</li>
              </ul>
            </div>
          </div>
        </div>

        <Button 
          onClick={runMigration}
          disabled={migrating}
          className="w-full"
        >
          {migrating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              遷移中...
            </>
          ) : (
            '開始遷移'
          )}
        </Button>

        {migrationResult && (
          <div className="mt-4 space-y-4">
            {/* 統計摘要 */}
            {migrationResult.summary && (
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-center">
                  <p className="text-sm text-blue-600">總計</p>
                  <p className="text-xl font-bold text-blue-700">{migrationResult.summary.total}</p>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded text-center">
                  <p className="text-sm text-green-600">成功</p>
                  <p className="text-xl font-bold text-green-700">{migrationResult.summary.migrated}</p>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded text-center">
                  <p className="text-sm text-gray-600">跳過</p>
                  <p className="text-xl font-bold text-gray-700">{migrationResult.summary.skipped}</p>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded text-center">
                  <p className="text-sm text-red-600">失敗</p>
                  <p className="text-xl font-bold text-red-700">{migrationResult.summary.errors}</p>
                </div>
              </div>
            )}

            {/* 詳細信息 */}
            {migrationResult.details && migrationResult.details.length > 0 && (
              <div className="max-h-96 overflow-y-auto space-y-2">
                <p className="text-sm font-medium">遷移詳情：</p>
                {migrationResult.details.map((detail, index) => (
                  <div 
                    key={index}
                    className={`p-3 border rounded-lg text-sm ${
                      detail.status === 'success' 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {detail.status === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs truncate">{detail.listingId}</p>
                        {detail.strategy && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            {detail.strategy === 'single-listing' ? '單一刊登' : '多刊登-自動分配'}
                          </Badge>
                        )}
                        {detail.note && (
                          <p className="text-xs text-muted-foreground mt-1">{detail.note}</p>
                        )}
                        {detail.reason && (
                          <p className="text-xs text-red-600 mt-1">{detail.reason}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}