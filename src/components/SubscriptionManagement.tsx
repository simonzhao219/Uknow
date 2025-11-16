import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { UserContext } from '../App';
import { Plus, Calendar, CreditCard, Settings, AlertTriangle, RefreshCw } from 'lucide-react';
import { mockServiceProviders } from '../data/mockData';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { useNotification } from './notifications/NotificationContext';
import { MONTHLY_PRICE, YEARLY_PRICE } from '../utils/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// TODO: Backend API 端點規劃
// GET /make-server-5c6718b9/subscriptions?userId={userId} - 獲取使用者的所有訂閱
// PUT /make-server-5c6718b9/subscriptions/{subscriptionId}/cancel - 取消訂閱
// PUT /make-server-5c6718b9/subscriptions/{subscriptionId}/change-plan - 更改訂閱方案
// PUT /make-server-5c6718b9/subscriptions/{subscriptionId}/reactivate - 重新激活訂閱

interface SubscriptionData {
  id: string;
  roommateId: string;
  roommateName: string;
  plan: 'monthly' | 'yearly';
  status: 'active' | 'suspended' | 'expired';
  startDate: string;
  endDate: string;
  nextBillingDate: string;
  suspendedDate?: string;
  unpaidAmount?: number;
  accumulatedPoints?: number;
  paymentMethod: {
    type: 'credit_card';
    last4: string;
    brand: string;
    expiryMonth: number;
    expiryYear: number;
  };
}

export function SubscriptionManagement() {
  const { user } = useContext(UserContext);
  const { showSuccess, showWarning } = useNotification();
  const [reactivationOption, setReactivationOption] = useState<'restart' | 'payback'>('restart');
  const [changePlanTarget, setChangePlanTarget] = useState<'monthly' | 'yearly'>('monthly');
  const [changePlanDialogOpen, setChangePlanDialogOpen] = useState<string | null>(null);

  // 模擬訂閱資料
  const getSubscriptions = (): SubscriptionData[] => {
    const userServiceProviders = mockServiceProviders.filter(r => r.userId === user?.id);
    
    return userServiceProviders.map(roommate => ({
      id: `sub_${roommate.id}`,
      roommateId: roommate.id,
      roommateName: roommate.name,
      plan: roommate.id === '2' ? 'yearly' : 'monthly',
      status: roommate.id === '3' ? 'suspended' : 'active',
      startDate: roommate.createdAt,
      endDate: roommate.id === '2' ? 
        new Date(new Date(roommate.createdAt).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] :
        new Date(new Date(roommate.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      nextBillingDate: roommate.id === '2' ? 
        new Date(new Date(roommate.createdAt).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] :
        new Date(new Date(roommate.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      suspendedDate: roommate.id === '3' ? '2024-06-01' : undefined,
      unpaidAmount: roommate.id === '3' ? 258 : undefined,
      accumulatedPoints: roommate.id === '3' ? 1500 : undefined,
      paymentMethod: {
        type: 'credit_card',
        last4: roommate.id === '1' ? '4567' : roommate.id === '2' ? '8901' : '2345',
        brand: roommate.id === '1' ? 'Visa' : roommate.id === '2' ? 'MasterCard' : 'JCB',
        expiryMonth: 12,
        expiryYear: 2026
      }
    }));
  };

  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>(getSubscriptions());

  // TODO: 頁面載入時從 backend 獲取訂閱資料
  // useEffect(() => {
  //   const fetchSubscriptions = async () => {
  //     try {
  //       const response = await fetch(
  //         `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/subscriptions?userId=${user?.id}`,
  //         {
  //           headers: {
  //             'Authorization': `Bearer ${publicAnonKey}`
  //           }
  //         }
  //       );
  //       const data = await response.json();
  //       setSubscriptions(data.subscriptions);
  //     } catch (error) {
  //       console.error('獲取訂閱資料失敗:', error);
  //     }
  //   };
  //   
  //   if (user?.id) {
  //     fetchSubscriptions();
  //   }
  // }, [user?.id]);

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
  const suspendedSubscriptions = subscriptions.filter(s => s.status === 'suspended');

  const handleCancelSubscription = (subscriptionId: string) => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    showWarning(
      '訂閱已取消',
      `服務者「${subscription?.roommateName}」的訂閱已成功取消`,
      [
        `取消日期：${new Date().toLocaleDateString('zh-TW')}`,
        '取消後此服務者將在當期結束時停止顯示',
        '相關推薦 Point 將無法提領',
        '您可以隨時重新訂閱此服務者'
      ]
    );
    
    // TODO: 將取消訂閱寫入 backend
    // try {
    //   await fetch(
    //     `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/subscriptions/${subscriptionId}/cancel`,
    //     {
    //       method: 'PUT',
    //       headers: {
    //         'Authorization': `Bearer ${publicAnonKey}`,
    //         'Content-Type': 'application/json'
    //       },
    //       body: JSON.stringify({
    //         userId: user?.id,
    //         cancelDate: new Date().toISOString()
    //       })
    //     }
    //   );
    // } catch (error) {
    //   console.error('取消訂閱失敗:', error);
    // }
  };

  const handleChangePlan = (subscriptionId: string, newPlan: 'monthly' | 'yearly') => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    const newPrice = newPlan === 'yearly' ? YEARLY_PRICE : MONTHLY_PRICE;
    const currentPlan = subscription?.plan === 'yearly' ? '年繳' : '月繳';
    const newPlanText = newPlan === 'yearly' ? '年繳' : '月繳';
    
    showSuccess(
      '訂閱方案已更改',
      `服務者「${subscription?.roommateName}」的訂閱方案已成功更改`,
      [
        `從 ${currentPlan} 更改為 ${newPlanText}`,
        `新價格：$${newPlan === 'yearly' ? YEARLY_PRICE.toLocaleString() : MONTHLY_PRICE}/${newPlan === 'yearly' ? '年' : '月'}`,
        '變更將在下一個計費週期生效'
      ]
    );
    
    setSubscriptions(subs => 
      subs.map(s => 
        s.id === subscriptionId 
          ? { ...s, plan: newPlan }
          : s
      )
    );
    
    // TODO: 將方案變更寫入 backend
    // try {
    //   await fetch(
    //     `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/subscriptions/${subscriptionId}/change-plan`,
    //     {
    //       method: 'PUT',
    //       headers: {
    //         'Authorization': `Bearer ${publicAnonKey}`,
    //         'Content-Type': 'application/json'
    //       },
    //       body: JSON.stringify({
    //         userId: user?.id,
    //         newPlan: newPlan,
    //         changeDate: new Date().toISOString()
    //       })
    //     }
    //   );
    // } catch (error) {
    //   console.error('更改方案失敗:', error);
    // }
  };

  const handleReactivateSubscription = (subscriptionId: string, option: 'restart' | 'payback') => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    
    if (option === 'restart') {
      showSuccess(
        '訂閱重新激活成功！',
        `服務者「${subscription?.roommateName}」的訂閱已重新激活`,
        [
          '選擇：重新開始訂閱',
          `累積的 ${subscription?.accumulatedPoints} P已清零`,
          '新的訂閱週期從今日開始',
          `月繳方案：$${MONTHLY_PRICE}/月`
        ]
      );
    } else {
      showSuccess(
        '訂閱重新激活成功！',
        `服務者「${subscription?.roommateName}」的訂閱已重新激活`,
        [
          '選擇：補繳欠費',
          `補繳金額：$${subscription?.unpaidAmount}`,
          `保留累積的 ${subscription?.accumulatedPoints} P`,
          '已恢復原有訂閱週期'
        ]
      );
    }

    setSubscriptions(subs => 
      subs.map(s => 
        s.id === subscriptionId 
          ? { ...s, status: 'active' as const, suspendedDate: undefined, unpaidAmount: undefined }
          : s
      )
    );
    
    // TODO: 將重新激活訂閱寫入 backend
    // try {
    //   await fetch(
    //     `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/subscriptions/${subscriptionId}/reactivate`,
    //     {
    //       method: 'PUT',
    //       headers: {
    //         'Authorization': `Bearer ${publicAnonKey}`,
    //         'Content-Type': 'application/json'
    //       },
    //       body: JSON.stringify({
    //         userId: user?.id,
    //         reactivationOption: option,
    //         reactivationDate: new Date().toISOString()
    //       })
    //     }
    //   );
    // } catch (error) {
    //   console.error('重新激活訂閱失敗:', error);
    // }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">訂閱管理</h1>
          <p className="text-muted-foreground">管理您的服務者刊登訂閱與付款設定</p>
        </div>
        <Button asChild>
          <Link to="/service-providers/create">
            <Plus className="h-4 w-4 mr-2" />
            刊登新服務
          </Link>
        </Button>
      </div>

      {/* 停用訂閱警告 */}
      {suspendedSubscriptions.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            您有 {suspendedSubscriptions.length} 個服務者訂閱處於停用狀態。停用期間，相關推薦碼產生的Point無法提領。
            請重新激活訂閱或聯繫客服了解詳情。
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
          {subscriptions.map((subscription) => (
            <Card key={subscription.id}>
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* 訂閱基本資訊 */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">{subscription.roommateName}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={subscription.plan === 'yearly' ? 'default' : 'secondary'}>
                            {subscription.plan === 'yearly' ? '年繳方案' : '月繳方案'}
                          </Badge>
                          <Badge variant={subscription.status === 'active' ? 'default' : 'destructive'}>
                            {subscription.status === 'active' ? '活躍中' : '已停用'}
                          </Badge>
                          {subscription.suspendedDate && (
                            <Badge variant="outline">
                              停用日期：{subscription.suspendedDate}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {subscription.status === 'active' && (
                          <>
                            {/* 更改方案 */}
                            <Dialog open={changePlanDialogOpen === subscription.id} onOpenChange={(open) => setChangePlanDialogOpen(open ? subscription.id : null)}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  更改方案
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                  <DialogTitle>更改訂閱方案</DialogTitle>
                                  <DialogDescription>
                                    為「{subscription.roommateName}」選擇新的訂閱方案
                                  </DialogDescription>
                                </DialogHeader>
                                
                                <div className="space-y-4">
                                  <Select 
                                    value={changePlanTarget} 
                                    onValueChange={(value: 'monthly' | 'yearly') => setChangePlanTarget(value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="monthly">月繳方案 - ${MONTHLY_PRICE}/月</SelectItem>
                                      <SelectItem value="yearly">年繳方案 - ${YEARLY_PRICE.toLocaleString()}/年 (省${MONTHLY_PRICE * 12 - YEARLY_PRICE})</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  
                                  <div className="text-sm text-muted-foreground">
                                    目前方案：{subscription.plan === 'yearly' ? `年繳 $${YEARLY_PRICE.toLocaleString()}/年` : `月繳 $${MONTHLY_PRICE}/月`}
                                    <br />
                                    變更將在下一個計費週期生效
                                  </div>
                                </div>

                                <DialogFooter>
                                  <Button 
                                    onClick={() => {
                                      handleChangePlan(subscription.id, changePlanTarget);
                                      setChangePlanDialogOpen(null);
                                    }}
                                    className="w-full"
                                    disabled={changePlanTarget === subscription.plan}
                                  >
                                    確認更改方案
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            {/* 取消訂閱 */}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  取消訂閱
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>確認取消訂閱</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    您確定要取消「{subscription.roommateName}」的訂閱嗎？
                                  </AlertDialogDescription>
                                  <div className="text-sm text-muted-foreground">
                                    <strong>注意：</strong>
                                    <ul className="list-disc list-inside mt-2 space-y-1">
                                      <li>取消後此服務者將在當期結束時停止顯示</li>
                                      <li>相關推薦Point將無法提領</li>
                                      <li>您可以重新訂閱此服務者</li>
                                    </ul>
                                  </div>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleCancelSubscription(subscription.id)}>
                                    確認取消訂閱
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}

                        {subscription.status === 'suspended' && (
                          /* 重新激活訂閱 */
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="default" size="sm">
                                <RefreshCw className="h-4 w-4 mr-1" />
                                重新激活
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                              <DialogHeader>
                                <DialogTitle>重新激活訂閱</DialogTitle>
                                <DialogDescription>
                                  選擇重新激活「{subscription.roommateName}」訂閱的方式
                                </DialogDescription>
                              </DialogHeader>
                              
                              <div className="space-y-4">
                                <RadioGroup value={reactivationOption} onValueChange={(value: 'restart' | 'payback') => setReactivationOption(value)}>
                                  <div className="space-y-4">
                                    {/* 重新開始選項 */}
                                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                                      <RadioGroupItem value="restart" id="restart" className="mt-1" />
                                      <div className="flex-1">
                                        <Label htmlFor="restart" className="cursor-pointer">
                                          <div className="font-medium">重新開始訂閱</div>
                                          <div className="text-sm text-muted-foreground mt-1">
                                            • 從今日開始新的訂閱週期<br />
                                            • 放棄累積的 {subscription.accumulatedPoints} P<br />
                                            • 月繳：${MONTHLY_PRICE}/月
                                          </div>
                                        </Label>
                                      </div>
                                    </div>

                                    {/* 補繳選項 */}
                                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                                      <RadioGroupItem value="payback" id="payback" className="mt-1" />
                                      <div className="flex-1">
                                        <Label htmlFor="payback" className="cursor-pointer">
                                          <div className="font-medium">補繳欠費並保留Point</div>
                                          <div className="text-sm text-muted-foreground mt-1">
                                            • 補繳停用期間費用：${subscription.unpaidAmount}<br />
                                            • 保留累積的 {subscription.accumulatedPoints} P<br />
                                            • 恢復原有訂閱週期
                                          </div>
                                        </Label>
                                      </div>
                                    </div>
                                  </div>
                                </RadioGroup>
                              </div>

                              <DialogFooter>
                                <Button 
                                  onClick={() => handleReactivateSubscription(subscription.id, reactivationOption)}
                                  className="w-full"
                                >
                                  {reactivationOption === 'restart' 
                                    ? `重新開始訂閱 $${MONTHLY_PRICE}` 
                                    : `補繳費用 $${subscription.unpaidAmount}`
                                  }
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </div>

                    {/* 訂閱詳情 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">方案費用：</span>
                          <span className="font-medium">
                            {subscription.plan === 'yearly' ? `$${YEARLY_PRICE.toLocaleString()}/年` : `$${MONTHLY_PRICE}/月`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">訂閱週期：</span>
                          <span>{new Date(subscription.startDate).toLocaleDateString('zh-TW')} - {new Date(subscription.endDate).toLocaleDateString('zh-TW')}</span>
                        </div>
                        {subscription.status === 'active' && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">下次計費：</span>
                            <span>{new Date(subscription.nextBillingDate).toLocaleDateString('zh-TW')}</span>
                          </div>
                        )}
                        {subscription.suspendedDate && (
                          <div className="text-red-600">
                            停用期間累積 {subscription.accumulatedPoints} P無法提領
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 付款提醒 */}
      <Alert>
        <CreditCard className="h-4 w-4" />
        <AlertDescription>
          您的訂閱將自動從指定的付款方式扣款。如需更新付款方式或有任何問題，請聯繫客服。
        </AlertDescription>
      </Alert>
    </div>
  );
}