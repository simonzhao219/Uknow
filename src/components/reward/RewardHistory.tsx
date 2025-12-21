/**
 * Reward History Component
 * 
 * Displays user's reward history with pagination
 * Shows all issued rewards
 * 
 * @component RewardHistory
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Gift,
  Calendar,
  TrendingUp,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface RewardHistoryItem {
  id: string;
  type: string;
  amount: number;
  description: string;
  sourceUserName: string;
  generation: number | null;
  monthNumber: number | null;
  createdAt: Date | string;
}

interface RewardHistoryData {
  history: RewardHistoryItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export function RewardHistory() {
  const [data, setData] = useState<RewardHistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState<string>('all');
  
  const { showToast } = useNotification();
  
  const ITEMS_PER_PAGE = 20;
  
  useEffect(() => {
    fetchHistory(currentPage);
  }, [currentPage, filterType]);
  
  const fetchHistory = async (page: number) => {
    setIsLoading(true);
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      const offset = (page - 1) * ITEMS_PER_PAGE;
      let url = buildApiUrl(`/rewards-v2/history?limit=${ITEMS_PER_PAGE}&offset=${offset}`);
      
      if (filterType !== 'all') {
        url += `&type=${filterType}`;
      }
      
      const result = await apiRequestJson<{
        success: boolean;
        data: RewardHistoryData;
        error?: { message: string };
      }>(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (result.success) {
        setData(result.data);
      } else {
        showToast(result.error?.message || '載入失敗', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
      showToast('載入歷史失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const handleNextPage = () => {
    if (data?.pagination.hasMore) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const handleFilterChange = (type: string) => {
    setFilterType(type);
    setCurrentPage(1); // Reset to first page
  };
  
  if (isLoading && !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }
  
  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          無法載入獎勵歷史
        </CardContent>
      </Card>
    );
  }
  
  const { history, pagination } = data;
  const totalPages = Math.ceil(pagination.total / ITEMS_PER_PAGE);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>獎勵歷史</CardTitle>
        <CardDescription>
          查看所有已發放的獎勵（共 {pagination.total} 筆）
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            onClick={() => handleFilterChange('all')}
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
          >
            全部
          </Button>
          <Button
            onClick={() => handleFilterChange('referral')}
            variant={filterType === 'referral' ? 'default' : 'outline'}
            size="sm"
          >
            推薦獎勵
          </Button>
          <Button
            onClick={() => handleFilterChange('task')}
            variant={filterType === 'task' ? 'default' : 'outline'}
            size="sm"
          >
            任務獎勵
          </Button>
        </div>
        
        {/* History List */}
        <div className="space-y-3 mb-6">
          {history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p>尚未有獎勵記錄</p>
              <p className="text-sm mt-1">推薦朋友或完成任務即可獲得獎勵</p>
            </div>
          ) : (
            history.map((item) => (
              <HistoryCard key={item.id} item={item} />
            ))
          )}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              第 {currentPage} 頁，共 {totalPages} 頁
            </p>
            
            <div className="flex gap-2">
              <Button
                onClick={handlePrevPage}
                disabled={currentPage === 1 || isLoading}
                variant="outline"
                size="sm"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                上一頁
              </Button>
              
              <Button
                onClick={handleNextPage}
                disabled={!pagination.hasMore || isLoading}
                variant="outline"
                size="sm"
              >
                下一頁
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// History Card Component
function HistoryCard({ item }: { item: RewardHistoryItem }) {
  const generationColors = {
    1: 'bg-green-100 text-green-800',
    2: 'bg-purple-100 text-purple-800',
    3: 'bg-orange-100 text-orange-800'
  };
  
  const isReferralReward = item.type.startsWith('referral_gen');
  
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          {isReferralReward ? (
            <TrendingUp className="h-5 w-5 text-blue-600" />
          ) : (
            <Gift className="h-5 w-5 text-blue-600" />
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium truncate">
              {item.description}
            </p>
            {item.generation && (
              <Badge 
                className={generationColors[item.generation as 1 | 2 | 3]}
              >
                第{item.generation}代
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
            <div className="flex items-center gap-1">
              <span className="font-medium text-green-600">+{item.amount} 點</span>
            </div>
            
            {item.sourceUserName !== '系統' && (
              <span className="truncate">來源：{item.sourceUserName}</span>
            )}
            
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>{new Date(item.createdAt).toLocaleDateString('zh-TW')}</span>
            </div>
          </div>
          
          {item.monthNumber && (
            <p className="text-xs text-muted-foreground">
              第 {item.monthNumber} 個月獎勵
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
