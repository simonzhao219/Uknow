/**
 * Subscription Dashboard
 * 
 * Displays subscription status and management options
 * - Shows current status (Active/Canceled/Grace/Fail)
 * - Displays remaining days or grace period
 * - Allows cancel/renew subscription
 * 
 * @component SubscriptionDashboard
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  XOctagon,
  Calendar,
  DollarSign,
  RefreshCw,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';
import { CancellationDialog } from './CancellationDialog';
import { RenewalForm } from './RenewalForm';

interface Subscription {
  id: string;
  status: string;
  startDate: Date | string;
  endDate: Date | string;
  gracePeriodEnd: Date | string;
  paymentDate: Date | string;
  amount: number;
  isCanceled: boolean;
  canceledAt: Date | string | null;
}

interface SubscriptionData {
  subscription: Subscription;
  accountStatus: 'Active' | 'Canceled' | 'Grace' | 'Fail';
  daysRemaining: number;
  gracePeriodDays: number;
  isRenewable: boolean;
}

export function SubscriptionDashboard() {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRenewalForm, setShowRenewalForm] = useState(false);
  
  const { showToast, showSuccess } = useNotification();
  
  useEffect(() => {
    fetchSubscription();
  }, []);
  
  const fetchSubscription = async () => {
    setIsLoading(true);
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      const result = await apiRequestJson<{
        success: boolean;
        data: SubscriptionData;
        error?: { message: string };
      }>(buildApiUrl('/subscriptions-v2'), {
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
      console.error('Failed to fetch subscription:', error);
      showToast('載入訂閱資訊失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCancel = async () => {
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          subscription: Subscription;
          message: string;
          daysRemaining: number;
        };
        error?: { message: string };
      }>(buildApiUrl('/subscriptions-v2/cancel'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (result.success) {
        showSuccess('取消成功', result.data.message);
        setShowCancelDialog(false);
        fetchSubscription();
      } else {
        showToast(result.error?.message || '取消失敗', 'error');
      }
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      showToast('取消訂閱失敗，請稍後再試', 'error');
    }
  };
  
  const handleRenewalComplete = () => {
    setShowRenewalForm(false);
    fetchSubscription();
  };
  
  if (isLoading) {
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
          無法載入訂閱資訊
        </CardContent>
      </Card>
    );
  }
  
  const { subscription, accountStatus, daysRemaining, gracePeriodDays, isRenewable } = data;
  
  // Status configuration
  const statusConfig = {
    Active: {
      color: 'green',
      icon: CheckCircle2,
      title: '訂閱中',
      description: '您的訂閱正常使用中'
    },
    Canceled: {
      color: 'yellow',
      icon: XCircle,
      title: '已取消續訂',
      description: '訂閱期滿後將不會自動續訂'
    },
    Grace: {
      color: 'orange',
      icon: AlertCircle,
      title: '寬限期',
      description: '訂閱已到期，請儘快續訂以恢復服務'
    },
    Fail: {
      color: 'red',
      icon: XOctagon,
      title: '已失效',
      description: '帳號永久失效，需重新訂閱'
    }
  };
  
  const config = statusConfig[accountStatus];
  const Icon = config.icon;
  
  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className={`
        border-2
        ${accountStatus === 'Active' ? 'border-green-500 bg-green-50' : ''}
        ${accountStatus === 'Canceled' ? 'border-yellow-500 bg-yellow-50' : ''}
        ${accountStatus === 'Grace' ? 'border-orange-500 bg-orange-50' : ''}
        ${accountStatus === 'Fail' ? 'border-red-500 bg-red-50' : ''}
      `}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Icon className={`
              h-8 w-8
              ${accountStatus === 'Active' ? 'text-green-600' : ''}
              ${accountStatus === 'Canceled' ? 'text-yellow-600' : ''}
              ${accountStatus === 'Grace' ? 'text-orange-600' : ''}
              ${accountStatus === 'Fail' ? 'text-red-600' : ''}
            `} />
            <div>
              <CardTitle>{config.title}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Subscription Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">訂閱期限</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(subscription.startDate).toLocaleDateString('zh-TW')} - {new Date(subscription.endDate).toLocaleDateString('zh-TW')}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">年費金額</p>
                <p className="text-sm text-muted-foreground">
                  NT$ {subscription.amount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          
          {/* Status-specific Info */}
          {(accountStatus === 'Active' || accountStatus === 'Canceled') && daysRemaining > 0 && (
            <div className="bg-white rounded-lg p-4 border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">剩餘天數</span>
                <span className={`text-2xl font-bold ${accountStatus === 'Active' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {daysRemaining} 天
                </span>
              </div>
              {accountStatus === 'Canceled' && (
                <p className="text-xs text-muted-foreground mt-2">
                  到期後將進入 60 天寬限期
                </p>
              )}
            </div>
          )}
          
          {accountStatus === 'Grace' && gracePeriodDays > 0 && (
            <div className="bg-white rounded-lg p-4 border border-orange-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-900">寬限期剩餘</span>
              </div>
              <p className="text-2xl font-bold text-orange-600 mb-2">
                {gracePeriodDays} 天
              </p>
              <p className="text-xs text-orange-700">
                請儘快續訂以保留您的推薦碼和點數。寬限期結束後，帳號將永久失效，所有點數將歸零。
              </p>
            </div>
          )}
          
          {accountStatus === 'Fail' && (
            <div className="bg-white rounded-lg p-4 border border-red-200">
              <div className="flex items-center gap-2 mb-2">
                <XOctagon className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-900">帳號已失效</span>
              </div>
              <p className="text-sm text-red-700">
                您的推薦碼已失效，點數已歸零。重新訂閱後，系統將為您生成新的推薦碼。
              </p>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            {accountStatus === 'Active' && !subscription.isCanceled && (
              <Button
                onClick={() => setShowCancelDialog(true)}
                variant="outline"
                className="flex-1"
              >
                取消續訂
              </Button>
            )}
            
            {isRenewable && (
              <Button
                onClick={() => setShowRenewalForm(true)}
                className="flex-1"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {accountStatus === 'Grace' ? '補繳續訂' : '重新訂閱'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Info Cards */}
      {accountStatus === 'Canceled' && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">取消續訂說明</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>您仍可使用服務至訂閱期限結束</li>
                  <li>期限結束後將進入 60 天寬限期</li>
                  <li>寬限期內可隨時補繳續訂</li>
                  <li>寬限期後帳號將永久失效</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Dialogs */}
      <CancellationDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        daysRemaining={daysRemaining}
      />
      
      <RenewalForm
        open={showRenewalForm}
        onClose={() => setShowRenewalForm(false)}
        onComplete={handleRenewalComplete}
        accountStatus={accountStatus}
      />
    </div>
  );
}
