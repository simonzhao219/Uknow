import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { FilterChip } from '../common/FilterChip';
import {
  Calendar,
  Receipt,
  Loader2,
  Users,
  Gift,
  TrendingDown,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { apiRequestJson, buildApiUrl, ApiError } from '../../utils/apiClient';
import { formatTimestamp } from '../../utils/referralFormatter';
import { formatRewardDetail, isReferralSource } from '../../utils/rewardHistory';
import type {
  RewardHistoryRecord as RewardRecord,
  RewardHistoryResponse,
  RewardSourceCategory,
} from '@contract';

interface RewardHistoryProps {
  refreshTrigger?: number; // ✅ 刷新觸發器
}

// 來源分類 → 顯示標籤 / 圖示 / 顏色（KEY 來自 @contract 的 enum＝單一真相；
// label/icon/color 是純 UI 呈現）。退款用琥珀色與收入分家，避免被誤讀為新收入。
type SourceMeta = {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
};
const SOURCE_META: Record<RewardSourceCategory, SourceMeta> = {
  referral_payment: {
    label: '推薦獎勵·付款',
    Icon: Users,
    badgeClass:
      'border-transparent bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  },
  referral_task_renewal: {
    label: '推薦獎勵·任務續約',
    Icon: Gift,
    badgeClass:
      'border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  withdrawal: {
    label: '點數提領',
    Icon: TrendingDown,
    badgeClass: 'border-transparent bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  withdrawal_refund: {
    label: '提領退款',
    Icon: RotateCcw,
    badgeClass:
      'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  adjustment_manual: {
    label: '人工調整',
    Icon: SlidersHorizontal,
    badgeClass: 'border-transparent bg-muted text-muted-foreground',
  },
};
const FALLBACK_META: SourceMeta = {
  label: '其他',
  Icon: Receipt,
  badgeClass: 'border-transparent bg-muted text-muted-foreground',
};

// 可篩選的來源分類（刻意不含 adjustment_manual——目前無端點產生，會是永遠空的分類）。
const SOURCE_FILTERS: RewardSourceCategory[] = [
  'referral_payment',
  'referral_task_renewal',
  'withdrawal',
  'withdrawal_refund',
];

export function RewardHistory({ refreshTrigger }: RewardHistoryProps = {}) {
  const [history, setHistory] = useState<RewardRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 多選來源篩選；空陣列 = 全部。
  const [selectedSources, setSelectedSources] = useState<RewardSourceCategory[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const isFiltered = selectedSources.length > 0;

  const fetchHistory = async (isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      const currentOffset = isLoadMore ? offset : 0;

      // 來源篩選下推到後端：帶 CSV ?source=，後端只回該分類集合、count 也是該集合總數，
      // 分頁才不會漏掉後頁紀錄（見 index.ts /rewards/history）。空選＝不帶 param＝全部。
      const sourceParam = selectedSources.length ? `&source=${selectedSources.join(',')}` : '';

      const result = await apiRequestJson<RewardHistoryResponse>(
        buildApiUrl(`/rewards/history?limit=50&offset=${currentOffset}${sourceParam}`),
      );

      if (result.success) {
        const newHistory = result.data.history || [];

        if (isLoadMore) {
          setHistory((prev) => [...prev, ...newHistory]);
        } else {
          setHistory(newHistory);
        }

        setTotal(result.data.total || 0);
        setOffset(currentOffset + newHistory.length);
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
      setIsLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    fetchHistory(true);
  };

  const toggleSource = (s: RewardSourceCategory) => {
    setSelectedSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };
  const clearSources = () => setSelectedSources([]);

  // 初始載入 + 篩選變更：切換來源時重新從第一頁抓（非追加），offset 由 fetchHistory 歸零。
  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSources]);

  // 監聽 refreshTrigger 變化並重新獲取數據
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchHistory(); // 非追加：內部 offset 歸零
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          獎勵明細
        </CardTitle>
        <CardDescription>查看您的Point收支記錄，可依來源篩選</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 篩選器：來源分類多選 chips（全部 = 清空選取）。手機自動換行。 */}
        <div className="flex flex-wrap gap-2">
          <FilterChip label="全部" selected={!isFiltered} onToggle={clearSources} />
          {SOURCE_FILTERS.map((s) => (
            <FilterChip
              key={s}
              label={SOURCE_META[s].label}
              selected={selectedSources.includes(s)}
              onToggle={() => toggleSource(s)}
            />
          ))}
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
            {history.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {isFiltered ? '此分類尚無記錄' : '尚無獎勵記錄'}
                </p>
                {!isFiltered && (
                  <p className="text-sm text-muted-foreground mt-2">完成推薦或任務後將顯示在此處</p>
                )}
              </div>
            ) : (
              history.map((record) => {
                const meta = SOURCE_META[record.sourceCategory] ?? FALLBACK_META;
                const isReferral = isReferralSource(record.sourceCategory);
                // 細節行與代數 badge 皆走純函式 / helper（見 utils/rewardHistory）：
                // 提領重算成「提領 X P + 手續費 15 P」；推薦類用（後端已遮罩的）名字快照。
                const detail = formatRewardDetail(record);
                const Icon = meta.Icon;

                return (
                  <div
                    key={record.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* 左側內容 */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* 第一行：來源分類 badge（+ 推薦代數次級 badge） */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={meta.badgeClass}>
                            <Icon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                          {isReferral && record.generation ? (
                            <Badge variant="outline" className="text-muted-foreground">
                              第 {record.generation} 代
                            </Badge>
                          ) : null}
                        </div>

                        {/* 第二行：細節資訊 */}
                        <p className="text-sm text-muted-foreground truncate">{detail}</p>

                        {/* 第三行：入帳日期時間 */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="truncate">{formatTimestamp(record.issuedAt)}</span>
                        </div>
                      </div>

                      {/* 右側：金額 +（未篩選時）餘額 */}
                      <div className="flex flex-col items-end justify-center gap-1 shrink-0 self-center">
                        <span
                          className={`font-medium ${record.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}
                        >
                          {record.amount >= 0 ? '+' : ''}
                          {record.amount}P
                        </span>
                        {/* 逐列餘額是「全域」流水餘額；篩選時中間紀錄被隱藏會讓餘額看似跳動，
                            故只在「全部」檢視顯示，避免誤導。 */}
                        {!isFiltered && record.balance !== undefined && (
                          <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                            {record.balance.toLocaleString()}P
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 已加載筆數顯示 */}
        {!isLoading && !error && total > 0 && (
          <div className="text-center text-sm text-muted-foreground">
            已顯示 {Math.min(history.length, total)} / {total} 筆記錄
          </div>
        )}

        {/* 加載更多按鈕 */}
        {!isLoading && !error && offset < total && (
          <div className="text-center">
            <Button onClick={handleLoadMore} variant="outline" size="sm" disabled={isLoadingMore}>
              {isLoadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  加載中...
                </>
              ) : (
                '加載更多'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
