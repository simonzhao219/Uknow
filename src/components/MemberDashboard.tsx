import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { UserContext } from '../App';
import { Users, Award, Settings, User, Home, CheckSquare, Gift, Info, ArrowLeft, Copy, CreditCard, Calendar, Loader2, AlertTriangle, Shield } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { useFeatures } from '../contexts/FeatureContext';
import { useNotification } from './notifications/NotificationContext';
import { Badge } from './ui/badge';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';
import { useDataCache } from '../contexts/DataCacheContext'; // ✅ 新增：数据缓存
import { CancelSubscriptionDialog } from './subscription/CancelSubscriptionDialog';
import { JoinReferralProgramDialog } from './referral/JoinReferralProgramDialog';

export function MemberDashboard() {
  const { user, setUser } = useContext(UserContext);
  const handleBack = useBackNavigation();
  const { isFeatureEnabled } = useFeatures();
  const { showToast, showSuccess, showError, showWarning, showInfo } = useNotification();
  const { getCache, setCache, hasCache, clearCache } = useDataCache(); // ✅ 新增：使用数据缓存

  // 訂閱狀態
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isProcessingSubscription, setIsProcessingSubscription] = useState(false);
  
  // ✅ 取消訂閱Dialog狀態
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  
  // ✅ 加入推薦計畫 Dialog 狀態
  const [showJoinReferralDialog, setShowJoinReferralDialog] = useState(false);
  
  // ✅ 新增：顯示會員資料修改說明
  const handleShowProfileInfo = () => {
    showInfo(
      '修改會員資料',
      '會員資料一經註冊後無法自行修改。',
      [
        '如需更改基本資料，請透過 LINE 聯繫客服：',
        '📱 LINE 官方帳號：@Uknow'
      ]
    );
  };

  // ✅ 優化：獲取訂閱狀態（使用缓存）
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      try {
        console.log('🔄 MemberDashboard: 獲取訂閱狀態...');
        
        const result = await apiRequestJson<{
          success: boolean;
          data: {
            hasSubscription: boolean;
            status?: string;
            activeUntil?: string;
            daysRemaining?: number;
            message?: string;
          };
        }>(buildApiUrl('/subscriptions/status'));

        console.log('✅ MemberDashboard: 訂閱狀態:', result);
        
        // ✅ 存入缓存
        setCache('subscriptionStatus', result.data);
        setSubscriptionData(result.data);
      } catch (err) {
        console.error('❌ MemberDashboard: 獲取訂閱狀態失敗:', err);
        
        // 如果是 401 錯誤，不顯示錯誤（用戶可能未登入）
        if (err instanceof ApiError && err.status === 401) {
          console.log('⚠️ MemberDashboard: 用戶未登入，跳過訂閱狀態獲取');
        } else {
          showToast('無法獲取訂閱狀態', 'error');
        }
      } finally {
        setIsLoadingSubscription(false);
      }
    };

    if (user?.id) {
      // ✅ 优先使用缓存
      if (hasCache('subscriptionStatus')) {
        console.log('🎯 MemberDashboard: 使用缓存的订阅状态');
        const cached = getCache('subscriptionStatus');
        setSubscriptionData(cached);
        setIsLoadingSubscription(false);
      } else {
        console.log('🔄 MemberDashboard: 无缓存，加载新数据');
        fetchSubscriptionStatus();
      }
    } else {
      setIsLoadingSubscription(false);
    }
  }, [user?.id]);

  // 複製推薦碼到剪貼板
  const handleCopyReferralCode = () => {
    if (!user?.referralCode) {
      showToast('推薦碼不存在', 'error');
      return;
    }

    // 使用傳統的 execCommand 方法（更可靠，不受 Clipboard API 權限限制）
    const textArea = document.createElement('textarea');
    textArea.value = user.referralCode;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
      showToast('推薦碼已複製到剪貼板', 'success');
    } catch (err) {
      console.error('複製失敗:', err);
      showToast('複製失敗，請手動複製', 'error');
    }
    
    document.body.removeChild(textArea);
  };

  // 取得訂閱狀態的顯示資訊
  const getSubscriptionStatusInfo = () => {
    // 後端返回的狀態：active, cancelled, grace, expired
    const status = subscriptionData?.status || 'cancelled';
    const statusMap = {
      active: { label: '訂閱中', color: 'bg-green-100 text-green-800 border-green-300'},
      cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-800 border-gray-300'},
      grace: { label: '寬限期', color: 'bg-yellow-100 text-yellow-800 border-yellow-300'},
      expired: { label: '已失效', color: 'bg-red-100 text-red-800 border-red-300'},
    };
    return statusMap[status] || statusMap.cancelled;
  };

  const subscriptionInfo = getSubscriptionStatusInfo();

  // 重新獲取訂閱狀態
  const refreshSubscriptionStatus = async () => {
    // ✅ 清除缓存，强制重新加载
    clearCache('subscriptionStatus');
    
    setIsLoadingSubscription(true);
    try {
      const result = await apiRequestJson<{
        success: boolean;
        data: {
          hasSubscription: boolean;
          status?: string;
          activeUntil?: string;
          daysRemaining?: number;
          message?: string;
        };
      }>(buildApiUrl('/subscriptions/status'));

      // ✅ 存入缓存
      setCache('subscriptionStatus', result.data);
      setSubscriptionData(result.data);
    } catch (err) {
      console.error('❌ 刷新訂閱狀態失敗:', err);
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  // ✅ 取消訂閱 - 啟動三步驟流程
  const handleCancelSubscription = () => {
    setShowCancelDialog(true);
  };

  // ✅ 確認取消訂閱（調用 API）
  const handleConfirmCancel = async (idNumber: string) => {
    try {
      const result = await apiRequestJson(
        buildApiUrl('/subscriptions/cancel'),
        {
          method: 'POST',
          body: JSON.stringify({ idNumber })
        }
      );

      if (result.success) {
        showSuccess('訂閱已取消', '您的訂閱已成功取消');
        setShowCancelDialog(false);
        await refreshSubscriptionStatus();
      } else {
        throw new Error(result.error?.message || '取消訂閱失敗');
      }
    } catch (err) {
      console.error('❌ 取消訂閱失敗:', err);
      throw new Error(err instanceof Error ? err.message : '取消訂閱失敗，請稍後再試');
    }
  };

  // ✅ 關閉 Dialog
  const handleCloseDialog = () => {
    setShowCancelDialog(false);
  };

  // 恢復訂閱
  const handleResumeSubscription = async () => {
    setIsProcessingSubscription(true);
    
    try {
      const result = await apiRequestJson(
        buildApiUrl('/subscriptions/resume'),
        { method: 'POST' }
      );
      
      if (result.success) {
        showSuccess('訂閱已恢復', '您的訂閱已成功恢復');
        await refreshSubscriptionStatus();
      } else {
        showError('恢復失敗', result.error?.message || '恢復訂閱失敗');
      }
    } catch (err) {
      console.error('❌ 恢復訂閱失敗:', err);
      showError('恢復失敗', err instanceof Error ? err.message : '恢復訂閱失敗');
    } finally {
      setIsProcessingSubscription(false);
    }
  };

  // 補繳
  const handleMakeupSubscription = async () => {
    // ✅ 補繳前用 Toast 提示用戶
    showToast('正在處理補繳，請稍候...', 'info');
    
    setIsProcessingSubscription(true);
    
    try {
      const result = await apiRequestJson(
        buildApiUrl('/subscriptions/makeup'),
        { method: 'POST' }
      );
      
      if (result.success) {
        showSuccess('補繳成功', '您的訂閱已恢復，下次扣款日：' + result.data.nextPaymentDate);
        await refreshSubscriptionStatus();
      } else {
        showError('補繳失敗', result.error?.message || '補繳失敗');
      }
    } catch (err) {
      console.error('❌ 補繳失敗:', err);
      showError('補繳失敗', err instanceof Error ? err.message : '補繳失敗');
    } finally {
      setIsProcessingSubscription(false);
    }
  };

  // 計算寬限期剩餘天數
  const calculateGraceDaysLeft = (graceStartedAt: string) => {
    const graceStart = new Date(graceStartedAt);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - graceStart.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, 60 - daysPassed);
  };

  // ✅ 加入推薦計畫成功回調
  const handleJoinReferralSuccess = (referralCode: string, joinedAt: string) => {
    if (user) {
      const updatedUser = {
        ...user,
        referralProgramJoined: true,
        referralProgramJoinedAt: joinedAt
      };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">會員中心</h1>
          <p className="text-muted-foreground">歡迎回來，{user?.name}</p>
        </div>
      </div>

      {/* 會員基本資訊 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            會員資訊
          </CardTitle>
          {/* ✅ 新增：資訊 icon（取代原本的編輯按鈕）*/}
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleShowProfileInfo}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="會員資料修改說明"
          >
            <Info className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">真實姓名</p>
            <p className="font-medium">{user?.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">聯絡電話</p>
            <p className="font-medium">{user?.phone}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium truncate">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">我的推薦碼</p>
            <div className="flex items-center gap-2">
              {user?.referralProgramJoined ? (
                // ✅ 已加入推薦計畫 → 顯示推薦碼
                <>
                  <p className="font-medium font-mono text-lg tracking-wider text-purple-600">
                    {user?.referralCode || '未生成'}
                  </p>
                  {user?.referralCode && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={handleCopyReferralCode}
                      title="複製推薦碼"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </>
              ) : (
                // ✅ 未加入推薦計畫 → 顯示加入按鈕
                <Button
                  onClick={() => setShowJoinReferralDialog(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  size="sm"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  加入推薦計畫
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 快速操作區域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isFeatureEnabled('serviceProviderManagement') && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5 text-blue-600" />
                刊登管理
              </CardTitle>
              <CardDescription>
                管理已刊登的服務
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/service-providers">查看管理</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isFeatureEnabled('referralManagement') && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-purple-600" />
                推薦管理
              </CardTitle>
              <CardDescription>
                推薦好友賺Point
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/referrals">推薦管理</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isFeatureEnabled('taskCenter') && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckSquare className="h-5 w-5 text-green-600" />
                任務中心
              </CardTitle>
              <CardDescription>
                完成任務賺Point
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/tasks">任務中心</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isFeatureEnabled('rewardSystem') && (
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gift className="h-5 w-5 text-orange-600" />
                獎勵回饋
              </CardTitle>
              <CardDescription>
                查看Point收益
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link to="/rewards">Point管理</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        
      </div>
      
      {/* 訂閱狀態 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-3">
            <CreditCard className="h-5 w-5" />
            <span>我的訂閱</span>
            {subscriptionData?.hasSubscription && (
              <Badge variant="outline" className={`${subscriptionInfo.color} border`}>
                {subscriptionInfo.label}
              </Badge>
            )}
          </CardTitle>
          {/* 根據訂閱狀態顯示不同按鈕 */}
          {!isLoadingSubscription && subscriptionData?.hasSubscription && (
            <>
              {/* 訂閱中 - 顯示取消訂閱按鈕（灰色，低調處理）*/}
              {subscriptionData.status === 'active' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleCancelSubscription}
                  disabled={isProcessingSubscription}
                >
                  取消訂閱
                </Button>
              )}
              
              {/* 已取消 - 顯示恢復訂閱按鈕 */}
              {subscriptionData.status === 'cancelled' && (
                <Button 
                  variant="default" 
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleResumeSubscription}
                  disabled={isProcessingSubscription}
                >
                  {isProcessingSubscription ? '處理中...' : '恢復訂閱'}
                </Button>
              )}
              
              {/* 寬限期 - 顯示立即補繳按鈕 */}
              {subscriptionData.status === 'grace' && (
                <Button 
                  variant="default" 
                  size="sm"
                  className="bg-yellow-600 hover:bg-yellow-700"
                  onClick={handleMakeupSubscription}
                  disabled={isProcessingSubscription}
                >
                  {isProcessingSubscription ? '處理中...' : '立即補繳'}
                </Button>
              )}
              
              {/* 永久失效 - 顯示開始新訂閱按鈕 */}
              {subscriptionData.status === 'expired' && (
                <Button 
                  variant="default" 
                  size="sm"
                  asChild
                >
                  <Link to="/payment/checkout">
                    開始新訂閱
                  </Link>
                </Button>
              )}
            </>
          )}
        </CardHeader>
        <CardContent>
          {isLoadingSubscription ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">載入訂閱資訊中...</span>
            </div>
          ) : !subscriptionData?.hasSubscription ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">您尚未訂閱任何服務</p>
              <Button variant="default" asChild>
                <Link to="/payment/checkout">
                  開始訂閱
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 寬限期警告（置頂顯示）*/}
              {subscriptionData.status === 'grace' && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-900">
                        扣款失敗，訂閱即將失效
                      </p>
                      {subscriptionData.lastPaymentFailureReason && (
                        <p className="text-sm text-yellow-800 mt-1">
                          上次扣款失敗原因：{subscriptionData.lastPaymentFailureReason}
                        </p>
                      )}
                      {subscriptionData.graceStartedAt && (
                        <p className="text-sm text-yellow-800">
                          請在 {calculateGraceDaysLeft(subscriptionData.graceStartedAt)} 內完成補繳，否則訂閱將永久失效。
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* 扣款日期（僅訂閱中和寬限期顯示）*/}
              {(subscriptionData.status === 'active' || subscriptionData.status === 'grace') && subscriptionData.nextPaymentDate && (
                <div className="text-sm">
                  <span className="text-muted-foreground">扣款日期：</span>
                  <span className="font-medium">
                    {new Date(subscriptionData.nextPaymentDate).toLocaleDateString('zh-TW', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    }).replace(/\//g, '/')}
                  </span>
                </div>
              )}
              
              {/* 訂閱週期（本期）*/}
              {subscriptionData.currentPeriodStart && subscriptionData.currentPeriodEnd && (
                <div className="text-sm">
                  <span className="text-muted-foreground">訂閱��期：</span>
                  <span className="font-medium">
                    {new Date(subscriptionData.currentPeriodStart).toLocaleDateString('zh-TW', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    }).replace(/\//g, '/')}
                    {' ~ '}
                    {new Date(subscriptionData.currentPeriodEnd).toLocaleDateString('zh-TW', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    }).replace(/\//g, '/')}
                  </span>
                </div>
              )}
              
              {/* 下個週期（僅訂閱中和寬限期顯示）*/}
              {(subscriptionData.status === 'active' || subscriptionData.status === 'grace') && 
               subscriptionData.nextPeriodStart && subscriptionData.nextPeriodEnd && (
                <div className="text-sm">
                  <span className="text-muted-foreground">下個週期：</span>
                  <span className="font-medium">
                    {new Date(subscriptionData.nextPeriodStart).toLocaleDateString('zh-TW', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    }).replace(/\//g, '/')}
                    {' ~ '}
                    {new Date(subscriptionData.nextPeriodEnd).toLocaleDateString('zh-TW', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    }).replace(/\//g, '/')}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* ✅ 取消訂閱流程 - Dialog 條件渲染 */}
      {showCancelDialog && subscriptionData?.hasSubscription && (
        <CancelSubscriptionDialog
          subscription={{
            status: subscriptionData.status,
            currentPeriodEnd: subscriptionData.currentPeriodEnd,
            autoRenew: subscriptionData.autoRenew || false
          }}
          isOpen={showCancelDialog}
          onClose={handleCloseDialog}
          onConfirm={handleConfirmCancel}
        />
      )}

      {/* ✅ 加入推薦計畫 Dialog */}
      <JoinReferralProgramDialog
        open={showJoinReferralDialog}
        onClose={() => setShowJoinReferralDialog(false)}
        onSuccess={handleJoinReferralSuccess}
      />
    </div>
  );
}