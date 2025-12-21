/**
 * Admin Dashboard Component
 * 
 * Main dashboard for platform administrators
 * - System statistics overview
 * - Quick action buttons
 * - Recent activities
 * 
 * @component AdminDashboard
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { 
  Users, 
  CreditCard, 
  Bell, 
  Settings,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingWithdrawals: number;
  totalWithdrawalAmount: number;
  systemHealth: {
    database: 'ok' | 'warning' | 'error';
    api: 'ok' | 'warning' | 'error';
    cron: 'ok' | 'warning' | 'error';
  };
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useNotification();
  
  useEffect(() => {
    fetchDashboardStats();
  }, []);
  
  const fetchDashboardStats = async () => {
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        navigate('/login');
        return;
      }
      
      // TODO: 實作管理員統計 API
      // const result = await apiRequestJson<{ success: boolean; data: DashboardStats }>(
      //   buildApiUrl('/admin/stats'),
      //   { headers: { 'Authorization': `Bearer ${token}` } }
      // );
      
      // Mock data for now
      setStats({
        totalUsers: 156,
        activeUsers: 142,
        pendingWithdrawals: 8,
        totalWithdrawalAmount: 45000,
        systemHealth: {
          database: 'ok',
          api: 'ok',
          cron: 'ok'
        }
      });
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
      showToast('載入統計資料失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const getHealthIcon = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
    }
  };
  
  const getHealthText = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return '正常';
      case 'warning':
        return '警告';
      case 'error':
        return '錯誤';
    }
  };
  
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">管理後台</h1>
        <p className="text-muted-foreground">系統管理與監控中心</p>
      </div>
      
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <span>總用戶數</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {stats?.totalUsers || 0}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              活躍：{stats?.activeUsers || 0}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <span>待審���提領</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {stats?.pendingWithdrawals || 0}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              筆
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              <span>待提領金額</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {stats?.totalWithdrawalAmount?.toLocaleString() || 0}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              點
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <span>系統狀態</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>資料庫</span>
                <div className="flex items-center gap-2">
                  {getHealthIcon(stats?.systemHealth.database || 'ok')}
                  <span>{getHealthText(stats?.systemHealth.database || 'ok')}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>API</span>
                <div className="flex items-center gap-2">
                  {getHealthIcon(stats?.systemHealth.api || 'ok')}
                  <span>{getHealthText(stats?.systemHealth.api || 'ok')}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>快速操作</CardTitle>
          <CardDescription>
            常用管理功能入口
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-2"
              onClick={() => navigate('/admin/users')}
            >
              <Users className="h-8 w-8 text-blue-600" />
              <span className="font-medium">用戶管理</span>
              <span className="text-xs text-muted-foreground">
                管理用戶帳號與權限
              </span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-2"
              onClick={() => navigate('/admin/withdrawals')}
            >
              <CreditCard className="h-8 w-8 text-green-600" />
              <span className="font-medium">提領審核</span>
              <span className="text-xs text-muted-foreground">
                審核用戶提領申請
              </span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-2"
              onClick={() => navigate('/admin/notifications')}
            >
              <Bell className="h-8 w-8 text-yellow-600" />
              <span className="font-medium">系統通知</span>
              <span className="text-xs text-muted-foreground">
                發送系統公告
              </span>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-2"
              onClick={() => navigate('/admin/settings')}
            >
              <Settings className="h-8 w-8 text-gray-600" />
              <span className="font-medium">系統設定</span>
              <span className="text-xs text-muted-foreground">
                調整系統參數
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* System Health Details */}
      <Card>
        <CardHeader>
          <CardTitle>系統健康檢查</CardTitle>
          <CardDescription>
            各項服務運行狀態
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {getHealthIcon(stats?.systemHealth.database || 'ok')}
                <div>
                  <p className="font-medium">PostgreSQL 資料庫</p>
                  <p className="text-sm text-muted-foreground">
                    連接正常，查詢效能良好
                  </p>
                </div>
              </div>
              <span className="text-sm text-green-600">
                {getHealthText(stats?.systemHealth.database || 'ok')}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {getHealthIcon(stats?.systemHealth.api || 'ok')}
                <div>
                  <p className="font-medium">API 服務</p>
                  <p className="text-sm text-muted-foreground">
                    所有端點響應正常
                  </p>
                </div>
              </div>
              <span className="text-sm text-green-600">
                {getHealthText(stats?.systemHealth.api || 'ok')}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {getHealthIcon(stats?.systemHealth.cron || 'ok')}
                <div>
                  <p className="font-medium">排程任務</p>
                  <p className="text-sm text-muted-foreground">
                    每日發放與狀態檢查正常運行
                  </p>
                </div>
              </div>
              <span className="text-sm text-green-600">
                {getHealthText(stats?.systemHealth.cron || 'ok')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
