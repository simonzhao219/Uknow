import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Calendar, TrendingUp, TrendingDown, Receipt, Loader2 } from 'lucide-react';
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
  
  // ✅ 提領相關：申請日期（提領點數和手續費會有此欄位）
  requestedAt?: string;
  
  // ✅ 提領詳細信息（僅 withdrawal_with_fee 類型有此欄位）
  withdrawalDetails?: {
    netAmount: number;    // 淨提領額
    fee: number;          // 手續費
    totalAmount: number;  // 總扣款額
  };
  
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
  
  // ��� 新增餘額欄位
  balance?: number;
}

interface RewardHistoryProps {
  refreshTrigger?: number;  // ✅ 新增：刷新觸發器
}

export function RewardHistory({ refreshTrigger }: RewardHistoryProps = {}) {
  const [history, setHistory] = useState<RewardRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('all');

  // ✅ 提取獲取歷史的邏輯為獨立函數
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

  // 初始載入
  useEffect(() => {
    fetchHistory();
  }, []);
  
  // ✅ 監聽 refreshTrigger 變化並重新獲取數據
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchHistory();
    }
  }, [refreshTrigger]);

  // ✅ 新增：格式化明細顯示邏輯
  const getFormattedDetail = (record: RewardRecord) => {
    // 特殊處理：提領申請類型（withdrawal_pending）
    if (record.type === 'withdrawal_pending') {
      const totalAmount = Math.abs(record.amount);  // 1015
      const fee = 15;  // 固定手續費
      const withdrawalAmount = totalAmount - fee;  // 1000
      
      return `${withdrawalAmount} P + 手續費 ${fee} P`;  // ✅ 格式化為規格要求
    }
    
    // 其他類型保持原有邏輯
    return null;  // null 表示使用原有邏輯
  };

  // 篩選獎勵記錄
  const filteredHistory = history.filter(record => {
    if (filterType === 'all') return true;
    
    if (filterType === 'referral') {
      return record.type.startsWith('referral_');
    }
    
    if (filterType === 'task') {
      // ✅ 修復：支持 task_ 和 mission_ 兩種格式
      return record.type.startsWith('task_') || record.type.startsWith('mission_');
    }
    
    if (filterType === 'withdrawal') {
      // ✅ 新增：點數提領篩選（支持新舊格式 + withdrawal_pending）
      return record.type === 'withdrawal_with_fee' || 
             record.type === 'withdrawal' || 
             record.type === 'withdrawal_fee' ||
             record.type === 'withdrawal_pending' ||
             record.type === 'withdrawal_completed';
    }
    
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
          查看您的Point收入記錄
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
                <SelectItem value="withdrawal">點數提領</SelectItem>
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
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  {/* 解析 description 為種類和細節 */}
                  {(() => {
                    let type = '';
                    let detail = '';
                    
                    // ✅ 特殊處理：提領申請類型（withdrawal_pending）
                    if (record.type === 'withdrawal_pending') {
                      type = '提領申請';  // ✅ 固定標題
                      detail = getFormattedDetail(record) || '—';  // 使用格式化函數
                    }
                    // ✅ 檢查是否為提領類型（支持新舊格式）
                    else if (record.type === 'withdrawal_with_fee' || 
                        record.type === 'withdrawal' || 
                        record.type === 'withdrawal_fee') {
                      // 提領類型：使用 description 作為標題
                      type = record.description;
                      
                      // ✅ 優先顯示詳細拆分（新記錄 withdrawal_with_fee）
                      if (record.withdrawalDetails) {
                        const { netAmount, fee } = record.withdrawalDetails;
                        detail = ` ${Math.abs(netAmount).toLocaleString()}P + 手續費 ${fee}P`;
                      } else {
                        // 向後兼容：舊記錄（withdrawal/withdrawal_fee）顯示申請日期
                        detail = record.requestedAt 
                          ? `申請日期：${formatTimestamp(record.requestedAt)}`
                          : '—';
                      }
                    } else {
                      // 推薦獎勵格式：「一代推薦-細節」或「任務獎勵 - 細節」
                      if (record.description.includes(' - ')) {
                        const [t, ...d] = record.description.split(' - ');
                        type = t.trim();
                        detail = d.join(' - ').trim();
                      } else {
                        const dashIndex = record.description.indexOf('-');
                        if (dashIndex !== -1) {
                          type = record.description.substring(0, dashIndex).trim();
                          detail = record.description.substring(dashIndex + 1).trim();
                        } else {
                          type = record.description;
                          detail = '';
                        }
                      }
                    }
                    
                    return (
                      <div className="flex items-start justify-between gap-4">
                        {/* 左侧内容 */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* 第一行：種類圖標 + 標題 */}
                          <div className="flex items-center gap-2">
                            {record.amount >= 0 ? (
                              <TrendingUp className="h-4 w-4 text-green-600 shrink-0" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-600 shrink-0" />
                            )}
                            <span className="font-medium truncate">{type}</span>
                          </div>
                          
                          {/* 第二行：細節資訊 */}
                          <p className="text-sm text-muted-foreground truncate">
                            {detail || '—'}
                          </p>
                          
                          {/* 第三行：入帳日期時間 */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span className="truncate">{formatTimestamp(record.issuedAt)}</span>
                          </div>
                        </div>
                        
                        {/* 右侧：金額 + 餘額（垂直居中）*/}
                        <div className="flex flex-col items-end justify-center gap-1 shrink-0 self-center">
                          <span className={`font-medium ${record.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {record.amount >= 0 ? '+' : ''}{record.amount}P
                          </span>
                          {record.balance !== undefined && (
                            <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                              {/* <span className="text-muted-foreground">餘額</span>*/}
                              {record.balance.toLocaleString()}P
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}