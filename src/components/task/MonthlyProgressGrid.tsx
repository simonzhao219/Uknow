import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { formatReferee } from '../../utils/referralFormatter';

interface MonthlyProgress {
  month: string;              // "2024-01"
  hasReferral: boolean;       // 該月是否有推薦
  firstReferral: {
    listingId: string;
    userName: string;
    listingName: string;
    createdAt: string;
  } | null;
}

interface MonthlyProgressGridProps {
  monthlyProgress: MonthlyProgress[];
  onClose: () => void;
}

export function MonthlyProgressGrid({ monthlyProgress, onClose }: MonthlyProgressGridProps) {
  // 計算完成的月數
  const completedMonths = monthlyProgress.filter(m => m.hasReferral).length;
  const totalMonths = monthlyProgress.length;
  
  // 格式化月份顯示（YYYY-MM → YYYY/MM）
  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '';
    return monthStr.replace('-', '/');
  };
  
  // 格式化日期顯示（ISO → MM/DD）
  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  };
  
  return (
    <div className="mt-4 p-4 border rounded-lg bg-muted/30">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h4 className="font-medium">月度推薦進度</h4>
          <Badge className="bg-green-600 text-white">
            {completedMonths} / {totalMonths} 已完成
          </Badge>
        </div>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* 月度網格 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {monthlyProgress.map((month, index) => (
          <div 
            key={month.month}
            className={`
              p-3 border rounded-lg transition-all
              ${month.hasReferral 
                ? 'bg-green-50 border-green-200' 
                : 'bg-gray-50 border-gray-200'
              }
            `}
          >
            {/* 月份標題 */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {formatMonth(month.month)}
              </span>
              {month.hasReferral ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-gray-400" />
              )}
            </div>
            
            {/* 推薦人信息 */}
            {month.firstReferral ? (
              <div className="space-y-1">
                <p className="text-xs truncate font-medium">
                  {formatReferee(month.firstReferral.userName, month.firstReferral.listingName)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(month.firstReferral.createdAt)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">尚未推薦</p>
            )}
          </div>
        ))}
      </div>
      
      {/* 說明文字 */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-700">
          💡 每個月顯示第一筆推薦記錄。連續12個月都有推薦即可完成任務。
        </p>
      </div>
    </div>
  );
}
