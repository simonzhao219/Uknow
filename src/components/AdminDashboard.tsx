import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { WithdrawalManagement } from './admin/WithdrawalManagement';
import { MemberManagement } from './admin/MemberManagement';
import { SystemNotifications } from './admin/SystemNotifications';
import { TaskManagement } from './admin/TaskManagement';

export function AdminDashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">平台管理</h1>
        <p className="text-muted-foreground">管理 Uknow 平台的所有功能</p>
      </div>

      <Tabs defaultValue="withdrawals" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="withdrawals">獎金提領管理</TabsTrigger>
          <TabsTrigger value="tasks">任務獎勵管理</TabsTrigger>
          <TabsTrigger value="members">會員管理</TabsTrigger>
          <TabsTrigger value="notifications">系統通知</TabsTrigger>
        </TabsList>

        <TabsContent value="withdrawals">
          <WithdrawalManagement />
        </TabsContent>

        <TabsContent value="tasks">
          <TaskManagement />
        </TabsContent>

        <TabsContent value="members">
          <MemberManagement />
        </TabsContent>

        <TabsContent value="notifications">
          <SystemNotifications />
        </TabsContent>
      </Tabs>
    </div>
  );
}