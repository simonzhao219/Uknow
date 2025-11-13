import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { UserContext } from '../App';
import { Plus, Calendar, CreditCard, Settings, AlertTriangle, RefreshCw } from 'lucide-react';
import { mockRoommates } from '../data/mockData';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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
  accumulatedRPoints?: number;
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
  const [reactivationOption, setReactivationOption] = useState<'restart' | 'payback'>('restart');
  const [changePlanTarget, setChangePlanTarget] = useState<'monthly' | 'yearly'>('monthly');

  // 模擬訂閱資料
  const getSubscriptions = (): SubscriptionData[] => {
    const userRoommates = mockRoommates.filter(r => r.userId === user?.id);
    
    return userRoommates.map(roommate => ({
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
      accumulatedRPoints: roommate.id === '3' ? 1500 : undefined,
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

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
  const suspendedSubscriptions = subscriptions.filter(s => s.status === 'suspended');

  const handleCancelSubscription = (subscriptionId: string) => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    alert(`訂閱已取消\n室友：${subscription?.roommateName}\n取消日期：${new Date().toLocaleDateString('zh-TW')}\n注意：取消後室友將在當期結束時停止顯示`);
  };

  const handleChangePlan = (subscriptionId: string, newPlan: 'monthly' | 'yearly') => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    const newPrice = newPlan === 'yearly' ? 1188 : 129;
    const currentPlan = subscription?.plan === 'yearly' ? '年繳' : '月繳';
    const newPlanText = newPlan === 'yearly' ? '年繳' : '月繳';
    
    alert(`訂閱方案已更改\n室友：${subscription?.roommateName}\n從 ${currentPlan} 更改為 ${newPlanText}\n新價格：$${newPrice}\n變更將在下一個計費週期生效`);
    
    setSubscriptions(subs => 
      subs.map(s => 
        s.id === subscriptionId 
          ? { ...s, plan: newPlan }
          : s
      )
    );
  };

  const handleReactivateSubscription = (subscriptionId: string, option: 'restart' | 'payback') => {
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    
    if (option === 'restart') {
      alert(`訂閱重新激活成功！\n室友：${subscription?.roommateName}\n選擇：重新開始訂閱\n累積的 ${subscription?.accumulatedRPoints} R點已清零\n新的訂閱週期從今日開始`);
    } else {
      alert(`訂閱重新激活成功！\n室友：${subscription?.roommateName}\n選擇：補繳欠費\n補繳金額：$${subscription?.unpaidAmount}\n保留累積的 ${subscription?.accumulatedRPoints} R點`);
    }

    setSubscriptions(subs => 
      subs.map(s => 
        s.id === subscriptionId 
          ? { ...s, status: 'active' as const, suspendedDate: undefined, unpaidAmount: undefined }
          : s
      )
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">訂閱管理</h1>
          <p className="text-muted-foreground">管理您的室友刊登訂閱與付款設定</p>
        </div>
        <Button asChild>
          <Link to="/roommates/create">
            <Plus className="h-4 w-4 mr-2" />
            新增室友訂閱
          </Link>
        </Button>
      </div>

      {/* 訂閱統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">總訂閱數</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{subscriptions.length}</div>
            <p className="text-sm text-muted-foreground">已訂閱的室友</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">活躍訂閱</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{activeSubscriptions.length}</div>
            <p className="text-sm text-muted-foreground">正常計費中</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">停用訂閱</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{suspendedSubscriptions.length}</div>
            <p className="text-sm text-muted-foreground">已暫停</p>
          </CardContent>
        </Card>
      </div>

      {/* 停用訂閱警告 */}
      {suspendedSubscriptions.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            您有 {suspendedSubscriptions.length} 個室友訂閱處於停用狀態。停用期間，相關推薦碼產生的R點無法提領。
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
              開始刊登您的專業服務室友，建立第一個訂閱
            </p>
            <Button asChild>
              <Link to="/roommates/create">
                <Plus className="h-4 w-4 mr-2" />
                新增第一個室友
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
                            <Dialog>
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
                                      <SelectItem value="monthly">月繳方案 - $129/月</SelectItem>
                                      <SelectItem value="yearly">年繳方案 - $1188/年 (省$360)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  
                                  <div className="text-sm text-muted-foreground">
                                    目前方案：{subscription.plan === 'yearly' ? '年繳 $1188/年' : '月繳 $129/月'}
                                    <br />
                                    變更將在下一個計費週期生效
                                  </div>
                                </div>

                                <DialogFooter>
                                  <Button 
                                    onClick={() => handleChangePlan(subscription.id, changePlanTarget)}
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
                                    <br /><br />
                                    <strong>注意：</strong>
                                    <ul className="list-disc list-inside mt-2 space-y-1">
                                      <li>取消後此室友將在當期結束時停止顯示</li>
                                      <li>相關推薦R點將無法提領</li>
                                      <li>您可以重新訂閱此室友</li>
                                    </ul>
                                  </AlertDialogDescription>
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
                                            • 放棄累積的 {subscription.accumulatedRPoints} R點<br />
                                            • 月繳：$129/月
                                          </div>
                                        </Label>
                                      </div>
                                    </div>

                                    {/* 補繳選項 */}
                                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                                      <RadioGroupItem value="payback" id="payback" className="mt-1" />
                                      <div className="flex-1">
                                        <Label htmlFor="payback" className="cursor-pointer">
                                          <div className="font-medium">補繳欠費並保留R點</div>
                                          <div className="text-sm text-muted-foreground mt-1">
                                            • 補繳停用期間費用：${subscription.unpaidAmount}<br />
                                            • 保留累積的 {subscription.accumulatedRPoints} R點<br />
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
                                    ? '重新開始訂閱 $129' 
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
                            停用期間累積 {subscription.accumulatedRPoints} R點無法提領
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">付款方式：</span>
                          <span>{subscription.paymentMethod.brand} ****{subscription.paymentMethod.last4}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">方案費用：</span>
                          <span className="font-medium">
                            {subscription.plan === 'yearly' ? '$1188/年' : '$129/月'}
                          </span>
                        </div>
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