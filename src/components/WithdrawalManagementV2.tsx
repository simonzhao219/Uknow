/**
 * Withdrawal Management V2
 * 
 * Main page for point withdrawal management
 * Displays balance, withdrawal form, and history
 * 
 * @component WithdrawalManagementV2
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ArrowLeft, Wallet, AlertCircle } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { WithdrawalForm } from './withdrawal/WithdrawalForm';
import { WithdrawalHistory } from './withdrawal/WithdrawalHistory';
import { useNotification } from './notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../utils/apiClient';
import { getAccessToken } from '../utils/auth';

export function WithdrawalManagementV2() {
  const navigate = useBackNavigation();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const { showToast } = useNotification();
  
  useEffect(() => {
    fetchUserProfile();
  }, [refreshTrigger]);
  
  const fetchUserProfile = async () => {
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      // Fetch user profile (assuming there's a profile endpoint)
      const result = await apiRequestJson<{
        success: boolean;
        data?: any;
        error?: { message: string };
      }>(buildApiUrl('/profile-v2'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (result.success && result.data) {
        setUserProfile(result.data);
      } else {
        showToast('載入用戶資料失敗', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      showToast('載入用戶資料失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleWithdrawalSuccess = () => {
    // Refresh user profile and history
    setRefreshTrigger(prev => prev + 1);
  };
  
  const canWithdraw = userProfile?.accountStatus === 'Active' || 
                      userProfile?.accountStatus === 'Canceled';
  
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={navigate} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">點數提領</h1>
          <p className="text-muted-foreground">管理您的點數提領申請</p>
        </div>
      </div>
      
      {/* Balance Card */}
      <Card className="border-l-4 border-l-blue-600">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            <span>目前點數餘額</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <div className="text-5xl font-bold text-blue-600">
              {userProfile?.pointBalance || 0}
            </div>
            <div className="text-2xl text-muted-foreground mb-2">點</div>
          </div>
          
          {userProfile && (
            <div className="mt-4 text-sm text-muted-foreground">
              帳號狀態：
              <span className={`ml-2 font-medium ${
                canWithdraw ? 'text-green-600' : 'text-red-600'
              }`}>
                {userProfile.accountStatus}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Status Warning */}
      {userProfile && !canWithdraw && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div className="text-sm text-red-800">
            <p className="font-medium mb-1">無法提領點數</p>
            <p>
              您的帳號狀態為 <span className="font-medium">{userProfile.accountStatus}</span>，
              只有「Active」或「Canceled」狀態的會員可以申請提領點數。
            </p>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Withdrawal Form */}
        <div className="lg:col-span-1">
          {userProfile && canWithdraw ? (
            <WithdrawalForm
              currentBalance={userProfile.pointBalance || 0}
              accountStatus={userProfile.accountStatus}
              onSuccess={handleWithdrawalSuccess}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Wallet className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p>目前無法申請提領</p>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Withdrawal History */}
        <div className="lg:col-span-2">
          <WithdrawalHistory key={refreshTrigger} />
        </div>
      </div>
    </div>
  );
}
