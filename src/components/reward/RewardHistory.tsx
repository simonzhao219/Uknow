import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Calendar, TrendingUp, Receipt, Loader2 } from 'lucide-react';
import { apiRequestJson, buildApiUrl, ApiError } from '../../utils/apiClient';
import { formatReferee, formatReferrer, formatTimestamp } from '../../utils/referralFormatter';

/**
 * 獎勵記錄（新格式）
 */
interface RewardRecord {
  id: string;
  type: string;
  amount: number;
  description: string;
  issuedAt: string;
  
  // ✅ 推薦獎勵的完整信息
  referee?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  referrer?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  generation?: number;
  monthNumber?: number;
}

export function RewardHistory() {
  const [history, setHistory] = useState<RewardRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('all');

  // 獲取獎勵歷史
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // ✅ 使用統一的 API 請求工具
        const result = await apiRequestJson<{ success: boolean; data: { history: RewardRecord[] } }>(
          buildApiUrl('/rewards/history?limit=50')
        );
        
        if (result.success) {
          setHistory(result.data.history || []);
        } else {
          throw new Error('獲取獎勵歷史失敗');
        }
      } catch (err) {
        console.error('獲取獎勵歷史錯誤:', err);
        
        if (err instanceof ApiError && err.status === 401) {
          setError('登入已過期，請重新登入');
        } else {
          setError(err instanceof Error ? err.message : '獲取獎勵歷史失敗');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  // 篩選獎勵記錄
  const filteredHistory = history.filter(record => {
    if (filterType === 'all') return true;
    if (filterType === 'referral') return record.type.startsWith('referral_');
    if (filterType === 'task') return record.type.startsWith('task_');
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          獎勵明細
        </CardTitle>
        <CardDescription>
          查看���的Point收入記錄
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 篩選器 */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="選擇獎勵類型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部類型</SelectItem>
                <SelectItem value="referral">推薦獎勵</SelectItem>
                <SelectItem value="task">任務獎勵</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 載入狀態 */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* 錯誤狀態 */}
        {error && (
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} size="sm">
              重新載入
            </Button>
          </div>
        )}

        {/* 獎勵記錄列表 */}
        {!isLoading && !error && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">尚無獎勵記錄</p>
                <p className="text-sm text-muted-foreground mt-2">
                  完成推薦或任務後將顯示在此處
                </p>
              </div>
            ) : (
              filteredHistory.map((record) => (
                <div 
                  key={record.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <TrendingUp className="h-4 w-4 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate mb-1">{record.description}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatTimestamp(record.issuedAt)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="font-medium text-green-600">
                      +{record.amount}P
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}