import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Trophy, Calendar, Target, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
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
} from '../ui/alert-dialog';
import { useNotification } from '../notifications/NotificationContext';

interface TaskCompletion {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  taskId: string;
  taskType: 'consecutive_referral' | 'monthly_yearly_referral';
  taskTitle: string;
  completedDate: string;
  rewardAmount: number;
  status: 'pending' | 'approved' | 'rejected';
  details: any;
  verificationData: any;
}

export function TaskManagement() {
  const { showSuccess, showWarning } = useNotification();
  
  // 模擬任務完成紀錄
  const getTaskCompletions = (): TaskCompletion[] => {
    return [
      {
        id: 'completion_1',
        userId: 'user_1',
        userName: '張小明',
        userEmail: 'zhang@example.com',
        taskId: 'task_1',
        taskType: 'consecutive_referral',
        taskTitle: '連續推薦達人',
        completedDate: '2024-08-01',
        rewardAmount: 1000,
        status: 'pending',
        details: {
          consecutiveMonths: 12,
          totalReferrals: 18,
          monthlyBreakdown: [
            { month: '2023-09', referrals: 2 },
            { month: '2023-10', referrals: 1 },
            { month: '2023-11', referrals: 3 },
            { month: '2023-12', referrals: 1 },
            { month: '2024-01', referrals: 2 },
            { month: '2024-02', referrals: 1 },
            { month: '2024-03', referrals: 1 },
            { month: '2024-04', referrals: 2 },
            { month: '2024-05', referrals: 1 },
            { month: '2024-06', referrals: 2 },
            { month: '2024-07', referrals: 1 },
            { month: '2024-08', referrals: 1 }
          ]
        },
        verificationData: {
          verified: true,
          verifiedBy: 'system',
          verificationDate: '2024-08-01'
        }
      },
      {
        id: 'completion_2',
        userId: 'user_2',
        userName: '李小華',
        userEmail: 'li@example.com',
        taskId: 'task_2',
        taskType: 'monthly_yearly_referral',
        taskTitle: '年繳推薦王',
        completedDate: '2024-07-31',
        rewardAmount: 1000,
        status: 'approved',
        details: {
          month: '2024-07',
          yearlyReferrals: 10,
          referralDates: [
            '2024-07-02', '2024-07-05', '2024-07-08', '2024-07-12', '2024-07-15',
            '2024-07-18', '2024-07-22', '2024-07-25', '2024-07-28', '2024-07-30'
          ]
        },
        verificationData: {
          verified: true,
          verifiedBy: 'admin_001',
          verificationDate: '2024-08-01'
        }
      },
      {
        id: 'completion_3',
        userId: 'user_3',
        userName: '王大成',
        userEmail: 'wang@example.com',
        taskId: 'task_2',
        taskType: 'monthly_yearly_referral',
        taskTitle: '年繳推薦王',
        completedDate: '2024-08-15',
        rewardAmount: 1000,
        status: 'pending',
        details: {
          month: '2024-08',
          yearlyReferrals: 12,
          referralDates: [
            '2024-08-01', '2024-08-03', '2024-08-05', '2024-08-07', '2024-08-09',
            '2024-08-11', '2024-08-13', '2024-08-14', '2024-08-15', '2024-08-16',
            '2024-08-17', '2024-08-18'
          ]
        },
        verificationData: {
          verified: true,
          verifiedBy: 'system',
          verificationDate: '2024-08-15'
        }
      }
    ];
  };

  const [taskCompletions, setTaskCompletions] = useState<TaskCompletion[]>(getTaskCompletions());

  const handleApproveTask = (completionId: string) => {
    const completion = taskCompletions.find(c => c.id === completionId);
    
    setTaskCompletions(completions =>
      completions.map(comp =>
        comp.id === completionId
          ? { ...comp, status: 'approved' as const }
          : comp
      )
    );
    
    showSuccess(
      '已核發任務獎勵',
      `使用者將收到通知並可前往領取獎勵`,
      [
        `使用者：${completion?.userName}`,
        `任務：${completion?.taskTitle}`,
        `獎勵：${completion?.rewardAmount} P`
      ]
    );
  };

  const handleRejectTask = (completionId: string) => {
    const completion = taskCompletions.find(c => c.id === completionId);
    
    setTaskCompletions(completions =>
      completions.map(comp =>
        comp.id === completionId
          ? { ...comp, status: 'rejected' as const }
          : comp
      )
    );
    
    showWarning(
      '已拒絕任務申請',
      `使用者將收到拒絕通知`,
      [
        `使用者：${completion?.userName}`,
        `任務：${completion?.taskTitle}`
      ]
    );
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${year}年${month}月`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline">待審核</Badge>;
      case 'approved':
        return <Badge variant="default">已核發</Badge>;
      case 'rejected':
        return <Badge variant="destructive">已拒絕</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTaskIcon = (taskType: string) => {
    switch (taskType) {
      case 'consecutive_referral':
        return <Calendar className="h-4 w-4 text-blue-500" />;
      case 'monthly_yearly_referral':
        return <Target className="h-4 w-4 text-green-500" />;
      default:
        return <Trophy className="h-4 w-4" />;
    }
  };

  const pendingCompletions = taskCompletions.filter(c => c.status === 'pending');
  const approvedCompletions = taskCompletions.filter(c => c.status === 'approved');
  const rejectedCompletions = taskCompletions.filter(c => c.status === 'rejected');

  return (
    <div className="space-y-6">
      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-4 w-4" />
              待審核
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{pendingCompletions.length}</div>
            <p className="text-sm text-muted-foreground">需要處理</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              已核發
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{approvedCompletions.length}</div>
            <p className="text-sm text-muted-foreground">本月核發</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">總獎勵金額</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {approvedCompletions.reduce((sum, c) => sum + c.rewardAmount, 0)}
            </div>
            <p className="text-sm text-muted-foreground">Point</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              已拒絕
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{rejectedCompletions.length}</div>
            <p className="text-sm text-muted-foreground">本月拒絕</p>
          </CardContent>
        </Card>
      </div>

      {/* 任務完成列表 */}
      <Card>
        <CardHeader>
          <CardTitle>任務完成記錄</CardTitle>
          <CardDescription>
            管理使用者完成的任務並核發獎勵
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>使用者</TableHead>
                <TableHead>任務</TableHead>
                <TableHead>完成日期</TableHead>
                <TableHead>獎勵金額</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {taskCompletions.map((completion) => (
                <TableRow key={completion.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{completion.userName}</div>
                      <div className="text-sm text-muted-foreground">{completion.userEmail}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTaskIcon(completion.taskType)}
                      <span>{completion.taskTitle}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(completion.completedDate).toLocaleDateString('zh-TW')}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{completion.rewardAmount} P</span>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(completion.status)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {completion.status === 'pending' && (
                        <>
                          {/* 查看詳情 */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                查看詳情
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-2xl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>任務完成詳情</AlertDialogTitle>
                                <AlertDialogDescription>
                                  檢視 {completion.userName} 的任務完成資料
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-sm font-medium">使用者資訊</label>
                                    <div className="text-sm text-muted-foreground">
                                      {completion.userName} ({completion.userEmail})
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium">完成日期</label>
                                    <div className="text-sm text-muted-foreground">
                                      {new Date(completion.completedDate).toLocaleDateString('zh-TW')}
                                    </div>
                                  </div>
                                </div>

                                {completion.taskType === 'consecutive_referral' && (
                                  <div>
                                    <label className="text-sm font-medium">連續推薦記錄</label>
                                    <div className="mt-2 grid grid-cols-6 gap-2">
                                      {completion.details.monthlyBreakdown.map((month: any, index: number) => (
                                        <div key={index} className="text-center p-2 border rounded">
                                          <div className="text-xs text-muted-foreground">
                                            {formatMonth(month.month)}
                                          </div>
                                          <div className="text-sm font-medium flex items-center justify-center gap-1">
                                            <CheckCircle className="h-3 w-3 text-green-500" />
                                            {month.referrals}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-2 text-sm text-muted-foreground">
                                      連續 {completion.details.consecutiveMonths} 個月，總共推薦 {completion.details.totalReferrals} 人
                                    </div>
                                  </div>
                                )}

                                {completion.taskType === 'monthly_yearly_referral' && (
                                  <div>
                                    <label className="text-sm font-medium">月度年繳推薦記錄</label>
                                    <div className="mt-2 space-y-2">
                                      <div className="text-sm text-muted-foreground">
                                        {formatMonth(completion.details.month)} 推薦 {completion.details.yearlyReferrals} 個年繳方案
                                      </div>
                                      <div className="grid grid-cols-5 gap-1 text-xs">
                                        {completion.details.referralDates.map((date: string, index: number) => (
                                          <div key={index} className="p-1 bg-green-50 rounded text-center">
                                            {new Date(date).toLocaleDateString('zh-TW')}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <label className="text-sm font-medium">系統驗證</label>
                                  <div className="text-sm text-muted-foreground">
                                    <CheckCircle className="h-4 w-4 text-green-500 inline mr-1" />
                                    已通過系統自動驗證 ({new Date(completion.verificationData.verificationDate).toLocaleDateString('zh-TW')})
                                  </div>
                                </div>
                              </div>

                              <AlertDialogFooter>
                                <AlertDialogCancel>關閉</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleApproveTask(completion.id)}>
                                  核發獎勵
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          {/* 核發按鈕 */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="default">
                                核發
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>確認核發任務獎勵</AlertDialogTitle>
                                <AlertDialogDescription>
                                  確定要核發給 {completion.userName} 的任務獎勵嗎？
                                  <br /><br />
                                  任務：{completion.taskTitle}
                                  <br />
                                  獎勵金額：{completion.rewardAmount} P
                                  <br /><br />
                                  核發後使用者將收到通知，並可前往任務頁面領取獎勵。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleApproveTask(completion.id)}>
                                  確認核發
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          {/* 拒絕按鈕 */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                拒絕
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>確認拒絕任務申請</AlertDialogTitle>
                                <AlertDialogDescription>
                                  確定要拒絕 {completion.userName} 的任務申請嗎？
                                  <br /><br />
                                  任務：{completion.taskTitle}
                                  <br />
                                  獎勵金額：{completion.rewardAmount} P
                                  <br /><br />
                                  拒絕後使用者將收到通知，此操作無法復原。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRejectTask(completion.id)}>
                                  確認拒絕
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}

                      {completion.status === 'approved' && (
                        <Badge variant="secondary">已處理</Badge>
                      )}

                      {completion.status === 'rejected' && (
                        <Badge variant="destructive">已拒絕</Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}