import React, { useContext, useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { UserContext } from '../App';
import { Plus, Calendar, Settings, AlertTriangle, ArrowLeft, Loader2, PlayCircle, Ban } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { useNotification } from './notifications/NotificationContext';
import { YEARLY_PRICE } from '../utils/constants';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { projectId } from '../utils/supabase/info';
import { createClient } from '../utils/supabase/client';

// ============================================
// 資料介面
// ============================================

interface Listing {
  id: string;
  userId: string;
  name: string;
  city: string;
  districts: string[];
  gender: '男' | '女';
  description: string;
  photos: string[];
  contactMethods: { type: string; value: string }[];
  createdAt: string;
  referralCode: string;
  referredBy?: string;
  activeUntil: string;
  nextPaymentDate: string;
  accumulatedPoints?: number;
  cancelledAt?: string;
}

interface SubscriptionCardData {
  id: string;
  serviceProviderName: string;
  city: string;
  status: 'active' | 'cancelled' | 'inactive';
  startDate: string;
  activeUntil: string;
  nextPaymentDate: string;
  suspendedDate?: string;
  accumulatedPoints?: number;
  cancelledAt?: string;
}

// ============================================
// 輔助函式
// ============================================

/**
 * 將 Listing 轉換為 SubscriptionCardData
 */
function transformToSubscriptionCard(listing: Listing): SubscriptionCardData {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const activeUntilDate = new Date(listing.activeUntil);
  activeUntilDate.setHours(0, 0, 0, 0);
  
  let status: 'active' | 'cancelled' | 'inactive';
  
  if (activeUntilDate >= today) {
    if (listing.cancelledAt) {
      status = 'cancelled';
    } else {
      status = 'active';
    }
  } else {
    status = 'inactive';
  }
  
  let suspendedDate: string | undefined;
  if (status === 'inactive') {
    const suspended = new Date(activeUntilDate);
    suspended.setDate(suspended.getDate() + 1);
    suspendedDate = suspended.toISOString().split('T')[0];
  }
  
  return {
    id: listing.id,
    serviceProviderName: listing.name,
    city: listing.city,
    status,
    startDate: listing.createdAt,
    activeUntil: listing.activeUntil,
    nextPaymentDate: listing.nextPaymentDate,
    suspendedDate,
    accumulatedPoints: listing.accumulatedPoints,
    cancelledAt: listing.cancelledAt
  };
}

/**
 * 計算下次週期的起始日和結束日（固定年費）
 */
function calculateNextCycle(activeUntil: string): {
  startDate: string;
  endDate: string;
} {
  const nextStart = new Date(activeUntil);
  nextStart.setDate(nextStart.getDate() + 1);
  
  const nextEnd = new Date(nextStart);
  nextEnd.setFullYear(nextEnd.getFullYear() + 1);
  nextEnd.setDate(nextEnd.getDate() - 1);
  
  return {
    startDate: nextStart.toISOString().split('T')[0],
    endDate: nextEnd.toISOString().split('T')[0]
  };
}

// ============================================
// 主組件
// ============================================

export function SubscriptionManagement() {
  const { user } = useContext(UserContext);
  const { showSuccess, showWarning, showToast } = useNotification();
  const navigate = useBackNavigation();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionCardData[]>([]);

  // ============================================
  // 資料獲取
  // ============================================

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('請先登入');
        return;
      }
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/subscriptions`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const responseText = await response.text();
      
      if (!response.ok) {
        let errorMessage = '無法獲取訂閱資料';
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          console.error('無法解析錯誤響應:', responseText);
        }
        throw new Error(`${errorMessage} (狀態碼: ${response.status})`);
      }
      
      const result = JSON.parse(responseText);
      
      if (result.success) {
        const subscriptionData = result.data.listings.map((listing: Listing) => 
          transformToSubscriptionCard(listing)
        );
        setSubscriptions(subscriptionData);
      } else {
        throw new Error(result.error?.message || '獲取訂閱資料失敗');
      }
      
    } catch (err: any) {
      console.error('獲取訂閱資料錯誤:', err);
      setError(err.message || '載入失敗，請稍後再試');
      showToast(err.message || '載入訂閱資料失敗', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // 操作處理函式
  // ============================================

  // 取消訂閱
  const handleCancelSubscription = async (subscriptionId: string) => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        showToast('請先登入', 'error');
        return;
      }
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/subscriptions/${subscriptionId}/change-plan`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'cancel'
          })
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        showWarning(
          '訂閱已取消',
          `服務者「${subscription?.serviceProviderName}」的訂閱已成功取消`,
          [
            `取消日期：${new Date().toLocaleDateString('zh-TW')}`,
            `將在 ${subscription?.activeUntil} 到期時停止顯示`,
            '相關推薦 Point 將無法提領',
            '您可以隨時繼續訂閱此服務者'
          ]
        );
        
        setSubscriptions(subs => 
          subs.map(s => 
            s.id === subscriptionId 
              ? { ...s, status: 'cancelled', cancelledAt: result.data.cancelledAt }
              : s
          )
        );
      } else {
        throw new Error(result.error?.message || '取消訂閱失敗');
      }
      
    } catch (error: any) {
      console.error('取消訂閱失敗:', error);
      showToast(error.message || '取消訂閱失敗', 'error');
    }
  };

  // 繼續訂閱（恢復已取消的訂閱）
  const handleResumeSubscription = async (subscriptionId: string) => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        showToast('請先登入', 'error');
        return;
      }
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/subscriptions/${subscriptionId}/resume`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        showSuccess(
          '訂閱已恢復',
          `服務者「${subscription?.serviceProviderName}」的訂閱已成功恢復`,
          [
            '訂閱將繼續至當前週期結束',
            `有效期至：${subscription?.activeUntil}`,
            `年費方案：$${YEARLY_PRICE.toLocaleString()}/年`
          ]
        );
        
        setSubscriptions(subs => 
          subs.map(s => 
            s.id === subscriptionId 
              ? { ...s, status: 'active', cancelledAt: undefined }
              : s
          )
        );
      } else {
        throw new Error(result.error?.message || '恢復訂閱失敗');
      }
      
    } catch (error: any) {
      console.error('恢復訂閱失敗:', error);
      showToast(error.message || '恢復訂閱失敗', 'error');
    }
  };

  // 重新啟用（停用後重新訂閱，固定年費）
  const handleReactivateSubscription = async (subscriptionId: string) => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    
    if (!subscription) return;
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        showToast('請先登入', 'error');
        return;
      }
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/subscriptions/${subscriptionId}/reactivate`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            option: 'restart'
          })
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        showSuccess(
          '訂閱重新啟用成功！',
          `服務者「${subscription.serviceProviderName}」的訂閱已重新啟用`,
          [
            `累積的 ${subscription.accumulatedPoints || 0} P 已清零`,
            '新的訂閱週期從今日開始',
            `年費方案：$${YEARLY_PRICE.toLocaleString()}/年`
          ]
        );
        
        // 重新獲取訂閱資料
        fetchSubscriptions();
      } else {
        throw new Error(result.error?.message || '重新啟用訂閱失敗');
      }
      
    } catch (error: any) {
      console.error('重新啟用訂閱失敗:', error);
      showToast(error.message || '重新啟用訂閱失敗', 'error');
    }
  };

  // ============================================
  // 派生狀態
  // ============================================

  const sortedSubscriptions = useMemo(() => {
    const statusPriority = {
      'inactive': 0,
      'cancelled': 1,
      'active': 2
    };
    
    return [...subscriptions].sort((a, b) => {
      return statusPriority[a.status] - statusPriority[b.status];
    });
  }, [subscriptions]);

  const inactiveSubscriptions = subscriptions.filter(s => s.status === 'inactive');

  // ============================================
  // Loading & Error 狀態
  // ============================================

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={navigate} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">訂閱管理</h1>
            <p className="text-muted-foreground">管理您的服務者廣告訂閱</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">載入訂閱資料中...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={navigate} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">訂閱管理</h1>
            <p className="text-muted-foreground">管理您的服務者廣告訂閱</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={fetchSubscriptions}>重試</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================
  // 主介面渲染
  // ============================================

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={navigate} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">訂閱管理</h1>
            <p className="text-muted-foreground">管理您的服務者廣告訂閱</p>
          </div>
        </div>
        <Button asChild>
          <Link to="/service-providers/create">
            <Plus className="h-4 w-4 mr-2" />
            刊登新服務
          </Link>
        </Button>
      </div>

      {/* 停用訂閱警告 */}
      {inactiveSubscriptions.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            您有 {inactiveSubscriptions.length} 個服務者訂閱處於停用狀態。停用期間，相關推薦碼產生的Point無法提領。請重新啟用訂閱或聯繫客服以了解詳情。
          </AlertDescription>
        </Alert>
      )}

      {/* 訂閱列表 */}
      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">尚未有任何訂閱</h3>
            <p className="text-muted-foreground mb-6">
              開始刊登您的專業服務者，建立第一個訂閱
            </p>
            <Button asChild>
              <Link to="/service-providers/create">
                <Plus className="h-4 w-4 mr-2" />
                新增第一個服務者
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedSubscriptions.map((subscription) => {
            return (
              <Card key={subscription.id}>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* 訂閱基本資訊 */}
                    <div className="flex-1 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold">{subscription.serviceProviderName}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="default">年繳方案</Badge>
                            <Badge variant={
                              subscription.status === 'active' ? 'default' : 
                              subscription.status === 'cancelled' ? 'secondary' : 
                              'destructive'
                            }>
                              {subscription.status === 'active' ? '活躍中' : 
                               subscription.status === 'cancelled' ? '取消訂閱' : 
                               '已停用'}
                            </Badge>
                            {subscription.cancelledAt && subscription.status === 'cancelled' && (
                              <Badge variant="outline">
                                取消日期：{new Date(subscription.cancelledAt).toLocaleDateString('zh-TW')}
                              </Badge>
                            )}
                            {subscription.suspendedDate && subscription.status === 'inactive' && (
                              <Badge variant="outline">
                                停用日期：{subscription.suspendedDate}
                              </Badge>
                            )}
                            {subscription.status === 'active' && (
                              <Badge variant="outline">
                                扣款日期：{new Date(subscription.nextPaymentDate).toLocaleDateString('zh-TW')}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        {/* 平板和桌面版：按鈕在右側 */}
                        <div className="hidden md:flex gap-2">
                          {subscription.status === 'active' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Ban className="h-4 w-4 mr-1" />
                                  取消訂閱
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>確認取消訂閱</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    您確定要取消「{subscription.serviceProviderName}」的訂閱嗎？
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                
                                <div className="mt-3 space-y-2 text-sm">
                                  <div>• 將在 {subscription.activeUntil} 到期時停止顯示</div>
                                  <div>• 相關推薦 Point 將無法提領</div>
                                  <div>• 您可以隨時繼續訂閱此服務者</div>
                                </div>
                                
                                <AlertDialogFooter>
                                  <AlertDialogCancel>返回</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleCancelSubscription(subscription.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    確認取消
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}

                          {subscription.status === 'cancelled' && (
                            <Button 
                              variant="default" 
                              size="sm"
                              onClick={() => handleResumeSubscription(subscription.id)}
                            >
                              <PlayCircle className="h-4 w-4 mr-1" />
                              繼續訂閱
                            </Button>
                          )}

                          {subscription.status === 'inactive' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="default" size="sm">
                                  <PlayCircle className="h-4 w-4 mr-1" />
                                  重新啟用
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>重新啟用訂閱</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    重新啟用「{subscription.serviceProviderName}」的訂閱
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                
                                <div className="mt-4 bg-muted p-4 rounded-lg space-y-3">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">訂閱方案</span>
                                    <span className="font-medium">年繳方案（唯一方案）</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">起始日期</span>
                                    <span className="font-medium">{new Date().toLocaleDateString('zh-TW')}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">累積 Points</span>
                                    <span className="font-medium text-orange-600">清零（{subscription.accumulatedPoints || 0} P）</span>
                                  </div>
                                  <div className="border-t pt-3 flex justify-between">
                                    <span className="font-semibold">付款金額</span>
                                    <span className="text-xl font-bold text-primary">${YEARLY_PRICE.toLocaleString()}</span>
                                  </div>
                                </div>
                                
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleReactivateSubscription(subscription.id)}>
                                    確認付款 ${YEARLY_PRICE.toLocaleString()}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>

                      {/* 訂閱詳情 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">方案費用：</span>
                            <span className="font-medium">${YEARLY_PRICE.toLocaleString()}/年</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">本次週期：</span>
                            <span>{new Date(subscription.startDate).toLocaleDateString('zh-TW')} - {new Date(subscription.activeUntil).toLocaleDateString('zh-TW')}</span>
                          </div>
                          
                          {subscription.status === 'active' && (() => {
                            const nextCycle = calculateNextCycle(subscription.activeUntil);
                            return (
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">下次週期：</span>
                                <span>{new Date(nextCycle.startDate).toLocaleDateString('zh-TW')} - {new Date(nextCycle.endDate).toLocaleDateString('zh-TW')}</span>
                              </div>
                            );
                          })()}
                          
                          {subscription.status === 'inactive' && subscription.accumulatedPoints && (
                            <div className="text-red-600 font-medium">
                              停用期間累積 {subscription.accumulatedPoints} P 無法提領
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 手機版：按鈕在下方靠右 */}
                      <div className="md:hidden flex justify-end gap-2 mt-3 pt-3 border-t">
                        {subscription.status === 'active' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Ban className="h-4 w-4 mr-1" />
                                取消訂閱
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>確認取消訂閱</AlertDialogTitle>
                                <AlertDialogDescription>
                                  您確定要取消「{subscription.serviceProviderName}」的訂閱嗎？
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              
                              <div className="mt-3 space-y-2 text-sm">
                                <div>• 將在 {subscription.activeUntil} 到期時停止顯示</div>
                                <div>• 相關推薦 Point 將無法提領</div>
                                <div>• 您可以隨時繼續訂閱此服務者</div>
                              </div>
                              
                              <AlertDialogFooter>
                                <AlertDialogCancel>返回</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleCancelSubscription(subscription.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  確認取消
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {subscription.status === 'cancelled' && (
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleResumeSubscription(subscription.id)}
                          >
                            <PlayCircle className="h-4 w-4 mr-1" />
                            繼續訂閱
                          </Button>
                        )}

                        {subscription.status === 'inactive' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="default" size="sm">
                                <PlayCircle className="h-4 w-4 mr-1" />
                                重新啟用
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>重新啟用訂閱</AlertDialogTitle>
                                <AlertDialogDescription>
                                  重新啟用「{subscription.serviceProviderName}」的訂閱
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              
                              <div className="mt-4 bg-muted p-4 rounded-lg space-y-3">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">訂閱方案</span>
                                  <span className="font-medium">年繳方案（唯一方案）</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">起始日期</span>
                                  <span className="font-medium">{new Date().toLocaleDateString('zh-TW')}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">累積 Points</span>
                                  <span className="font-medium text-orange-600">清零（{subscription.accumulatedPoints || 0} P）</span>
                                </div>
                                <div className="border-t pt-3 flex justify-between">
                                  <span className="font-semibold">付款金額</span>
                                  <span className="text-xl font-bold text-primary">${YEARLY_PRICE.toLocaleString()}</span>
                                </div>
                              </div>
                              
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleReactivateSubscription(subscription.id)}>
                                  確認付款 ${YEARLY_PRICE.toLocaleString()}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}