/**
 * Withdrawal History Component
 * 
 * Displays user's withdrawal history with filtering and pagination
 * 
 * @component WithdrawalHistory
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, RefreshCw, Calendar, CreditCard, AlertCircle } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface Withdrawal {
  id: string;
  amount: number;
  fee: number;
  totalAmount: number;
  status: 'Pending' | 'Completed' | 'Rejected';
  bankCode: string;
  bankName: string;
  accountNumber: string;
  createdAt: string | Date;
  processedAt?: string | Date | null;
  rejectedReason?: string | null;
}

interface WithdrawalData {
  withdrawals: Withdrawal[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  summary: {
    totalWithdrawn: number;
    totalFees: number;
    pendingCount: number;
    completedCount: number;
    rejectedCount: number;
  };
}

export function WithdrawalHistory() {
  const [data, setData] = useState<WithdrawalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  
  const { showToast } = useNotification();
  
  useEffect(() => {
    fetchHistory();
  }, [statusFilter]);
  
  const fetchHistory = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      const url = statusFilter 
        ? buildApiUrl(`/withdrawals-v2/history?status=${statusFilter}`)
        : buildApiUrl('/withdrawals-v2/history');
      
      const result = await apiRequestJson<{
        success: boolean;
        data: WithdrawalData;
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
      console.error('Failed to fetch withdrawal history:', error);
      showToast('載入提領記錄失敗', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };
  
  const handleRefresh = () => {
    fetchHistory(true);
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">處理中</Badge>;
      case 'Completed':
        return <Badge className="bg-green-100 text-green-800 border-green-300">已完成</Badge>;
      case 'Rejected':
        return <Badge className="bg-red-100 text-red-800 border-red-300">已拒絕</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }
  
  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          無法載入提領記錄
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">累計提領</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {data.summary.totalWithdrawn}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              點數
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">處理中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {data.summary.pendingCount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              筆
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">已完成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {data.summary.completedCount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              筆
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">累計手續費</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600">
              {data.summary.totalFees}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              點
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Filter and Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={statusFilter === '' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('')}
          >
            全部
          </Button>
          <Button
            variant={statusFilter === 'Pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('Pending')}
          >
            處理中
          </Button>
          <Button
            variant={statusFilter === 'Completed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('Completed')}
          >
            已完成
          </Button>
          <Button
            variant={statusFilter === 'Rejected' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('Rejected')}
          >
            已拒絕
          </Button>
        </div>
        
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
        >
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              更新中...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新整理
            </>
          )}
        </Button>
      </div>
      
      {/* Withdrawal List */}
      <Card>
        <CardHeader>
          <CardTitle>提領記錄</CardTitle>
          <CardDescription>
            共 {data.pagination.total} 筆記錄
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {data.withdrawals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p>尚無提領記錄</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.withdrawals.map((withdrawal) => (
                <div
                  key={withdrawal.id}
                  className="p-4 border rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(withdrawal.status)}
                        <span className="text-sm text-muted-foreground">
                          {formatDate(withdrawal.createdAt)}
                        </span>
                      </div>
                      
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {withdrawal.bankName || `銀行代碼: ${withdrawal.bankCode}`}
                          </span>
                          <span className="text-muted-foreground">
                            {withdrawal.accountNumber}
                          </span>
                        </div>
                        
                        {withdrawal.processedAt && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              處理時間：{formatDate(withdrawal.processedAt)}
                            </span>
                          </div>
                        )}
                        
                        {withdrawal.rejectedReason && (
                          <div className="flex items-start gap-2 text-red-600">
                            <AlertCircle className="h-4 w-4 mt-0.5" />
                            <span>拒絕原因：{withdrawal.rejectedReason}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-blue-600">
                        {withdrawal.amount}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        手續費 {withdrawal.fee} 點
                      </div>
                      <div className="text-sm font-medium mt-1">
                        總扣除 {withdrawal.totalAmount} 點
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
