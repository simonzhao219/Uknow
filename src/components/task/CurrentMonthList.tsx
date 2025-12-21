import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Eye, X } from 'lucide-react';
import { formatReferee, formatTimestamp } from '../../utils/referralFormatter';

interface MonthlyReferralRecord {
  listingId: string;
  userId: string;
  userName: string;
  listingName: string;
  city?: string;
  serviceType?: string;
  referrer?: {
    userId: string;
    userName: string;
    listingId: string;
    listingName: string;
  };
  createdAt: string;
}

interface CurrentMonthReferrals {
  month: string;              // "2024-12"
  total: number;              // 本月總推薦數
  referrals: MonthlyReferralRecord[];  // 前10筆
}

interface CurrentMonthListProps {
  data: CurrentMonthReferrals;
  onClose: () => void;
}

export function CurrentMonthList({ data, onClose }: CurrentMonthListProps) {
  const navigate = useNavigate();
  
  // 格式化月份顯示（YYYY-MM → YYYY年MM月）
  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    return `${year}年${month}月`;
  };
  
  return (
    <div className="mt-4 p-4 border rounded-lg bg-muted/30">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h4 className="font-medium">
            {formatMonth(data.month)} 推薦清單
          </h4>
          <Badge className="bg-blue-600 text-white">
            {data.referrals.length} / 10
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
      
      {/* 列表（最多10筆，高度限制） */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {data.referrals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            本月尚未有推薦記錄
          </div>
        ) : (
          data.referrals.map((record, index) => (
            <div 
              key={record.listingId}
              className="relative p-3 pr-10 border-l-4 border-l-blue-600 bg-blue-50 border rounded-lg"
            >
              {/* 序號 */}
              <div className="absolute left-3 top-3 w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">
                {index + 1}
              </div>
              
              {/* 內容區（左側留空給序號） */}
              <div className="pl-8">
                {/* 第 1 行：被推薦人 */}
                <p className="font-medium truncate mb-1">
                  {formatReferee(record.userName, record.listingName)}
                </p>
                
                {/* 第 2 行：城市·服務類別（如果有）*/}
                {record.city && record.serviceType && (
                  <p className="text-sm truncate mb-1 text-muted-foreground">
                    {record.city} · {record.serviceType}
                  </p>
                )}
                
                {/* 第 3 行：時間戳 */}
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(record.createdAt)}
                </p>
              </div>
              
              {/* 預覽按鈕（右側） */}
              <button
                onClick={() => navigate(`/service-providers/${record.listingId}`)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                title="預覽刊登詳細內容"
              >
                <Eye className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
      
      {/* 總計提示 */}
      {data.total > data.referrals.length && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700">
            💡 本月共推薦 {data.total} 人，此處顯示前 {data.referrals.length} 筆記錄。
          </p>
        </div>
      )}
      
      {/* 說明文字 */}
      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-700">
          💡 顯示本月推薦的前10筆記錄。推薦10位用戶即可完成本月任務。
        </p>
      </div>
    </div>
  );
}
